/**
 * ==========================================
 * KLOAK ADDON TEMPLATE
 * ==========================================
 * Folder: /addons/template/
 * File: index.js
 * Drop this folder into your addons directory to
 * see a complete, working boilerplate!
 */

(() => {
  // 1. DEFINE THE ID HERE! (This must exactly match your folder name)
  const ADDON_ID = "template";

  // ── State ──────────────────────────────────────────────────────────────────
  // Keep references to event handlers so you can remove them in onDisable.
  let serverChangeHandler = null;
  let channelChangeHandler = null;
  let messageEditedHandler = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  const enable = () => {
    const api = window.KloakAddonAPI;
    if (!api) return;

    /**
     * onReady fires once auth and profile data are available.
     * Always wrap API-dependent logic here.
     */
    api.onReady((api) => {
      console.log(`[${ADDON_ID}] Logged in as:`, api.userProfile.username);
      console.log(`[${ADDON_ID}] User ID:`, api.userID);
      console.log(`[${ADDON_ID}] Current server:`, api.currentServerName, `(${api.currentServerID})`);
      console.log(`[${ADDON_ID}] In DMs:`, api.currentDMStatus);

      // ── Events ─────────────────────────────────────────────────────────────
      // Subscribe to server switches.
      serverChangeHandler = ({ serverID, serverName, previousServerID }) => {
        console.log(`[${ADDON_ID}] Switched to server: ${serverName} (${serverID})`);
      };
      api.events.on("serverChange", serverChangeHandler);

      // Subscribe to channel switches.
      channelChangeHandler = ({ channelID }) => {
        console.log(`[${ADDON_ID}] Switched to channel: ${channelID}`);
      };
      api.events.on("channelChange", channelChangeHandler);

      // Subscribe to message edits (includes previous content — useful for loggers).
      messageEditedHandler = ({ messageId, previousContent, newContent, editedBy }) => {
        console.log(`[${ADDON_ID}] Message ${messageId} edited by ${editedBy}`);
        console.log(`  Before: ${previousContent}`);
        console.log(`  After:  ${newContent}`);
      };
      api.events.on("messageEdited", messageEditedHandler);

      // ── RPC ────────────────────────────────────────────────────────────────
      // Make an authenticated RPC call without constructing headers manually.
      // api.rpc() throws if not authenticated or if the server returns an error.
      api
        .rpc("get_user_profile_secure", {
          _target_user_id: api.userID,
          _requesting_user_id: api.userID,
        })
        .then((data) => {
          const profile = Array.isArray(data) ? data[0] : data;
          console.log(`[${ADDON_ID}] Profile via RPC:`, profile);
        })
        .catch((err) => {
          console.error(`[${ADDON_ID}] RPC error:`, err.message);
        });

      // ── Message cache ──────────────────────────────────────────────────────
      // Read already-loaded messages for the current channel.
      if (api.currentChannelID) {
        const messages = api.messages.getCached(api.currentChannelID);
        console.log(`[${ADDON_ID}] ${messages.length} cached messages in current channel`);
      }

      // ── Server emojis ──────────────────────────────────────────────────────
      // Fetch emojis for the current server (cache-first, 60s TTL).
      if (api.currentServerID) {
        api.emojis.getForServer(api.currentServerID).then((emojis) => {
          console.log(`[${ADDON_ID}] ${emojis.length} server emojis`);
          // Each emoji: { id, name, file_path, url }
          // Get a usable image URL: api.emojis.getImageUrl(emoji.file_path)
        });
      }

      // ── User lookup ────────────────────────────────────────────────────────
      // Fetch a user profile by ID (cache-first, 5min TTL, deduped).
      api.users.fetch(api.userID).then((user) => {
        console.log(`[${ADDON_ID}] Fetched user:`, user?.username);
      });

      // ── DM Conversations ───────────────────────────────────────────────────
      // Get cached conversations, or fetch fresh ones.
      const cached = api.conversations.getAll();
      if (cached.length > 0) {
        console.log(`[${ADDON_ID}] ${cached.length} cached DM conversations`);
      } else {
        api.conversations.fetch().then((data) => {
          console.log(`[${ADDON_ID}] Fetched ${data?.length ?? 0} DM conversations`);
        });
      }

      // ── Presence ───────────────────────────────────────────────────────────
      // Suppress the "is typing..." indicator.
      // api.presence.suppressTyping = true;

      // ── File system ────────────────────────────────────────────────────────
      // Every addon has its own isolated directory. Paths are sandboxed.
      const testFile = "hello.txt";
      api.fs
        .write(ADDON_ID, testFile, "Hello from the FS API!")
        .then(() => api.fs.read(ADDON_ID, testFile))
        .then((content) => console.log(`[${ADDON_ID}] Read back:`, content))
        .catch((err) => console.error(`[${ADDON_ID}] FS error:`, err));
    });
  };

  const disable = () => {
    const api = window.KloakAddonAPI;

    // Always remove event listeners in onDisable to avoid memory leaks and
    // stale handlers firing after the addon is toggled off.
    if (api?.events) {
      if (serverChangeHandler) api.events.off("serverChange", serverChangeHandler);
      if (channelChangeHandler) api.events.off("channelChange", channelChangeHandler);
      if (messageEditedHandler) api.events.off("messageEdited", messageEditedHandler);
    }
    serverChangeHandler = null;
    channelChangeHandler = null;
    messageEditedHandler = null;

    console.log(`[${ADDON_ID}] Disabled.`);
  };

  // ── Registration ───────────────────────────────────────────────────────────

  window.KloakAddons.registerAddon({
    id: ADDON_ID,
    name: "Developer Template",
    description:
      "A complete boilerplate showing how to use the KloakAddonAPI: events, RPC, message cache, emojis, file system, and settings.",

    onEnable: enable,
    onDisable: disable,

    // --- Settings menu -------------------------------------------------------
    // Return a populated `container` element. Called when the user opens your
    // addon's settings modal. Can be async.
    renderSettings: async (container) => {
      container.innerHTML = `<p style="color: var(--kloak-text-sub); text-align: center;">Loading settings...</p>`;

      let config = {};
      try {
        config = await window.KloakAddonAPI.settings.get(ADDON_ID);
      } catch (err) {
        console.error(`[${ADDON_ID}] Failed to load config:`, err);
      }

      const currentText = config.customText || "Default String";
      const isFeatureEnabled = config.enableFeature === true ? "checked" : "";

      container.innerHTML = `
        <div class="addon-settings-item">
          <p style="margin: 0; color: var(--kloak-text-sub); font-size: 13px;">Modify these inputs to see how state is saved to your local folder.</p>

          <div style="margin-top: 12px;">
            <label class="addon-label">Custom String</label>
            <input id="tpl-text-input" type="text" value="${currentText}"
              style="width: 100%; padding: 10px; background: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn); border-radius: 6px; color: var(--kloak-text-main); margin-top: 6px; box-sizing: border-box; outline: none; transition: border 0.2s;">
          </div>

          <label class="kloak-checkbox-label" style="user-select: none;">
            <input id="tpl-checkbox" type="checkbox" ${isFeatureEnabled}
              style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--kloak-text-main);">
            Enable Secret Feature
          </label>

          <button id="tpl-save-btn" class="addon-btn-save">Save Changes</button>
        </div>
      `;

      const textInput = container.querySelector("#tpl-text-input");
      const checkboxInput = container.querySelector("#tpl-checkbox");
      const saveBtn = container.querySelector("#tpl-save-btn");

      textInput.addEventListener("focus", () => (textInput.style.borderColor = "var(--kloak-text-main)"));
      textInput.addEventListener("blur", () => (textInput.style.borderColor = "var(--kloak-bg-btn)"));

      saveBtn.addEventListener("click", () => {
        config.customText = textInput.value;
        config.enableFeature = checkboxInput.checked;

        window.KloakAddonAPI.settings.set(ADDON_ID, config);

        const originalText = saveBtn.textContent;
        saveBtn.textContent = "✓ Saved to config.json";
        setTimeout(() => (saveBtn.textContent = originalText), 2000);
      });
    },
  });
})();
