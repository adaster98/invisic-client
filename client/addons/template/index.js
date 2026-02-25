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

  window.KloakAddons.registerAddon({
    // --- 1. METADATA ---
    id: ADDON_ID,
    name: "Developer Template",
    description:
      "A complete boilerplate showing how to use toggles, UI settings, and specific file storage.",

    // --- 2. LIFECYCLE HOOKS ---
    // Fires instantly when the user toggles the switch ON
    onEnable: () => {
      console.log(`[${ADDON_ID}] Addon Enabled!`);

      /**
       * NEW: KloakAddonAPI Usage
       * Use the API to access user identity and authentication keys.
       * Always wrap logic needing this data in the onReady callback.
       */
      if (window.KloakAddonAPI) {
        window.KloakAddonAPI.onReady((api) => {
          console.log(`[${ADDON_ID}] API Ready!`);
          console.log(`[${ADDON_ID}] User ID:`, api.userID);
          console.log(`[${ADDON_ID}] Auth Hash:`, api.xHash);

          // You can also access the full user profile
          if (api.userProfile) {
            console.log(`[${ADDON_ID}] Username:`, api.userProfile.username);
          }

          // These keys are required for making authenticated RPC calls
          // api.apiKey
          // api.authToken

          /**
           * NEW: File System API
           * Every addon has its own isolated folder.
           * You can read, write, list and delete files here securely.
           */
          const testFile = "hello.txt";
          const testData = "Hello from the FS API!";

          api.fs
            .write(ADDON_ID, testFile, testData)
            .then(() => {
              console.log(`[${ADDON_ID}] Successfully wrote to ${testFile}`);
              return api.fs.read(ADDON_ID, testFile);
            })
            .then((content) => {
              console.log(`[${ADDON_ID}] Read from ${testFile}:`, content);
            })
            .catch((err) => {
              console.error(`[${ADDON_ID}] FS Error:`, err);
            });
        });
      }
    },

    // Fires instantly when the user toggles the switch OFF
    onDisable: () => {
      console.log(`[${ADDON_ID}] Addon Disabled!`);
    },

    // --- 3. SETTINGS MENU ---
    renderSettings: async (container) => {
      // A. Show a quick loading message
      container.innerHTML = `<p style="color: #949494; text-align: center;">Loading settings...</p>`;

      // B. Fetch this specific addon's config.json safely
      let config = {};
      try {
        // NEW WAY (Recommended): Use the KloakAddonAPI settings provider
        if (window.KloakAddonAPI && window.KloakAddonAPI.settings) {
          config = await window.KloakAddonAPI.settings.get(ADDON_ID);
        }
        // OLD WAY: Direct Electron IPC (still works!)
        else if (window.electronAPI && window.electronAPI.getAddonConfig) {
          const savedConfig = await window.electronAPI.getAddonConfig(ADDON_ID);
          if (savedConfig) config = savedConfig;
        }
      } catch (err) {
        console.error(`[${ADDON_ID}] Failed to load config:`, err);
      }

      // C. Set default values if the config is empty (first time launch)
      const currentText = config.customText || "Default String";
      const isFeatureEnabled = config.enableFeature === true ? "checked" : "";

      // D. Draw the UI
      container.innerHTML = `
            <div style="color: #E0E0E0; display: flex; flex-direction: column; gap: 16px;">
            <p style="margin: 0; color: #a1a1aa;">Modify these inputs to see how state is saved to your local folder.</p>

            <div>
            <label style="font-size: 11px; color: #71717a; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Custom String</label>
            <input id="tpl-text-input" type="text" value="${currentText}" style="width: 100%; padding: 10px; background: #18181b; border: 1px solid #27272a; border-radius: 6px; color: white; margin-top: 6px; box-sizing: border-box; outline: none; transition: border 0.2s;">
            </div>

            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; color: #E0E0E0; user-select: none;">
            <input id="tpl-checkbox" type="checkbox" ${isFeatureEnabled} style="cursor: pointer; width: 16px; height: 16px; accent-color: #10b981;">
            Enable Secret Feature
            </label>

            <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px; padding-top: 16px; border-top: 1px solid #27272a;">
            <button id="tpl-save-btn" style="background: #10b981; color: #000; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: opacity 0.2s;">Save Changes</button>
            <span id="tpl-saved-msg" style="color: #10b981; font-size: 13px; font-weight: 500; opacity: 0; transition: opacity 0.2s;">✓ Saved to config.json</span>
            </div>
            </div>
            `;

      // E. Handle the Save Event
      const saveBtn = container.querySelector("#tpl-save-btn");
      const savedMsg = container.querySelector("#tpl-saved-msg");
      const textInput = container.querySelector("#tpl-text-input");
      const checkboxInput = container.querySelector("#tpl-checkbox");

      // Add a nice hover effect to the input
      textInput.addEventListener(
        "focus",
        () => (textInput.style.borderColor = "#10b981"),
      );
      textInput.addEventListener(
        "blur",
        () => (textInput.style.borderColor = "#27272a"),
      );

      saveBtn.addEventListener("click", () => {
        // Update our config object in memory
        config.customText = textInput.value;
        config.enableFeature = checkboxInput.checked;

        // Send it back through the secure bridge to write to the hard drive
        if (window.KloakAddonAPI && window.KloakAddonAPI.settings) {
          window.KloakAddonAPI.settings.set(ADDON_ID, config);

          // Trigger notice
          savedMsg.style.opacity = "1";
          setTimeout(() => (savedMsg.style.opacity = "0"), 2000);
        } else if (window.electronAPI && window.electronAPI.saveAddonConfig) {
          window.electronAPI.saveAddonConfig({
            addonId: ADDON_ID,
            data: config,
          });

          // Trigger the "Saved!" UI feedback
          savedMsg.style.opacity = "1";
          setTimeout(() => (savedMsg.style.opacity = "0"), 2000);
        }
      });
    },
  });
})();
