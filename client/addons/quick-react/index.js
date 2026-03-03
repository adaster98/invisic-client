(() => {
  const ADDON_ID = "quick-react";
  const MAINTENANCE_INTERVAL_MS = 60_000;
  const MAX_DISPLAY_EMOJIS = 3;

  let config = {
    memoryDurationDays: 7,
    emojis: {},
  };

  let api = null;
  let hoverHandler = null;
  let maintenanceTimer = null;
  let lastKnownServerID = null;
  let emojiImageCache = new Map();
  let recentEmojiMetadata = new Map();
  let reactionAddedHandler = null;
  let serverChangeHandler = null;
  let emojisLoadedHandler = null;

  // Helpers

  const log = (msg) => {
    console.log(`[${ADDON_ID}] ${msg}`);
    if (window.electronAPI && window.electronAPI.log) {
      window.electronAPI.log(`[${ADDON_ID}] ${msg}`);
    }
  };

  const today = () => new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

  const isCustomEmoji = (raw) => raw.startsWith(":") && raw.endsWith(":");

  // Parse emoji string
  const parseEmoji = (raw) => {
    if (!isCustomEmoji(raw)) {
      return { baseName: raw, serverSuffix: null };
    }
    const crossMatch = raw.match(/^:([^:~]+)~([^:]+):$/);
    if (crossMatch) {
      return { baseName: `:${crossMatch[1]}:`, serverSuffix: crossMatch[2] };
    }
    return { baseName: raw, serverSuffix: null };
  };

  // Build emoji string for RPC
  const buildEmojiString = (baseName, emojiRecord) => {
    if (!isCustomEmoji(baseName)) return baseName;

    const isDM = api && api.currentDMStatus;
    const currentServerID = api ? api.currentServerID : null;

    // In DMs, custom emojis ALWAYS need the server suffix
    if (isDM && emojiRecord.serverName) {
      const inner = baseName.slice(1, -1);
      return `:${inner}~${emojiRecord.serverName}:`;
    }

    // In servers, only add suffix if the emoji is from a different server
    if (
      emojiRecord.serverID &&
      currentServerID &&
      emojiRecord.serverID !== currentServerID
    ) {
      // Strip colons, append ~ServerName, re-wrap
      const inner = baseName.slice(1, -1); // "catyes"
      return `:${inner}~${emojiRecord.serverName}:`;
    }
    return baseName;
  };

  // Config persistence

  const loadConfig = async () => {
    if (!window.KloakAddonAPI) return;
    try {
      const saved = await window.KloakAddonAPI.settings.get(ADDON_ID);
      if (saved) {
        config = { memoryDurationDays: 7, emojis: {}, ...saved };
      }
    } catch (e) {
      console.error(`[${ADDON_ID}] Failed to load config:`, e);
    }
  };

  const saveConfig = () => {
    if (window.KloakAddonAPI) {
      window.KloakAddonAPI.settings.set(ADDON_ID, config);
    }
  };

  // reconcile metadata for misattributed emojis
  const reconcileMetadata = (emojiName, metadata) => {
    let changed = false;
    // Check all records for this emoji name
    for (const [configKey, record] of Object.entries(config.emojis)) {
      if (record.name === emojiName) {
        // If it's on the wrong server or missing metadata
        if (record.serverID !== metadata.serverID || !record.filePath) {
          const correctKey = `${metadata.serverID}|${emojiName}`;

          if (config.emojis[correctKey]) {
            // Already exists on correct server, merge counts and delete old if needed
            if (configKey !== correctKey) {
              config.emojis[correctKey].count += record.count;
              config.emojis[correctKey].date =
                record.date > config.emojis[correctKey].date
                  ? record.date
                  : config.emojis[correctKey].date;
              delete config.emojis[configKey];
              log(
                `Merged misattributed ${emojiName} into correct record ${metadata.serverID}`,
              );
              changed = true;
            }
          } else {
            // New key for correct server
            config.emojis[correctKey] = {
              ...record,
              serverID: metadata.serverID,
              serverName:
                (api &&
                  api._serverMap &&
                  api._serverMap.get(metadata.serverID)) ||
                metadata.serverID,
              emojiID: metadata.emojiID,
              filePath: metadata.filePath,
            };
            delete config.emojis[configKey];
            log(
              `Migrated misattributed ${emojiName} to correct server ${metadata.serverID}`,
            );
            changed = true;
          }
        }
      }
    }
    if (changed) saveConfig();
  };

  // Emoji record management
  const recordEmoji = (rawEmoji) => {
    const isDM = api && api.currentDMStatus;
    const { baseName, serverSuffix } = parseEmoji(rawEmoji);

    let serverID = null;
    let serverName = null;

    // If the emoji has a server suffix, resolve the server ID from it
    if (serverSuffix) {
      serverName = serverSuffix;
      if (api && api._serverMap) {
        for (const [id, name] of api._serverMap.entries()) {
          if (name === serverSuffix) {
            serverID = id;
            break;
          }
        }
      }
    } else {
      // DM filtering: only log if the emoji has a ~ServerName suffix so it can be matched
      if (isDM) {
        log(`Ignoring plain emoji ${rawEmoji} in DMs (no server suffix)`);
        return;
      }
      // In a server with no suffix — use current server context
      serverID = api ? api.currentServerID : null;
      serverName = api ? api.currentServerName : null;
    }

    // Check sniffed metadata first
    if (isCustomEmoji(baseName)) {
      const sniffed = recentEmojiMetadata.get(baseName);
      if (sniffed) {
        // Proactively fix any records that might be misattributed before recording
        reconcileMetadata(baseName, sniffed);

        serverID = sniffed.serverID;
        serverName =
          (api && api._serverMap && api._serverMap.get(serverID)) ||
          serverSuffix ||
          serverName;
        log(`Using sniffed metadata for ${baseName}: server ${serverID}`);
      }
    }

    // Check if there's already a misattributed record for this emoji
    if (isCustomEmoji(baseName)) {
      for (const [key, rec] of Object.entries(config.emojis)) {
        if (
          rec.name === baseName &&
          rec.filePath === null &&
          rec.serverID !== serverID
        ) {
          log(
            `Found existing misattributed record for ${baseName}, will consolidate.`,
          );
        }
      }
    }

    // Generate config key
    const configKey = isCustomEmoji(baseName)
      ? `${serverID || "unknown"}|${baseName}`
      : baseName;

    if (config.emojis[configKey]) {
      config.emojis[configKey].count += 1;
      config.emojis[configKey].date = today();
    } else {
      config.emojis[configKey] = {
        name: baseName,
        serverID: isCustomEmoji(baseName) ? serverID : null,
        serverName: isCustomEmoji(baseName) ? serverName : null,
        date: today(),
        count: 1,
        emojiID: null,
        filePath: null,
      };
    }

    const locName = isCustomEmoji(baseName) ? `on ${serverName}` : "(Standard)";
    log(
      `Recorded emoji ${baseName} ${locName} (count: ${config.emojis[configKey].count})`,
    );
    saveConfig();

    // If this custom emoji is missing image data, fetch server emojis to populate it
    if (
      isCustomEmoji(baseName) &&
      (!config.emojis[configKey].filePath ||
        !config.emojis[configKey].emojiID) &&
      serverID
    ) {
      if (recentEmojiMetadata.has(baseName)) {
        const sniffed = recentEmojiMetadata.get(baseName);
        if (sniffed.serverID === serverID) {
          config.emojis[configKey].emojiID = sniffed.emojiID;
          config.emojis[configKey].filePath = sniffed.filePath;
          saveConfig();
        }
      }
      fetchServerEmojis(serverID);
    }
  };

  // Server emoji metadata — uses centralized API
  const fetchServerEmojis = async (serverID) => {
    if (!api || !api.isReady) {
      log("Cannot fetch server emojis: API not ready");
      return;
    }

    try {
      log(`Fetching server emojis for ${serverID}`);
      const emojiList = await api.emojis.getForServer(serverID);

      if (!Array.isArray(emojiList) || emojiList.length === 0) return;

      log(`Got ${emojiList.length} emojis from server ${serverID}`);

      // Update config records using metadata list
      let updated = false;
      emojiList.forEach((e) => {
        const emojiName = `:${e.name}:`;
        const metadata = { serverID, emojiID: e.id, filePath: e.file_path };

        reconcileMetadata(emojiName, metadata);

        const currentKey = `${serverID}|${emojiName}`;
        if (config.emojis[currentKey]) {
          config.emojis[currentKey].emojiID = e.id;
          config.emojis[currentKey].filePath = e.file_path;
          updated = true;
        }
      });
      if (updated) saveConfig();

      // Ensure images are in browser cache
      await preloadEmojiImages(serverID, emojiList);
    } catch (e) {
      log(`Error fetching server emojis: ${e.message}`);
    }
  };

  // Fetch emoji images — use originalFetch from the API to avoid interception loops
  const preloadEmojiImages = async (serverID, emojiList) => {
    const rawFetch = api?.originalFetch || window.fetch;
    for (const emoji of emojiList) {
      if (!emoji.file_path && !emoji.url) continue;

      const cacheKey = `${serverID}|${emoji.name}`;
      if (emojiImageCache.has(cacheKey)) continue;

      const imageUrl = emoji.url || (api ? api.emojis.getImageUrl(emoji.file_path) : null);
      if (!imageUrl) continue;

      try {
        const resp = await rawFetch(imageUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          emojiImageCache.set(cacheKey, blobUrl);
        }
      } catch (e) {
        // Silently fail — image will use text fallback
      }
    }
  };

  // Ensure top emoji images are cached
  const ensureTopEmojiImages = async () => {
    const rawFetch = api?.originalFetch || window.fetch;
    const topEmojis = getTopEmojis();
    for (const emoji of topEmojis) {
      if (!emoji.filePath || !emoji.serverID) continue;

      const innerName = emoji.name.slice(1, -1);
      const cacheKey = `${emoji.serverID}|${innerName}`;

      if (emojiImageCache.has(cacheKey)) continue;

      const imageUrl = api ? api.emojis.getImageUrl(emoji.filePath) : null;
      if (!imageUrl) continue;

      try {
        log(`Fetching missing image for ${emoji.name} from storage`);
        const resp = await rawFetch(imageUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          emojiImageCache.set(cacheKey, blobUrl);
        }
      } catch (e) {
        // Silently fail
      }
    }
  };

  // Periodic maintenance
  const runMaintenance = () => {
    let changed = false;
    const now = new Date();
    const maxAge = config.memoryDurationDays * 24 * 60 * 60 * 1000;

    // Purge expired emojis
    for (const [name, record] of Object.entries(config.emojis)) {
      const recordDate = new Date(record.date);
      if (now - recordDate > maxAge) {
        log(`Purging expired emoji ${name} (last used: ${record.date})`);
        delete config.emojis[name];
        changed = true;
      }
    }

    // Sync server names from the API's _serverMap
    if (api && api._serverMap) {
      for (const [name, record] of Object.entries(config.emojis)) {
        if (record.serverID && api._serverMap.has(record.serverID)) {
          const currentName = api._serverMap.get(record.serverID);
          if (currentName !== record.serverName) {
            log(
              `Updating server name for ${name}: ${record.serverName} → ${currentName}`,
            );
            record.serverName = currentName;
            changed = true;
          }
        }
      }
    }

    if (changed) saveConfig();
  };

  // Event-based reaction tracking (replaces fetch interceptor)
  const setupEventListeners = () => {
    if (!api || !api.events) return;

    // Track reactions added via any means (native picker or our own buttons)
    reactionAddedHandler = ({ emoji }) => {
      if (emoji) recordEmoji(emoji);
    };
    api.events.on("reactionAdded", reactionAddedHandler);

    // React to server switches (replaces 2-second polling)
    serverChangeHandler = ({ serverID }) => {
      if (serverID && serverID !== lastKnownServerID) {
        lastKnownServerID = serverID;
        log(`Server switch detected: ${serverID}`);
        fetchServerEmojis(serverID);
      }
    };
    api.events.on("serverChange", serverChangeHandler);

    // React to emoji cache updates from centralized API
    emojisLoadedHandler = ({ serverId, emojis }) => {
      if (!Array.isArray(emojis)) return;
      let updated = false;
      emojis.forEach((e) => {
        const emojiName = `:${e.name}:`;
        const metadata = { serverID: serverId, emojiID: e.id, filePath: e.file_path };
        recentEmojiMetadata.set(emojiName, metadata);

        const currentKey = `${serverId}|${emojiName}`;
        if (config.emojis[currentKey]) {
          config.emojis[currentKey].emojiID = e.id;
          config.emojis[currentKey].filePath = e.file_path;
          updated = true;
        }
      });
      if (updated) saveConfig();
    };
    api.events.on("serverEmojisLoaded", emojisLoadedHandler);

    log("Event listeners active");
  };

  const removeEventListeners = () => {
    if (api && api.events) {
      if (reactionAddedHandler) api.events.off("reactionAdded", reactionAddedHandler);
      if (serverChangeHandler) api.events.off("serverChange", serverChangeHandler);
      if (emojisLoadedHandler) api.events.off("serverEmojisLoaded", emojisLoadedHandler);
    }
    reactionAddedHandler = null;
    serverChangeHandler = null;
    emojisLoadedHandler = null;
  };

  // Sorted top emojis
  const getTopEmojis = () => {
    return Object.entries(config.emojis)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, MAX_DISPLAY_EMOJIS)
      .map(([configKey, record]) => ({
        configKey,
        name: record.name,
        ...record,
      }));
  };

  // Send reaction via centralized API
  const sendReaction = async (messageId, emojiName, emojiRecord) => {
    if (!api || !api.isReady) {
      log("Cannot send reaction: API not ready");
      return;
    }

    const emojiString = buildEmojiString(emojiName, emojiRecord);
    log(`Sending reaction ${emojiString} on message ${messageId}`);

    try {
      await api.messages.addReaction(messageId, emojiString);
    } catch (e) {
      log(`Failed to send reaction: ${e.message}`);
    }
  };

  // UI injection
  const injectQuickReactButtons = (hoverMenu, messageNode) => {
    const topEmojis = getTopEmojis();
    if (topEmojis.length === 0) return;

    // Extract message ID from data-message-id on a child element
    const msgEl = messageNode.querySelector("[data-message-id]");
    const msgId = msgEl ? msgEl.getAttribute("data-message-id") : null;
    if (!msgId) return;

    // Find the "Add reaction" button (first button in the hover menu) as our insertion anchor
    const addReactionBtn = hoverMenu.querySelector(
      'button[aria-label="Add reaction"]',
    );
    const insertAnchor = addReactionBtn || hoverMenu.firstChild;

    // Insert buttons in order (highest count first, left to right)
    topEmojis.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.className =
        "quick-moji-btn p-2 rounded-lg bg-transparent hover:bg-muted transition-colors text-muted-foreground hover:text-foreground";
      btn.title = `${emoji.name} (${emoji.count})`;
      btn.type = "button";
      btn.setAttribute("aria-label", `Quick react ${emoji.name}`);

      // Try to render the image (custom emojis), fallback to text (or standard emoji)
      let rendered = false;
      if (isCustomEmoji(emoji.name)) {
        const innerName = emoji.name.slice(1, -1); // strip colons
        const cacheKey = `${emoji.serverID}|${innerName}`;
        const cachedUrl = emojiImageCache.get(cacheKey);

        if (cachedUrl) {
          const img = document.createElement("img");
          img.src = cachedUrl;
          img.alt = emoji.name;
          img.className = "w-4 h-4";
          img.style.cssText =
            "width: 16px; height: 16px; object-fit: contain; display: block;";
          btn.appendChild(img);
          rendered = true;
        }
      }

      if (!rendered) {
        // Text fallback or standard emoji
        const span = document.createElement("span");
        span.textContent = isCustomEmoji(emoji.name)
          ? emoji.name.slice(1, -1)
          : emoji.name;
        span.style.cssText =
          "font-size: 11px; max-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;";
        btn.appendChild(span);
      }

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        sendReaction(msgId, emoji.name, emoji);
      });

      // Insert before the add-reaction button
      if (insertAnchor) {
        hoverMenu.insertBefore(btn, insertAnchor);
      } else {
        hoverMenu.appendChild(btn);
      }
    });

    // Add a divider between quick-react buttons and native buttons
    if (insertAnchor) {
      const divider = document.createElement("div");
      divider.className = "quick-moji-btn w-px h-5 bg-border mx-0.5";
      hoverMenu.insertBefore(divider, insertAnchor);
    }
  };

  // Addon lifecycle
  const startAddon = async () => {
    await loadConfig();
    setupEventListeners();

    // Ensure images for tracked emojis are in memory (covers client restarts)
    await ensureTopEmojiImages();

    // Initial server emoji fetch if we already have a server
    if (api && api.currentServerID) {
      lastKnownServerID = api.currentServerID;
      fetchServerEmojis(api.currentServerID);
    }

    // Periodic maintenance (also re-checks images)
    runMaintenance();
    maintenanceTimer = setInterval(() => {
      runMaintenance();
      ensureTopEmojiImages();
    }, MAINTENANCE_INTERVAL_MS);

    // Hover menu injection
    hoverHandler = (e) => {
      const group = e.target.closest("div.group[data-state]");
      if (!group) return;

      const hoverMenu = group.querySelector("div.absolute.right-2.-top-4");
      if (!hoverMenu || hoverMenu.querySelector(".quick-moji-btn")) return;

      injectQuickReactButtons(hoverMenu, group);
    };
    document.addEventListener("mouseover", hoverHandler);
  };

  const stopAddon = () => {
    removeEventListeners();

    if (hoverHandler) {
      document.removeEventListener("mouseover", hoverHandler);
      hoverHandler = null;
    }
    if (maintenanceTimer) {
      clearInterval(maintenanceTimer);
      maintenanceTimer = null;
    }

    document.querySelectorAll(".quick-moji-btn").forEach((el) => el.remove());

    // Release blob URLs
    for (const url of emojiImageCache.values()) {
      URL.revokeObjectURL(url);
    }
    emojiImageCache.clear();
  };

  // Register addon
  window.KloakAddons.registerAddon({
    id: ADDON_ID,
    name: "Quick React",
    description: "Puts the most recently used emojis in the chat hover menu.",

    onEnable: () => {
      log("Enabled.");
      if (window.KloakAddonAPI) {
        window.KloakAddonAPI.onReady((readyApi) => {
          api = readyApi;
          startAddon();
        });
      } else {
        startAddon();
      }
    },

    onDisable: () => {
      log("Disabled.");
      stopAddon();
    },

    renderSettings: async (container) => {
      await loadConfig();

      const topEmojis = getTopEmojis();
      const emojiListHTML =
        topEmojis.length > 0
          ? topEmojis
              .map(
                (e) =>
                  `<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--kloak-bg-btn);">
                    <span style="color: var(--kloak-text-main); font-size: 13px;">${e.name}</span>
                    <span style="color: var(--kloak-text-sub); font-size: 12px;">${e.count}× · ${e.serverName || "Unknown"}</span>
                  </div>`,
              )
              .join("")
          : '<p style="color: var(--kloak-text-sub); font-size: 13px; margin: 0;">No emojis tracked yet. React to messages to start building your quick list!</p>';

      container.innerHTML = `
        <div class="addon-settings-item">
          <p style="margin: 0 0 12px 0; color: var(--kloak-text-sub); font-size: 13px;">Configure how long (in days) emojis should stay in memory.</p>
          <label class="addon-label">Memory Duration (Days)</label>
          <input id="qm-duration-input" type="number" min="1" max="365" value="${config.memoryDurationDays}" style="width: 100%; padding: 10px; background: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn); border-radius: 6px; color: var(--kloak-text-main); margin-top: 6px; box-sizing: border-box; outline: none;">
        </div>
        <div class="addon-settings-item" style="margin-top: 16px;">
          <label class="addon-label">Tracked Emojis (Top ${MAX_DISPLAY_EMOJIS})</label>
          <div style="margin-top: 8px;">
            ${emojiListHTML}
          </div>
        </div>
        <button id="qm-save-btn" class="addon-btn-save">Save Changes</button>
      `;

      container.querySelector("#qm-save-btn").addEventListener("click", () => {
        let newDuration = parseInt(
          container.querySelector("#qm-duration-input").value,
          10,
        );
        if (isNaN(newDuration) || newDuration < 1) newDuration = 7;
        config.memoryDurationDays = newDuration;
        saveConfig();

        const saveBtn = container.querySelector("#qm-save-btn");
        const originalText = saveBtn.textContent;
        saveBtn.textContent = "✓ Saved";
        setTimeout(() => (saveBtn.textContent = originalText), 2000);
      });
    },
  });
})();
