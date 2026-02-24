(async () => {
  const ADDON_ID = "quick-edit";

  // Fetch config once on startup
  let config = { maxMessages: 10 };
  try {
    if (window.electronAPI && window.electronAPI.getAddonConfig) {
      const savedConfig = await window.electronAPI.getAddonConfig(ADDON_ID);
      if (savedConfig && savedConfig.maxMessages) {
        config.maxMessages = parseInt(savedConfig.maxMessages, 10);
      }
    }
  } catch (e) {
    console.error(`[${ADDON_ID}] Failed to load config:`, e);
  }

  let upArrowHandler = null;

  // Register the Addon
  window.KloakAddons.registerAddon({
    id: ADDON_ID,
    name: "Quick Edit",
    description: "Press Up Arrow to instantly edit your last sent message.",

    onEnable: () => {
      let isSearching = false;

      upArrowHandler = async (e) => {
        if (e.key !== "ArrowUp") return;

        const target = e.target;
        const isTextInput =
          target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable;
        if (!isTextInput) return;

        const value =
          target.value !== undefined ? target.value : target.textContent;
        if (value.trim() !== "") return;

        e.preventDefault();
        if (isSearching) return;
        isSearching = true;

        // Grab recent messages based on limit
        const messages = Array.from(
          document.querySelectorAll(
            'div[id^="message-"], div[id^="dm-message-"]',
          ),
        )
          .reverse()
          .slice(0, config.maxMessages);

        for (const msg of messages) {
          // Look for the inline Edit button
          const editBtn = msg.querySelector('button[aria-label="Edit"]');

          if (editBtn) {
            editBtn.click();

            // Wait for React to mount the textarea and grab focus
            let attempts = 0;
            const focusInterval = setInterval(() => {
              attempts++;
              const editBox = msg.querySelector("textarea");

              if (editBox) {
                clearInterval(focusInterval);
                editBox.focus();
                const textLen = editBox.value.length;
                editBox.setSelectionRange(textLen, textLen);

                // Double-tap the focus just in case React tries to steal it back
                setTimeout(() => {
                  editBox.focus();
                  editBox.setSelectionRange(textLen, textLen);
                  // Grab the entire message group wrapper
                  const messageContainer = editBox.closest(".group") || msg;
                  // Scroll the whole block into view
                  messageContainer.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }, 50);
              } else if (attempts > 50) {
                clearInterval(focusInterval); // Give up after 500ms
              }
            }, 10);

            isSearching = false;
            return; // Stop searching
          }
        }

        isSearching = false;
      };

      document.addEventListener("keydown", upArrowHandler, true);
    },

    onDisable: () => {
      if (upArrowHandler) {
        document.removeEventListener("keydown", upArrowHandler, true);
        upArrowHandler = null;
      }
    },

    renderSettings: (container) => {
      container.innerHTML = `
            <div style="color: #E0E0E0; display: flex; flex-direction: column; gap: 16px;">
            <p style="margin: 0; color: #a1a1aa;">Configure how far up the chat the script will search for your last message.</p>
            <div>
            <label style="font-size: 11px; color: #71717a; text-transform: uppercase; font-weight: 700;">Search Limit (Messages)</label>
            <input id="qe-limit-input" type="number" min="1" max="50" value="${config.maxMessages}" style="width: 100%; padding: 10px; background: #18181b; border: 1px solid #27272a; border-radius: 6px; color: white; margin-top: 6px; outline: none;">
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px; padding-top: 16px; border-top: 1px solid #27272a;">
            <button id="qe-save-btn" style="background: #10b981; color: #000; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">Save Changes</button>
            <span id="qe-saved-msg" style="color: #10b981; font-size: 13px; font-weight: 500; opacity: 0; transition: opacity 0.2s;">✓ Saved</span>
            </div>
            </div>
            `;

      container.querySelector("#qe-save-btn").addEventListener("click", () => {
        let newLimit = parseInt(
          container.querySelector("#qe-limit-input").value,
          10,
        );
        if (isNaN(newLimit) || newLimit < 1) newLimit = 10;

        config.maxMessages = newLimit;
        container.querySelector("#qe-limit-input").value = newLimit;

        if (window.electronAPI && window.electronAPI.saveAddonConfig) {
          window.electronAPI.saveAddonConfig({
            addonId: ADDON_ID,
            data: config,
          });
          const msg = container.querySelector("#qe-saved-msg");
          msg.style.opacity = "1";
          setTimeout(() => (msg.style.opacity = "0"), 2000);
        }
      });
    },
  });
})();
