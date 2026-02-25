(async () => {
  const ADDON_ID = "quick-react";

  // Fetch config once on startup
  let config = {
    memoryDurationDays: 7,
    emojis: {}, // format: "emoji": { date: "YYYY-MM-DD", count: 1 }
  };

  const emojiCache = {}; // Session-level cache for custom emojis

  try {
    if (window.electronAPI && window.electronAPI.getAddonConfig) {
      const savedConfig = await window.electronAPI.getAddonConfig(ADDON_ID);
      if (savedConfig) {
        if (savedConfig.memoryDurationDays !== undefined) {
          config.memoryDurationDays = parseInt(
            savedConfig.memoryDurationDays,
            10,
          );
        }
        if (savedConfig.emojis) {
          config.emojis = savedConfig.emojis;
        }
      }
    }
  } catch (e) {
    console.error(`[${ADDON_ID}] Failed to load config:`, e);
  }

  // Helper to save config
  const saveConfig = () => {
    if (window.electronAPI && window.electronAPI.saveAddonConfig) {
      window.electronAPI.saveAddonConfig({
        addonId: ADDON_ID,
        data: config,
      });
    }
  };

  // Cleanup old emojis based on memoryDurationDays
  const cleanupOldEmojis = () => {
    const now = new Date();
    let changed = false;
    for (const [emoji, data] of Object.entries(config.emojis)) {
      const emojiDate = new Date(data.date);
      const diffTime = Math.abs(now - emojiDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > config.memoryDurationDays) {
        delete config.emojis[emoji];
        changed = true;
      }
    }
    if (changed) saveConfig();
  };

  cleanupOldEmojis();

  // Helper to record an emoji
  const recordEmoji = (emojiStr) => {
    if (!emojiStr) return;
    const today = new Date().toISOString().split("T")[0];
    if (!config.emojis[emojiStr]) {
      config.emojis[emojiStr] = { date: today, count: 0 };
    }
    config.emojis[emojiStr].date = today;
    config.emojis[emojiStr].count += 1;
    saveConfig();
  };

  // No need for manual header scraping variables anymore
  // KloakAddonAPI provides apiKey and authToken

  // Monkey-patch fetch to intercept reactions and messages
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = args[0];
    const options = args[1] || {};

    // We no longer need to scrape headers manually

    // Call the original fetch
    const response = await originalFetch.apply(this, args);
    const clonedResponse = response.clone();

    // Fire and forget parsing
    (async () => {
      try {
        if (typeof url === "string") {
          if (url.includes("rpc/send_message")) {
            const resData = await clonedResponse.json();
            const items = Array.isArray(resData) ? resData : [resData];
            for (const item of items) {
              if (item && item.content) {
                // Find emojis in message content
                const physicalRegex =
                  /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
                const physicalMatch = item.content.match(physicalRegex);
                if (physicalMatch) {
                  physicalMatch.forEach(recordEmoji);
                }

                const customRegex = /:[a-zA-Z0-9_]+:/g;
                const customMatch = item.content.match(customRegex);
                if (customMatch) {
                  customMatch.forEach(recordEmoji);
                }
              }
            }
          } else if (url.includes("server_emojis")) {
            const resData = await clonedResponse.json();
            if (Array.isArray(resData)) {
              resData.forEach((item) => {
                if (item && item.name && item.file_path) {
                  emojiCache[item.name] = item.file_path;
                }
              });
            }
          } else if (url.includes("rpc/add_reaction")) {
            const resData = await clonedResponse.json();
            const items = Array.isArray(resData) ? resData : [resData];
            for (const item of items) {
              if (item && item.emoji) {
                recordEmoji(item.emoji);
              }
            }
          }
        }
      } catch (err) {
        // Silently ignore parse errors for other endpoints
      }
    })();

    return response;
  };

  // Helper to add a reaction via fetch
  const addReactionToMessage = async (messageId, emojiStr) => {
    const api = window.KloakAddonAPI;
    if (!api || !api.authToken) {
      console.warn(
        `[${ADDON_ID}] Cannot add reaction, authToken missing from API.`,
      );
      return;
    }

    try {
      await originalFetch(
        "https://foquucurnwpqcvgqukpz.supabase.co/rest/v1/rpc/add_reaction",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: api.authToken,
            apiKey: api.apiKey,
            "X-Key-Hash": api.xHash,
          },
          body: JSON.stringify({
            _message_id: messageId,
            _user_id: api.userID,
            _emoji: emojiStr,
          }),
        },
      );
      // Update local count proactively
      recordEmoji(emojiStr);
    } catch (err) {
      console.error(`[${ADDON_ID}] Failed to add reaction`, err);
    }
  };

  // Helper to resolve custom emoji image URL
  const updateEmojiButton = async (btn, emojiStr) => {
    if (!emojiStr.startsWith(":") || !emojiStr.endsWith(":")) return;
    const emojiName = emojiStr.slice(1, -1);

    // 1. Check in-memory cache
    if (emojiCache[emojiName]) {
      const url = `https://foquucurnwpqcvgqukpz.supabase.co/storage/v1/object/public/server-emojis/${emojiCache[emojiName]}`;
      btn.innerHTML = `<img src="${url}" alt="${emojiStr}" style="width: 20px; height: 20px; vertical-align: middle; object-fit: contain;">`;
      return;
    }

    // 2. Check DOM for existing image
    const imgInDom = document.querySelector(
      `img[alt="${emojiStr}"], img[alt="${emojiName}"]`,
    );
    if (imgInDom && imgInDom.src && imgInDom.src.includes("/server-emojis/")) {
      const path = imgInDom.src.split("/server-emojis/")[1];
      emojiCache[emojiName] = path;
      const url = imgInDom.src;
      btn.innerHTML = `<img src="${url}" alt="${emojiStr}" style="width: 20px; height: 20px; vertical-align: middle; object-fit: contain;">`;
      return;
    }

    // 3. Ask Database
    const api = window.KloakAddonAPI;
    if (api && api.apiKey) {
      try {
        const res = await originalFetch(
          `https://foquucurnwpqcvgqukpz.supabase.co/rest/v1/server_emojis?select=name%2Cfile_path&name=eq.${emojiName}`,
          {
            headers: {
              apiKey: api.apiKey,
              Authorization: api.authToken,
            },
          },
        );
        const data = await res.json();
        if (data && data[0] && data[0].file_path) {
          emojiCache[emojiName] = data[0].file_path;
          const url = `https://foquucurnwpqcvgqukpz.supabase.co/storage/v1/object/public/server-emojis/${data[0].file_path}`;
          btn.innerHTML = `<img src="${url}" alt="${emojiStr}" style="width: 20px; height: 20px; vertical-align: middle; object-fit: contain;">`;
        }
      } catch (e) {
        // Silently fail, stays as text
      }
    }
  };

  // UI Injection
  let hoverHandler = null;

  window.KloakAddons.registerAddon({
    id: ADDON_ID,
    name: "Quick React",
    description: "Puts the most recently used emojis in the chat hover menu.",

    onEnable: () => {
      hoverHandler = (e) => {
        // Find if we hovered into a message group
        const group = e.target.closest("div.group[data-state]");
        if (!group) return;

        // Ensure we haven't already injected into this group's hover menu
        const hoverMenu = group.querySelector("div.absolute.right-2.-top-4");
        if (!hoverMenu) return;

        if (hoverMenu.querySelector(".quick-moji-btn")) return; // Already injected

        // Extract message ID
        const messageContentDiv = group.querySelector("[data-message-id]");
        if (!messageContentDiv) return;
        const messageId = messageContentDiv.getAttribute("data-message-id");

        // Get top 3 emojis by count
        const sortedEmojis = Object.entries(config.emojis)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 3)
          .map((e) => e[0]);

        if (sortedEmojis.length === 0) return;

        // Create buttons
        const separator = document.createElement("div");
        separator.className = "w-px h-5 bg-border mx-0.5 quick-moji-btn";

        const buttonsFrag = document.createDocumentFragment();

        sortedEmojis.forEach((emojiStr) => {
          const btn = document.createElement("button");
          btn.className =
            "p-2 rounded-lg bg-transparent hover:bg-muted transition-colors text-muted-foreground hover:text-foreground quick-moji-btn";
          btn.setAttribute("aria-label", `React with ${emojiStr}`);
          btn.setAttribute("title", `React with ${emojiStr}`);
          btn.type = "button";

          if (emojiStr.startsWith(":") && emojiStr.endsWith(":")) {
            btn.innerHTML = `<span style="font-size: 11px; font-weight: 600;">${emojiStr}</span>`;
            updateEmojiButton(btn, emojiStr);
          } else {
            btn.textContent = emojiStr;
          }

          btn.onclick = (event) => {
            event.stopPropagation();
            event.preventDefault();
            addReactionToMessage(messageId, emojiStr);

            // Visual feedback: briefly color the button green or just log
            const origColor = btn.style.color;
            btn.style.color = "#10b981"; // success green
            setTimeout(() => {
              btn.style.color = origColor;
            }, 500);
          };

          buttonsFrag.appendChild(btn);
        });

        buttonsFrag.appendChild(separator);

        // Prepend to hover menu
        hoverMenu.insertBefore(buttonsFrag, hoverMenu.firstChild);
      };

      document.addEventListener("mouseover", hoverHandler);
    },

    onDisable: () => {
      if (hoverHandler) {
        document.removeEventListener("mouseover", hoverHandler);
        hoverHandler = null;
      }

      // Remove injected buttons
      document.querySelectorAll(".quick-moji-btn").forEach((el) => el.remove());
    },

    renderSettings: (container) => {
      container.innerHTML = `
        <div style="color: #E0E0E0; display: flex; flex-direction: column; gap: 16px;">
          <p style="margin: 0; color: #a1a1aa;">Configure how long (in days) emojis should stay in memory for the hover menu.</p>
          <div>
            <label style="font-size: 11px; color: #71717a; text-transform: uppercase; font-weight: 700;">Memory Duration (Days)</label>
            <input id="qm-duration-input" type="number" min="1" max="365" value="${config.memoryDurationDays}" style="width: 100%; padding: 10px; background: #18181b; border: 1px solid #27272a; border-radius: 6px; color: white; margin-top: 6px; outline: none;">
          </div>
          <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px; padding-top: 16px; border-top: 1px solid #27272a;">
            <button id="qm-save-btn" style="background: #10b981; color: #000; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">Save Changes</button>
            <span id="qm-saved-msg" style="color: #10b981; font-size: 13px; font-weight: 500; opacity: 0; transition: opacity 0.2s;">✓ Saved</span>
          </div>
          <div style="margin-top: 16px;">
             <p style="margin: 0; color: #a1a1aa; font-size: 13px;">Currently tracking ${Object.keys(config.emojis).length} emojis.</p>
          </div>
        </div>
      `;

      container.querySelector("#qm-save-btn").addEventListener("click", () => {
        let newDuration = parseInt(
          container.querySelector("#qm-duration-input").value,
          10,
        );
        if (isNaN(newDuration) || newDuration < 1) newDuration = 7;

        config.memoryDurationDays = newDuration;
        container.querySelector("#qm-duration-input").value = newDuration;

        cleanupOldEmojis(); // Clean up immediately when settings change
        saveConfig();

        const msg = container.querySelector("#qm-saved-msg");
        msg.style.opacity = "1";
        setTimeout(() => (msg.style.opacity = "0"), 2000);
      });
    },
  });
})();
