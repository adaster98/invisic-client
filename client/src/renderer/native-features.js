(async () => {
  // ── Shared feature config ─────────────────────────────────────────────────
  // Single read/write to feature-config.json for all native features.
  let featureConfig = {};
  let _activeUserId = null;
  try {
    _activeUserId = await window.electronAPI?.getActiveUserId?.();
    featureConfig = (await window.electronAPI.getFeatureConfig(_activeUserId)) || {};
  } catch (e) {
    console.error("[Invisic] native-features: failed to load config:", e);
  }

  const saveFeatureConfig = () => {
    window.electronAPI.saveFeatureConfig(featureConfig, _activeUserId).catch((e) =>
      console.error("[Invisic] native-features: failed to save config:", e)
    );
  };

  // ── STEALTH MODE ──────────────────────────────────────────────────────────
  {
    if (featureConfig.stealthEnabled === undefined) featureConfig.stealthEnabled = false;

    const syncSuppressFlag = () => {
      if (window.InvisicAddonAPI) {
        window.InvisicAddonAPI.presence.suppressTyping = featureConfig.stealthEnabled;
      }
    };

    const eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    const updateButtonIcon = (btn) => {
      btn.innerHTML = featureConfig.stealthEnabled ? eyeClosed : eyeOpen;
      btn.style.color = featureConfig.stealthEnabled
        ? "#EB1414"
        : "";
    };

    const injectStealthButton = () => {
      const controls = document.querySelector(
        ".flex.items-center.gap-1.mb-0\\.5.relative"
      );
      if (!controls || document.getElementById("invisic-stealth-btn")) return;

      const stealthBtn = document.createElement("button");
      stealthBtn.id = "invisic-stealth-btn";
      stealthBtn.type = "button";
      stealthBtn.className =
        "p-2 rounded-xl text-muted-foreground hover:bg-muted/50 transition-colors";
      updateButtonIcon(stealthBtn);

      stealthBtn.addEventListener("click", (e) => {
        e.preventDefault();
        featureConfig.stealthEnabled = !featureConfig.stealthEnabled;
        updateButtonIcon(stealthBtn);
        syncSuppressFlag();
        saveFeatureConfig();
      });

      controls.insertBefore(stealthBtn, controls.firstChild);
    };

    // Sync flag on load, then inject when DOM is ready
    syncSuppressFlag();
    injectStealthButton();

    const stealthObserver = new MutationObserver(() => {
      if (!document.getElementById("invisic-stealth-btn")) {
        injectStealthButton();
      }
    });
    stealthObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ── QUICK EDIT ────────────────────────────────────────────────────────────
  {
    if (!featureConfig.quickEdit) featureConfig.quickEdit = {};
    if (featureConfig.quickEdit.maxMessages === undefined)
      featureConfig.quickEdit.maxMessages = 10;

    const maxMessages = () => featureConfig.quickEdit.maxMessages;

    let isSearching = false;

    document.addEventListener(
      "keydown",
      async (e) => {
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

        const messages = Array.from(
          document.querySelectorAll(
            'div[id^="message-"], div[id^="dm-message-"]'
          )
        )
          .reverse()
          .slice(0, maxMessages());

        for (const msg of messages) {
          const editBtn = msg.querySelector('button[aria-label="Edit"]');

          if (editBtn) {
            editBtn.click();

            let attempts = 0;
            const focusInterval = setInterval(() => {
              attempts++;
              const editBox = msg.querySelector("textarea");

              if (editBox) {
                clearInterval(focusInterval);
                editBox.focus();
                const textLen = editBox.value.length;
                editBox.setSelectionRange(textLen, textLen);

                setTimeout(() => {
                  editBox.focus();
                  editBox.setSelectionRange(textLen, textLen);
                  const messageContainer = editBox.closest(".group") || msg;
                  messageContainer.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }, 50);
              } else if (attempts > 50) {
                clearInterval(focusInterval);
              }
            }, 10);

            isSearching = false;
            return;
          }
        }

        isSearching = false;
      },
      true
    );
  }
})();
