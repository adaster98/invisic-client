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
    try {
      if (window.electronAPI && window.electronAPI.getAddonStates) {
        if (window.electronAPI.log)
          window.electronAPI.log("Kloak Addons: Fetching addon states...");
        this.states = await window.electronAPI.getAddonStates();
      } else {
        if (window.electronAPI && window.electronAPI.log)
          window.electronAPI.log(
            "Kloak Addons WARNING: window.electronAPI.getAddonStates missing!",
          );
        this.states = {};
      }
    } catch (e) {
      if (window.electronAPI && window.electronAPI.log)
        window.electronAPI.log(`Kloak Addons ERROR in init: ${e.message}`);
      this.states = {};
    }
    setInterval(() => this.checkForSettingsMenu(), 500);
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

    nav.insertBefore(addonBtn, logOutBtn);

    let settingsModal = nav.closest('[role="dialog"]') || document.body;
    if (window.getComputedStyle(settingsModal).position === "static")
      settingsModal.style.position = "relative";

    if (!addonPane) {
      const newPane = document.createElement("div");
      newPane.id = "kloak-addon-pane";
      settingsModal.appendChild(newPane);
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
            <div class="addon-settings-box">
            <div class="addon-settings-header">
            <h3 id="addon-settings-title">Addon Info</h3>
            <button id="addon-settings-close" class="addon-btn-icon" style="background:transparent;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
            </div>
            <div id="addon-settings-content" class="addon-settings-content"></div>
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
            <div style="text-align: center; padding: 20px;">
            <div style="background: #262626; display: inline-block; padding: 16px; border-radius: 50%; margin-bottom: 16px; color: #10b981;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </div>
            <h3 style="color: #E0E0E0; margin-bottom: 8px;">${addon.name}</h3>
            <p>${addon.description}</p>
            <p style="margin-top: 16px; font-size: 12px; color: #666;">This addon does not have configurable settings.</p>
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

        <div style="display: flex; gap: 16px; margin-top: 16px; max-width: 600px;">
        <button id="kloak-open-folder" class="addon-card" style="flex: 1; cursor: pointer;">
        <div class="addon-info" style="display: flex; align-items: center; gap: 12px;">
        <div style="color: #a1a1aa; display: flex;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
        </div>
        <div>
        <h3 style="margin: 0; font-size: 14px;">Open Folder</h3>
        <p style="margin: 0; font-size: 12px;">Manage installed files</p>
        </div>
        </div>
        </button>

        <button id="kloak-get-addons" class="addon-card" style="flex: 1; cursor: pointer;">
        <div class="addon-info" style="display: flex; align-items: center; gap: 12px;">
        <div style="color: #a1a1aa; display: flex;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        </div>
        <div>
        <h3 style="margin: 0; font-size: 14px;">Get More Addons</h3>
        <p style="margin: 0; font-size: 12px;">Download from Codeberg</p>
        </div>
        </div>
        </button>
        </div>
        </div>
        `;

    if (this.addons.length === 0) {
      html += `<p style="color: #949494; text-align: center; margin-top: 40px;">No addons found. Click the folder above to get started.</p>`;
    } else {
      html += `<div class="addon-grid">`;
      this.addons.forEach((addon) => {
        const isEnabled = this.states[addon.id] === true;
        const iconSVG = addon.renderSettings
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

        html += `
                <div class="addon-card">
                <div class="addon-info">
                <h3>${addon.name}</h3>
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
            <div class="addon-settings-box" style="width: 600px; max-height: 85vh;">
            <div class="addon-settings-header">
            <h3 style="color: #e0e0e0; display: flex; align-items: center; gap: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            Addon Store
            </h3>
            <button id="store-close-btn" class="addon-btn-icon" style="background:transparent; border:none; cursor:pointer; color:#949494;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            </div>
            <div id="store-content" style="display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding-right: 4px;">
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
    content.innerHTML = `<p style="text-align: center; color: #a1a1aa; padding: 20px;">Connecting to Codeberg repository...</p>`;

    try {
      const storeResponse = await window.electronAPI.fetchStoreData();
      if (!storeResponse.success) throw new Error(storeResponse.error);
      const storeData = storeResponse.data;
      let localVersions = await window.electronAPI.getLocalVersions();

      let html = "";
      for (const [id, addon] of Object.entries(storeData)) {
        const localVer = localVersions[id];
        let btnHtml = !localVer
          ? `<button class="store-install-btn kloak-btn-primary" data-id="${id}" data-url="${addon.url}" data-ver="${addon.version}">Install</button>`
          : localVer !== addon.version
            ? `<button class="store-install-btn" data-id="${id}" data-url="${addon.url}" data-ver="${addon.version}" style="background: #3b82f6; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px;">Update (v${addon.version})</button>`
            : `<button disabled style="background: #27272a; color: #71717a; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: default;">Installed</button>`;

        html += `
                <div style="background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                <div style="flex: 1; min-width: 0;">
                <h4 style="margin: 0 0 4px 0; color: #E0E0E0; font-size: 15px;">${addon.name} <span style="color: #71717a; font-size: 11px; font-weight: normal; margin-left: 6px;">v${addon.version}</span></h4>
                <p style="margin: 0; color: #949494; font-size: 13px; line-height: 1.4;">${addon.description}</p>
                </div>
                <div>${btnHtml}</div>
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
            e.target.style.color = "#10b981";
          } else {
            e.target.textContent = "Failed";
            e.target.style.background = "#ef4444";
          }
        });
      });
    } catch (err) {
      content.innerHTML = `<p style="text-align: center; color: #ef4444; padding: 20px;">Failed to load store: ${err.message}</p>`;
    }
  }
}
window.KloakAddons = new KloakAddonManager();
