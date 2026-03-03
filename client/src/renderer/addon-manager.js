class KloakAddonManager {
  constructor() {
    this.addons = [];
    this.states = {};
    this.isActive = false;

    if (window.electronAPI && window.electronAPI.log)
      window.electronAPI.log("Kloak Addons: Initializing Manager...");
    this.init();
  }

  async init() {
    // App store data cache
    this._storeCache = null;
    this._storeCacheTime = 0;

    // Register MutationObserver BEFORE any async/await calls so it is always
    // active from the first synchronous tick. If both awaits below were placed
    // first, the observer would not be registered until those IPC round-trips
    // completed — creating a race condition where opening the settings dialog
    // during that window causes the "Addons" button to never appear.
    this._settingsObserver = new MutationObserver(() => {
      this.checkForSettingsMenu();
    });
    this._settingsObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Fallback: if the settings dialog was already open before this observer
    // was registered, inject the button now.
    this.checkForSettingsMenu();

    try {
      if (window.electronAPI && window.electronAPI.getAddonStates) {
        this.states = await window.electronAPI.getAddonStates();
      }
      if (window.electronAPI && window.electronAPI.getLocalVersions) {
        this.localVersions = await window.electronAPI.getLocalVersions();
      }
    } catch (e) {
      if (window.electronAPI && window.electronAPI.log)
        window.electronAPI.log(`Kloak Addons ERROR in init: ${e.message}`);
      this.states = {};
      this.localVersions = {};
    }
  }

  registerAddon(addon) {
    this.addons.push(addon);
    if (this.states[addon.id] === true && addon.onEnable) {
      try {
        addon.onEnable();
      } catch (e) {
        console.error(`Addon ${addon.id} failed:`, e);
      }
    }
  }

  getTopOffset() {
    const banner = document.querySelector(
      ".bg-slate-700.border-b.border-slate-600",
    );
    const bannerHeight = banner ? banner.offsetHeight : 0;
    return 36 + bannerHeight;
  }

  checkForSettingsMenu() {
    // Scan globally for the logout button (same approach that worked originally)
    const buttons = Array.from(document.querySelectorAll("button"));
    const logOutBtn = buttons.find(
      (b) =>
        b.textContent.includes("Log Out") &&
        b.classList.contains("text-destructive"),
    );
    const addonPane = document.getElementById("kloak-addon-pane");

    if (!logOutBtn) {
      this.isActive = false;
      if (addonPane) addonPane.classList.remove("active");
      return;
    }

    const nav = logOutBtn.closest("nav");
    if (!nav) return;
    if (document.getElementById("kloak-nav-addons")) return;

    const addonBtn = document.createElement("button");
    addonBtn.id = "kloak-nav-addons";
    addonBtn.className =
      "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
    addonBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plug w-4 h-4"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>Addons`;

    let settingsModal = nav.closest('[role="dialog"]') || document.body;
    if (window.getComputedStyle(settingsModal).position === "static")
      settingsModal.style.position = "relative";

    if (!addonPane) {
      const newPane = document.createElement("div");
      newPane.id = "kloak-addon-pane";
      settingsModal.appendChild(newPane);
    }

    // Insert before the divider (if present), otherwise before logout
    const divider = nav.querySelector('[role="none"]');
    if (divider) {
      nav.insertBefore(addonBtn, divider);
    } else {
      nav.insertBefore(addonBtn, logOutBtn);
    }

    addonBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.activateAddonTab(
        nav,
        addonBtn,
        document.getElementById("kloak-addon-pane"),
      );
    });
    nav.querySelectorAll("button:not(#kloak-nav-addons)").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.isActive) {
          this.isActive = false;
          document
            .getElementById("kloak-addon-pane")
            .classList.remove("active");
          addonBtn.className =
            "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
        }
      });
    });
  }

  activateAddonTab(nav, addonBtn, addonPane) {
    this.isActive = true;
    const offset = this.getTopOffset();
    addonPane.style.top = `${offset}px`;

    nav.querySelectorAll("button").forEach((btn) => {
      if (
        btn.id !== "kloak-nav-addons" &&
        !btn.classList.contains("text-destructive")
      ) {
        btn.className =
          "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
      }
    });

    addonBtn.className =
      "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors bg-primary text-primary-foreground";
    this.renderAddonUI(addonPane);
    addonPane.classList.add("active");
  }

  openSettingsModal(addon) {
    // Ensure Modal HTML exists
    let modal = document.getElementById("kloak-addon-settings-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "kloak-addon-settings-modal";
      modal.innerHTML = `
            <div class="kloak-modal-container modal-neutral">
                <div class="kloak-modal-header">
                    <div class="kloak-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <div class="kloak-modal-title-group">
                        <h3 id="addon-settings-title" class="kloak-modal-title">Addon Info</h3>
                        <p class="kloak-modal-subtitle">Configuration & Details</p>
                    </div>
                    <button id="addon-settings-close" class="kloak-btn-secondary kloak-modal-close-icon-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
                <div id="addon-settings-content" class="kloak-modal-body mb-0"></div>
            </div>
            `;
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal || e.target.closest("#addon-settings-close"))
          modal.style.display = "none";
      });
    }

    document.getElementById("addon-settings-title").innerText = addon.name;
    const contentBox = document.getElementById("addon-settings-content");
    contentBox.innerHTML = "";

    if (addon.renderSettings) {
      addon.renderSettings(contentBox);
    } else {
      contentBox.innerHTML = `
            <div class="addon-no-settings">
            <div class="addon-no-settings-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </div>
            <h3 class="addon-no-settings-title">${addon.name}</h3>
            <p>${addon.description}</p>
            <p class="addon-no-settings-desc">This addon does not have configurable settings.</p>
            </div>
            `;
    }
    modal.style.display = "flex";
  }

  renderAddonUI(container) {
    let html = `
        <div class="kloak-esc-wrapper">
        <button id="kloak-addon-close" aria-label="Close">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
        <span class="kloak-esc-text">ESC</span>
        </div>

        <div class="addon-header-container">
        <h2>Addons</h2>
        <p>Manage custom addons and client modifications</p>

        <div class="addon-header-actions">
        <button id="kloak-open-folder" class="addon-card addon-action-btn">
        <div class="addon-action-content">
        <div class="addon-action-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
        </div>
        <div class="addon-action-text-group">
        <h3 class="addon-action-title">Open Folder</h3>
        <p class="addon-action-subtitle">Manage installed files</p>
        </div>
        </div>
        </button>

        <button id="kloak-get-addons" class="addon-card addon-action-btn">
        <div class="addon-action-content">
        <div class="addon-action-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        </div>
        <div class="addon-action-text-group">
        <h3 class="addon-action-title">Get More Addons</h3>
        <p class="addon-action-subtitle">Download from Codeberg</p>
        </div>
        </div>
        </button>
        </div>
        </div>
        `;

    if (this.addons.length === 0) {
      html += `<p class="addon-empty-state">No addons found. Click the folder above to get started.</p>`;
    } else {
      html += `<div class="addon-grid">`;
      this.addons.forEach((addon) => {
        const isEnabled = this.states[addon.id] === true;
        const localVersions = this.localVersions || {};
        const ver = localVersions[addon.id] || "9999";

        const iconSVG = addon.renderSettings
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

        html += `
                <div class="addon-card">
                <div class="addon-info">
                <div class="addon-name-wrapper">
                    <h3 class="m-0">${addon.name}</h3>
                    <span class="addon-version-badge">v${ver}</span>
                </div>
                <p title="${addon.description}">${addon.description}</p>
                </div>
                <div class="addon-controls">
                <button class="addon-btn-icon" data-modal="${addon.id}">${iconSVG}</button>
                <div class="addon-toggle ${isEnabled ? "enabled" : ""}" data-id="${addon.id}"></div>
                </div>
                </div>
                `;
      });
      html += `</div>`;
    }

    container.innerHTML = html;

    container
      .querySelector("#kloak-open-folder")
      ?.addEventListener("click", () => window.electronAPI.openAddonsFolder());
    container
      .querySelector("#kloak-get-addons")
      ?.addEventListener("click", () => this.openAppStore());
    container
      .querySelector("#kloak-addon-close")
      ?.addEventListener("click", () =>
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
      );

    container.querySelectorAll(".addon-btn-icon").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const addonId = e.currentTarget.getAttribute("data-modal");
        const addon = this.addons.find((a) => a.id === addonId);
        if (addon) this.openSettingsModal(addon);
      });
    });

    container.querySelectorAll(".addon-toggle").forEach((toggle) => {
      toggle.addEventListener("click", (e) => {
        const addonId = e.currentTarget.getAttribute("data-id");
        const addon = this.addons.find((a) => a.id === addonId);
        if (!addon) return;

        const isNowEnabled = !e.currentTarget.classList.contains("enabled");
        if (isNowEnabled) e.currentTarget.classList.add("enabled");
        else e.currentTarget.classList.remove("enabled");

        this.states[addonId] = isNowEnabled;
        if (window.electronAPI.log)
          window.electronAPI.log(
            `Kloak Addons: Toggling ${addonId} to ${isNowEnabled}`,
          );
        window.electronAPI.saveAddonState({ addonId, enabled: isNowEnabled });

        try {
          if (isNowEnabled && addon.onEnable) addon.onEnable();
          if (!isNowEnabled && addon.onDisable) addon.onDisable();
        } catch (err) {
          if (window.electronAPI.log)
            window.electronAPI.log(
              `Kloak Addons ERROR toggling: ${err.message}`,
            );
        }
      });
    });
  }

  async openAppStore() {
    let storeModal = document.getElementById("kloak-addon-store-modal");
    if (!storeModal) {
      storeModal = document.createElement("div");
      storeModal.id = "kloak-addon-store-modal";
      storeModal.className = "kloak-modal-overlay";
      storeModal.innerHTML = `
            <div class="kloak-modal-container modal-neutral store-modal-container">
                <div class="kloak-modal-header">
                    <div class="kloak-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    </div>
                    <div class="kloak-modal-title-group">
                        <h3 class="kloak-modal-title">Addon Store</h3>
                        <p class="kloak-modal-subtitle">Download from Codeberg</p>
                    </div>
                    <button id="store-close-btn" class="kloak-btn-secondary kloak-modal-close-icon-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
                <div id="store-content" class="kloak-modal-body store-modal-content">
                </div>
            </div>
            `;
      document.body.appendChild(storeModal);
      storeModal.addEventListener("click", (e) => {
        if (e.target === storeModal || e.target.closest("#store-close-btn"))
          storeModal.style.display = "none";
      });
    }

    storeModal.style.display = "flex";
    const content = document.getElementById("store-content");
    content.innerHTML = `<p class="store-loading-msg">Connecting to Codeberg repository...</p>`;

    try {
      // Use cached store data if fresh (5 min TTL)
      const now = Date.now();
      if (!this._storeCache || now - this._storeCacheTime > 300000) {
        const storeResponse = await window.electronAPI.fetchStoreData();
        if (!storeResponse.success) throw new Error(storeResponse.error);
        this._storeCache = storeResponse.data;
        this._storeCacheTime = now;
      }
      const storeData = this._storeCache;
      let localVersions = await window.electronAPI.getLocalVersions();

      let html = "";
      for (const [id, addon] of Object.entries(storeData)) {
        const localVer = localVersions[id];
        let btnHtml = "";

        if (!localVer) {
          btnHtml = `<button class="store-install-btn kloak-btn-primary store-btn-install" data-id="${id}" data-url="${addon.url}" data-ver="${addon.version}">Install</button>`;
        } else if (localVer === "9999") {
          btnHtml = `<button disabled class="store-btn-custom">Custom</button>`;
        } else if (localVer !== addon.version) {
          btnHtml = `<button class="store-install-btn store-btn-update" data-id="${id}" data-url="${addon.url}" data-ver="${addon.version}">Update (v${addon.version})</button>`;
        } else {
          btnHtml = `<button disabled class="store-btn-installed">Installed</button>`;
        }

        html += `
                <div class="store-addon-card">
                <div class="store-addon-info">
                <h4 class="store-addon-title">${addon.name} <span class="addon-version-badge">v${addon.version}</span></h4>
                <p class="store-addon-desc">${addon.description}</p>
                </div>
                <div class="store-addon-action">${btnHtml}</div>
                </div>
                `;
      }
      content.innerHTML = html;

      content.querySelectorAll(".store-install-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const id = e.target.getAttribute("data-id");
          const url = e.target.getAttribute("data-url");
          const ver = e.target.getAttribute("data-ver");
          e.target.textContent = "Installing...";
          e.target.disabled = true;
          const result = await window.electronAPI.installAddon({
            addonId: id,
            zipUrl: url,
            version: ver,
          });
          if (result.success) {
            e.target.textContent = "Installed! Restart App";
            e.target.style.color = "var(--kloak-accent-success)";
          } else {
            e.target.textContent = "Failed";
            e.target.style.background = "var(--kloak-accent-destructive)";
          }
        });
      });
    } catch (err) {
      content.innerHTML = `<p class="store-error-msg">Failed to load store: ${err.message}</p>`;
    }
  }
}
window.KloakAddons = new KloakAddonManager();
