(() => {
  const ADDON_ID = "quick-react";
  const SUPABASE_URL = "https://foquucurnwpqcvgqukpz.supabase.co";
  const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/server-emojis`;
  const MAINTENANCE_INTERVAL_MS = 60_000;
  const SERVER_POLL_INTERVAL_MS = 2_000;
  const MAX_DISPLAY_EMOJIS = 3;

  let config = {
    memoryDurationDays: 7,
    emojis: {},
    // emojis format:
    // ":catyes:": { serverID: "uuid", serverName: "Server A", date: "2026-02-27", count: 5, emojiID: "uuid", filePath: "uuid/catyes-uuid.png" }
  };

  let api = null;
  let originalFetch = null;
  let hoverHandler = null;
  let maintenanceTimer = null;
  let serverPollTimer = null;
  let lastKnownServerID = null;
  let pendingEmojiRequests = new Set(); // Track our own server_emojis requests
  let emojiImageCache = new Map(); // name -> blob URL for rendering

  // ── Helpers ──────────────────────────────────────────────────────────────

  const log = (msg) => {
    console.log(`[${ADDON_ID}] ${msg}`);
    if (window.electronAPI && window.electronAPI.log) {
      window.electronAPI.log(`[${ADDON_ID}] ${msg}`);
    }
  };

  const today = () => new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

  /**
   * Parse an emoji string like ":catyes:" or ":catyes~Server B:"
   * Returns { baseName: ":catyes:", serverSuffix: "Server B" | null }
   */
  const parseEmoji = (raw) => {
    // Match :name~Server Name: or just :name:
    const crossMatch = raw.match(/^:([^:~]+)~([^:]+):$/);
    if (crossMatch) {
      return { baseName: `:${crossMatch[1]}:`, serverSuffix: crossMatch[2] };
    }
    return { baseName: raw, serverSuffix: null };
  };

  /**
   * Build the emoji string to send via add_reaction RPC.
   * If we're in a different server than the emoji's home, append ~ServerName.
   */
  const buildEmojiString = (baseName, emojiRecord) => {
    const currentServerID = api ? api.currentServerID : null;
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

  // ── Config persistence ───────────────────────────────────────────────────

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

  // ── Emoji record management ──────────────────────────────────────────────

  /**
   * Record a reaction emoji usage.
   * @param {string} rawEmoji - The raw emoji string from the RPC body, e.g. ":catyes:" or ":catyes~Server B:"
   */
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

    // Composite key: serverID|:emojiName: — distinguishes same-name emojis across servers
    const configKey = `${serverID || "unknown"}|${baseName}`;

    if (config.emojis[configKey]) {
      config.emojis[configKey].count += 1;
      config.emojis[configKey].date = today();
    } else {
      config.emojis[configKey] = {
        name: baseName,
        serverID: serverID,
        serverName: serverName,
        date: today(),
        count: 1,
        emojiID: null,
        filePath: null,
      };
    }

    log(
      `Recorded emoji ${baseName} on ${serverName} (count: ${config.emojis[configKey].count})`,
    );
    saveConfig();

    // If this emoji is missing image data, fetch server emojis to populate it
    if (!config.emojis[configKey].filePath && serverID) {
      fetchServerEmojis(serverID);
    }
  };

  // ── Server emoji metadata fetching ───────────────────────────────────────

  /**
   * Fetch the emoji list for a given server and update config records.
   * Also ensures images are loaded in the browser cache.
   */
  const fetchServerEmojis = async (serverID) => {
    if (!api || !api.apiKey || !api.authToken) {
      log("Cannot fetch server emojis: missing credentials");
      return;
    }

    const url = `${SUPABASE_URL}/rest/v1/server_emojis?select=id%2Cname%2Cfile_path&server_id=eq.${serverID}&order=created_at.asc`;

    // Mark this as our request so the interceptor knows to process it
    const requestID = `qr-${Date.now()}`;
    pendingEmojiRequests.add(requestID);

    try {
      log(`Fetching server emojis for ${serverID}`);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          apikey: api.apiKey,
          Authorization: api.authToken,
          "X-Key-Hash": api.xHash,
          "X-QR-Request": requestID,
        },
      });

      pendingEmojiRequests.delete(requestID);

      if (!response.ok) {
        log(`Server emojis fetch failed: ${response.status}`);
        return;
      }

      const emojiList = await response.json();
      if (!Array.isArray(emojiList)) {
        log("Server emojis response was not an array, ignoring");
        return;
      }

      log(`Got ${emojiList.length} emojis from server ${serverID}`);

      // Build a lookup: name -> { id, file_path }
      const serverEmojiMap = new Map();
      emojiList.forEach((e) => {
        if (e.name && e.id && e.file_path) {
          serverEmojiMap.set(`:${e.name}:`, {
            id: e.id,
            filePath: e.file_path,
          });
        }
      });

      // Update config records that belong to this server
      let updated = false;
      for (const [configKey, record] of Object.entries(config.emojis)) {
        if (record.serverID === serverID && serverEmojiMap.has(record.name)) {
          const info = serverEmojiMap.get(record.name);
          record.emojiID = info.id;
          record.filePath = info.filePath;
          updated = true;
        }
      }
      if (updated) saveConfig();

      // Ensure images are in browser cache
      await preloadEmojiImages(serverID, emojiList);
    } catch (e) {
      pendingEmojiRequests.delete(requestID);
      log(`Error fetching server emojis: ${e.message}`);
    }
  };

  /**
   * Fetch emoji images so they're available in the browser's network cache.
   */
  const preloadEmojiImages = async (serverID, emojiList) => {
    for (const emoji of emojiList) {
      if (!emoji.file_path) continue;

      // Use server-scoped cache key to avoid collisions for same-named emojis
      const cacheKey = `${serverID}|${emoji.name}`;
      if (emojiImageCache.has(cacheKey)) continue;

      const imageUrl = `${STORAGE_BASE}/${emoji.file_path}`;
      try {
        const resp = await fetch(imageUrl);
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

  /**
   * Ensure the top displayed emojis have their images in memory.
   * Called on startup and periodically — covers client restarts where blob URLs are lost.
   */
  const ensureTopEmojiImages = async () => {
    const topEmojis = getTopEmojis();
    for (const emoji of topEmojis) {
      if (!emoji.filePath || !emoji.serverID) continue;

      const innerName = emoji.name.slice(1, -1);
      const cacheKey = `${emoji.serverID}|${innerName}`;

      if (emojiImageCache.has(cacheKey)) continue;

      // Fetch directly from storage
      const imageUrl = `${STORAGE_BASE}/${emoji.filePath}`;
      try {
        log(`Fetching missing image for ${emoji.name} from storage`);
        const resp = await fetch(imageUrl);
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

  // ── Periodic maintenance ─────────────────────────────────────────────────

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

  // ── Fetch interceptor ───────────────────────────────────────────────────

  const setupInterceptor = () => {
    if (!originalFetch) originalFetch = window.fetch;
    const self_originalFetch = originalFetch;
    log(
      `Interceptor setup — wrapping window.fetch (type: ${typeof originalFetch})`,
    );

    window.fetch = async function (...args) {
      const resource = args[0];
      const url =
        typeof resource === "string" ? resource : resource ? resource.url : "";
      const options = args[1] || {};

      // Debug: log any Supabase RPC calls flowing through our interceptor
      if (url.includes("supabase.co/rest/v1/rpc/")) {
        const rpcName = url.split("/rpc/").pop()?.split("?")[0];
        log(`[DEBUG] Intercepted RPC: ${rpcName}`);
      }

      const isAddReaction = url.includes("/rpc/add_reaction");

      // Check if this is a server_emojis request we made (has our header)
      const isOurEmojiRequest =
        url.includes("/rest/v1/server_emojis") &&
        options.headers &&
        options.headers["X-QR-Request"] &&
        pendingEmojiRequests.has(options.headers["X-QR-Request"]);

      // Clean up our custom header before sending so the server doesn't reject it
      if (isOurEmojiRequest && options.headers) {
        delete options.headers["X-QR-Request"];
      }

      const response = await self_originalFetch.apply(this, args);

      // Intercept add_reaction responses
      if (isAddReaction) {
        log(
          `[DEBUG] add_reaction detected! response.ok=${response.ok}, has body=${!!options.body}`,
        );
        if (response.ok) {
          try {
            const body = options.body ? JSON.parse(options.body) : null;
            log(`[DEBUG] add_reaction body: ${JSON.stringify(body)}`);
            if (body && body._emoji) {
              recordEmoji(body._emoji);
            }
          } catch (e) {
            log(`[DEBUG] add_reaction body parse error: ${e.message}`);
          }
        }
      }

      return response;
    };
  };

  const removeInterceptor = () => {
    if (originalFetch) {
      window.fetch = originalFetch;
      originalFetch = null;
    }
  };

  // ── Get top emojis sorted by count ───────────────────────────────────────

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

  // ── Send a reaction via RPC ──────────────────────────────────────────────

  const sendReaction = async (messageId, emojiName, emojiRecord) => {
    if (!api || !api.apiKey || !api.authToken) {
      log("Cannot send reaction: missing credentials");
      return;
    }

    const emojiString = buildEmojiString(emojiName, emojiRecord);
    log(`Sending reaction ${emojiString} on message ${messageId}`);

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_reaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: api.apiKey,
          Authorization: api.authToken,
          "X-Key-Hash": api.xHash,
        },
        body: JSON.stringify({
          _message_id: messageId,
          _user_id: api.userID,
          _emoji: emojiString,
        }),
      });
    } catch (e) {
      log(`Failed to send reaction: ${e.message}`);
    }
  };

  // ── Hover menu UI injection ──────────────────────────────────────────────

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

      // Try to render the image, fallback to text
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
      } else {
        // Text fallback — show emoji name without colons
        const span = document.createElement("span");
        span.textContent = innerName;
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

  // ── Server switch polling ────────────────────────────────────────────────

  const pollServerSwitch = () => {
    if (!api) return;
    const currentID = api.currentServerID;
    if (currentID && currentID !== lastKnownServerID) {
      lastKnownServerID = currentID;
      log(`Server switch detected: ${api.currentServerName} (${currentID})`);
      fetchServerEmojis(currentID);
    }
  };

  // ── Addon lifecycle ──────────────────────────────────────────────────────

  const startAddon = async () => {
    await loadConfig();
    setupInterceptor();
    log("Interceptor active");

    // Ensure images for tracked emojis are in memory (covers client restarts)
    await ensureTopEmojiImages();

    // Initial server emoji fetch if we already have a server
    if (api && api.currentServerID) {
      lastKnownServerID = api.currentServerID;
      fetchServerEmojis(api.currentServerID);
    }

    // Poll for server switches
    serverPollTimer = setInterval(pollServerSwitch, SERVER_POLL_INTERVAL_MS);

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
    removeInterceptor();
    log("Interceptor removed");

    if (hoverHandler) {
      document.removeEventListener("mouseover", hoverHandler);
      hoverHandler = null;
    }
    if (maintenanceTimer) {
      clearInterval(maintenanceTimer);
      maintenanceTimer = null;
    }
    if (serverPollTimer) {
      clearInterval(serverPollTimer);
      serverPollTimer = null;
    }

    document.querySelectorAll(".quick-moji-btn").forEach((el) => el.remove());

    // Release blob URLs
    for (const url of emojiImageCache.values()) {
      URL.revokeObjectURL(url);
    }
    emojiImageCache.clear();
  };

  // ── Register with addon manager ──────────────────────────────────────────

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
