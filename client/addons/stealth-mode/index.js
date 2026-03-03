(function () {
  const ADDON_ID = "stealth-mode";
  let config = {};
  let observer = null;

  const loadConfig = async () => {
    try {
      if (window.electronAPI && window.electronAPI.getAddonConfig) {
        config = await window.electronAPI.getAddonConfig(ADDON_ID);
      }
    } catch (e) {}
    if (config.stealthEnabled === undefined) config.stealthEnabled = false;
  };

  const saveConfig = () => {
    if (window.electronAPI && window.electronAPI.saveAddonConfig) {
      window.electronAPI.saveAddonConfig({ addonId: ADDON_ID, data: config });
    }
  };

  const updateButtonIcon = (btn) => {
    const eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

    btn.innerHTML = config.stealthEnabled ? eyeClosed : eyeOpen;
    btn.style.color = config.stealthEnabled
      ? "var(--kloak-accent-destructive)"
      : "";
  };

  const syncSuppressFlag = () => {
    if (window.KloakAddonAPI) {
      window.KloakAddonAPI.presence.suppressTyping = config.stealthEnabled;
    }
  };

  const injectStealthButton = () => {
    const controls = document.querySelector(
      ".flex.items-center.gap-1.mb-0\\.5.relative",
    );
    if (!controls || document.getElementById("kloak-stealth-btn")) return;

    const stealthBtn = document.createElement("button");
    stealthBtn.id = "kloak-stealth-btn";
    stealthBtn.type = "button";
    stealthBtn.className =
      "p-2 rounded-xl text-muted-foreground hover:bg-muted/50 transition-colors";
    updateButtonIcon(stealthBtn);

    stealthBtn.addEventListener("click", (e) => {
      e.preventDefault();
      config.stealthEnabled = !config.stealthEnabled;
      updateButtonIcon(stealthBtn);
      syncSuppressFlag();
      saveConfig();
    });

    controls.insertBefore(stealthBtn, controls.firstChild);
  };

  // Use MutationObserver instead of setInterval to detect when to inject the button
  const startObserver = () => {
    injectStealthButton();
    observer = new MutationObserver(() => {
      if (!document.getElementById("kloak-stealth-btn")) {
        injectStealthButton();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const stopObserver = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  // Load config before registering (non-blocking)
  loadConfig().then(() => {
    window.KloakAddons.registerAddon({
      id: ADDON_ID,
      name: "Stealth Mode",
      description:
        'Blocks the "User is typing..." indicator from being sent to others.',

      onEnable: () => {
        syncSuppressFlag();
        startObserver();
      },

      onDisable: () => {
        config.stealthEnabled = false;
        syncSuppressFlag();
        saveConfig();
        stopObserver();
        const btn = document.getElementById("kloak-stealth-btn");
        if (btn) btn.remove();
      },
    });
  });
})();
