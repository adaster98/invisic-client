class InvisicAddonManager {
  constructor() {
    this.addons = [];
    this.states = {};
    this.isActive = false;

    if (window.electronAPI && window.electronAPI.log)
      window.electronAPI.log("Invisic Addons: Initialising Manager...");
    this.init();
  }

  async init() {
    // App store data cache
    this._storeCache = null;
    this._storeCacheTime = 0;
    this._activeUserId = null;

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
      if (window.electronAPI && window.electronAPI.getActiveUserId) {
        this._activeUserId = await window.electronAPI.getActiveUserId();
      }
      if (window.electronAPI && window.electronAPI.getAddonStates) {
        this.states = await window.electronAPI.getAddonStates(this._activeUserId);
      }
      if (window.electronAPI && window.electronAPI.getLocalVersions) {
        this.localVersions = await window.electronAPI.getLocalVersions();
      }
    } catch (e) {
      if (window.electronAPI && window.electronAPI.log)
        window.electronAPI.log(`Invisic Addons ERROR in init: ${e.message}`);
      this.states = {};
      this.localVersions = {};
    }
  }

  registerAddon(addon) {
    const NATIVE_IDS = ["stealth-mode", "dm-folders", "quick-edit"];
    if (NATIVE_IDS.includes(addon.id)) return;
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
    const addonPane = document.getElementById("invisic-addon-pane");

    if (!logOutBtn) {
      this.isActive = false;
      if (addonPane) addonPane.classList.remove("active");
      return;
    }

    const nav = logOutBtn.closest("nav");
    if (!nav) return;
    if (document.getElementById("invisic-nav-addons")) return;

    const addonBtn = document.createElement("button");
    addonBtn.id = "invisic-nav-addons";
    addonBtn.className =
      "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
    addonBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plug w-4 h-4"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>Addons`;

    const appearanceBtn = document.createElement("button");
    appearanceBtn.id = "invisic-nav-appearance";
    appearanceBtn.className =
      "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
    appearanceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/><path d="M14.5 17.5 4.5 15"/></svg>Themes`;

    const invisicSettingsBtn = document.createElement("button");
    invisicSettingsBtn.id = "invisic-nav-client-settings";
    invisicSettingsBtn.className =
      "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
    invisicSettingsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>Invisic Settings`;

    let settingsModal = nav.closest('[role="dialog"]') || document.body;
    if (window.getComputedStyle(settingsModal).position === "static")
      settingsModal.style.position = "relative";

    if (!addonPane) {
      const newPane = document.createElement("div");
      newPane.id = "invisic-addon-pane";
      settingsModal.appendChild(newPane);
    }

    // Insert before the divider (if present), otherwise before logout
    const divider = nav.querySelector('[role="none"]');
    if (divider) {
      nav.insertBefore(addonBtn, divider);
      nav.insertBefore(appearanceBtn, divider);
      nav.insertBefore(invisicSettingsBtn, divider);
    } else {
      nav.insertBefore(addonBtn, logOutBtn);
      nav.insertBefore(appearanceBtn, logOutBtn);
      nav.insertBefore(invisicSettingsBtn, logOutBtn);
    }

    const NAV_INACTIVE =
      "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
    const NAV_ACTIVE =
      "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors bg-primary text-primary-foreground";

    addonBtn.addEventListener("click", (e) => {
      e.preventDefault();
      appearanceBtn.className = NAV_INACTIVE;
      invisicSettingsBtn.className = NAV_INACTIVE;
      this.activateAddonTab(
        nav,
        addonBtn,
        document.getElementById("invisic-addon-pane"),
      );
    });

    appearanceBtn.addEventListener("click", (e) => {
      e.preventDefault();
      addonBtn.className = NAV_INACTIVE;
      invisicSettingsBtn.className = NAV_INACTIVE;
      this.activateAppearanceTab(
        nav,
        appearanceBtn,
        document.getElementById("invisic-addon-pane"),
      );
    });

    invisicSettingsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      addonBtn.className = NAV_INACTIVE;
      appearanceBtn.className = NAV_INACTIVE;
      this.activateInvisicSettingsTab(
        nav,
        invisicSettingsBtn,
        document.getElementById("invisic-addon-pane"),
      );
    });

    nav
      .querySelectorAll(
        "button:not(#invisic-nav-addons):not(#invisic-nav-appearance):not(#invisic-nav-client-settings)",
      )
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          if (this.isActive) {
            this.isActive = false;
            document
              .getElementById("invisic-addon-pane")
              .classList.remove("active");
            addonBtn.className = NAV_INACTIVE;
            appearanceBtn.className = NAV_INACTIVE;
            invisicSettingsBtn.className = NAV_INACTIVE;
          }
        });
      });
  }

  activateAppearanceTab(nav, appearanceBtn, addonPane) {
    this.isActive = true;
    const offset = this.getTopOffset();
    addonPane.style.top = `${offset}px`;

    nav.querySelectorAll("button").forEach((btn) => {
      if (
        btn.id !== "invisic-nav-appearance" &&
        !btn.classList.contains("text-destructive")
      ) {
        btn.className =
          "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
      }
    });

    appearanceBtn.className =
      "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors bg-primary text-primary-foreground";
    this.renderThemeUI(addonPane);
    addonPane.classList.add("active");
  }

  async renderThemeUI(container) {
    container.innerHTML = `
      <div class="invisic-esc-wrapper">
        <button id="invisic-addon-close" aria-label="Close" class="invisic-esc-button">
          <div class="invisic-esc-icon-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="invisic-esc-icon"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
          </div>
          <span class="invisic-esc-label">ESC</span>
        </button>
      </div>
      <div class="addon-header-container">
        <h2>Themes</h2>
        <p>Choose a theme to customise the look of Invisic</p>
        <div class="addon-header-actions">
          <button id="theme-open-folder-btn" class="addon-card addon-action-btn" style="flex:0 0 calc(50% - 8px);">
            <div class="addon-action-content">
              <div class="addon-action-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
              </div>
              <div class="addon-action-text-group">
                <h3 class="addon-action-title">Open Folder</h3>
                <p class="addon-action-subtitle">Add user themes</p>
              </div>
            </div>
          </button>
        </div>
      </div>
      <div id="theme-list-area" class="theme-grid-area">
        <p style="color: hsl(var(--muted-foreground)); font-size: 13px;">Loading themes...</p>
      </div>
    `;

    container.querySelector("#invisic-addon-close")?.addEventListener("click", () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    );

    container.querySelector("#theme-open-folder-btn")?.addEventListener("click", () => {
      window.electronAPI?.openUserThemesFolder?.();
    });

    let themes = [];
    try {
      themes = await window.electronAPI.getThemeFiles();
    } catch (e) {
      console.error("[Themes UI] Failed to load themes:", e);
    }

    let saved = "";
    try {
      const config = await window.electronAPI.getFeatureConfig(this._activeUserId);
      saved = config.selectedTheme ?? "";
    } catch (e) {
      console.error("[Themes UI] Failed to load saved theme:", e);
    }

    // Parse HSL values from CSS content
    function parseCSSVar(css, varName) {
      const match = css.match(new RegExp(`--${varName}:\\s*([^;!]+)`));
      return match ? `hsl(${match[1].trim()})` : null;
    }

    function themePreviewColors(css) {
      if (!css) return { bg: "#1a1a1a", card: "#242424", primary: "#6366f1", secondary: "#2a2a2a" };
      return {
        bg: parseCSSVar(css, "background") || "#1a1a1a",
        card: parseCSSVar(css, "card") || "#242424",
        primary: parseCSSVar(css, "primary") || "#6366f1",
        secondary: parseCSSVar(css, "secondary") || "#2a2a2a",
      };
    }

    // Snapshot Kloak default colors from computed styles before any theme overrides them.
    // If a theme is active its CSS vars will be overriding these, so we read the raw
    // computed RGB values and use those as fixed inline colors for the Default tile.
    const cs = getComputedStyle(document.documentElement);
    const defaultColors = {
      bg: cs.getPropertyValue("--background").trim()
        ? `hsl(${cs.getPropertyValue("--background").trim()})` : "#0a0a0a",
      card: cs.getPropertyValue("--card").trim()
        ? `hsl(${cs.getPropertyValue("--card").trim()})` : "#171717",
      primary: cs.getPropertyValue("--primary").trim()
        ? `hsl(${cs.getPropertyValue("--primary").trim()})` : "#f97316",
      secondary: cs.getPropertyValue("--secondary").trim()
        ? `hsl(${cs.getPropertyValue("--secondary").trim()})` : "#262626",
    };
    // If a non-default theme is active, the computed vars reflect that theme.
    // In that case, read the Kloak defaults from the theme file for the default tile
    // by using hardcoded Kloak palette values (dark neutral, orange primary).
    if (saved !== "") {
      defaultColors.bg = "#0a0a0a";
      defaultColors.card = "#171717";
      defaultColors.primary = "#f97316";
      defaultColors.secondary = "#262626";
    }

    function themeCard(filename, label, sublabel, colors, isSelected) {
      return `
        <button type="button" class="theme-tile${isSelected ? " theme-tile-selected" : ""}" data-value="${filename}">
          <div class="theme-tile-preview" style="background:${colors.bg};">
            <div class="theme-tile-sidebar" style="background:${colors.card};"></div>
            <div class="theme-tile-content">
              <div class="theme-tile-bar" style="background:${colors.primary};"></div>
            </div>
          </div>
          <div class="theme-tile-footer">
            <span class="theme-tile-name">${label}</span>
            ${sublabel ? `<span class="theme-tile-filename">${sublabel}</span>` : ""}
          </div>
        </button>`;
    }

    // Pinned entries: None first, then Invisic, then remaining bundled, then user
    const invisicTheme = themes.find((t) => t.bundled && t.filename === "invisic.css");
    const otherBundled = themes.filter((t) => t.bundled && t.filename !== "invisic.css");
    const user = themes.filter((t) => !t.bundled);

    let html = `<div class="theme-grid">`;
    html += themeCard("", "Kloak Default", "", defaultColors, saved === "");
    if (invisicTheme) {
      html += themeCard("invisic.css", "Invisic", "invisic.css", themePreviewColors(invisicTheme.content), saved === "invisic.css");
    }
    otherBundled.forEach((t) => {
      html += themeCard(t.filename, t.name, t.filename, themePreviewColors(t.content), saved === t.filename);
    });
    html += `</div>`;

    if (user.length > 0) {
      html += `<p class="theme-section-label">User Themes</p><div class="theme-grid">`;
      user.forEach((t) => {
        html += themeCard(t.filename, t.name, t.filename, themePreviewColors(t.content), saved === t.filename);
      });
      html += `</div>`;
    }

    const listArea = container.querySelector("#theme-list-area");
    listArea.innerHTML = html;

    listArea.querySelectorAll(".theme-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        listArea.querySelectorAll(".theme-tile").forEach((t) => {
          t.classList.remove("theme-tile-selected");
        });
        tile.classList.add("theme-tile-selected");
        document.dispatchEvent(new CustomEvent("invisic-apply-theme", { detail: tile.dataset.value }));
      });
    });
  }

  activateInvisicSettingsTab(nav, invisicSettingsBtn, addonPane) {
    this.isActive = true;
    const offset = this.getTopOffset();
    addonPane.style.top = `${offset}px`;

    nav.querySelectorAll("button").forEach((btn) => {
      if (
        btn.id !== "invisic-nav-client-settings" &&
        !btn.classList.contains("text-destructive")
      ) {
        btn.className =
          "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
      }
    });

    invisicSettingsBtn.className =
      "w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-md transition-colors bg-primary text-primary-foreground";
    this.renderInvisicSettingsUI(addonPane);
    addonPane.classList.add("active");
  }

  async renderInvisicSettingsUI(container) {
    container.innerHTML = `
      <div class="invisic-esc-wrapper">
        <button id="invisic-addon-close" aria-label="Close" class="invisic-esc-button">
          <div class="invisic-esc-icon-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="invisic-esc-icon"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
          </div>
          <span class="invisic-esc-label">ESC</span>
        </button>
      </div>
      <div class="addon-header-container">
        <h2>Invisic Settings</h2>
        <p>Client configuration and update options</p>
      </div>
      <div id="invisic-client-settings-body">
        <p style="color: hsl(var(--muted-foreground)); font-size: 13px;">Loading...</p>
      </div>
    `;

    container.querySelector("#invisic-addon-close")?.addEventListener("click", () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    );

    let appVersion = "—";
    let clientSettings = { cornerRoundingEnabled: true, cornerRadius: 20 };

    try {
      appVersion = await window.electronAPI.getAppVersion();
    } catch (e) {}
    try {
      const saved = await window.electronAPI.getClientSettings();
      if (saved) {
        if (saved.cornerRoundingEnabled !== undefined) clientSettings.cornerRoundingEnabled = saved.cornerRoundingEnabled;
        if (saved.cornerRadius !== undefined) clientSettings.cornerRadius = saved.cornerRadius;
      }
    } catch (e) {}

    const body = container.querySelector("#invisic-client-settings-body");
    body.innerHTML = `
      <div class="isettings-body">

        <div class="isettings-section-card">
          <div class="isettings-section-header">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-muted-foreground"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            <h3 class="text-sm font-medium">About</h3>
          </div>
          <div class="isettings-inner-row">
            <div>
              <p class="text-sm font-medium">Version</p>
              <p class="text-xs text-muted-foreground" style="margin-top:2px;">Current installed version of Invisic</p>
            </div>
            <span class="isettings-version-badge">v${appVersion}</span>
          </div>
          <div class="isettings-inner-row">
            <div>
              <p class="text-sm font-medium">Updates</p>
              <p class="text-xs text-muted-foreground" style="margin-top:2px;">Check Codeberg for a newer release</p>
            </div>
            <div class="isettings-ctrl-group">
              <button id="invisic-check-update-btn" class="isettings-update-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                Check for Updates
              </button>
            </div>
          </div>
        </div>

        <div class="isettings-section-card">
          <div class="isettings-section-header">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-muted-foreground"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/></svg>
            <h3 class="text-sm font-medium">Window</h3>
          </div>
          <div class="isettings-inner-row">
            <div>
              <p class="text-sm font-medium">Corner Rounding</p>
              <p class="text-xs text-muted-foreground" style="margin-top:2px;">Round the corners of the client window</p>
            </div>
            <button type="button" role="switch" id="invisic-corner-toggle"
              aria-checked="${clientSettings.cornerRoundingEnabled}"
              data-state="${clientSettings.cornerRoundingEnabled ? "checked" : "unchecked"}"
              class="addon-toggle peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:outline-none">
              <span data-state="${clientSettings.cornerRoundingEnabled ? "checked" : "unchecked"}"
                class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"></span>
            </button>
          </div>
          <div class="isettings-inner-row" id="invisic-radius-row" style="${clientSettings.cornerRoundingEnabled ? "" : "opacity:0.4;pointer-events:none;"}">
            <div>
              <p class="text-sm font-medium">Corner Radius</p>
              <p class="text-xs text-muted-foreground" style="margin-top:2px;">Adjust how rounded the corners appear</p>
            </div>
            <div class="isettings-ctrl-group">
              <input type="range" id="invisic-radius-slider" class="invisic-slider" min="0" max="40" step="1" value="${clientSettings.cornerRadius}">
              <span id="invisic-radius-value" class="isettings-radius-value">${clientSettings.cornerRadius}px</span>
              <button id="invisic-radius-reset" class="invisic-btn-secondary" style="font-size:12px;padding:4px 10px;">Reset</button>
            </div>
          </div>
        </div>

      </div>
    `;

    // --- Update Check ---
    const checkBtn = body.querySelector("#invisic-check-update-btn");
    let _updateResetTimer = null;

    const resetCheckBtn = () => {
      checkBtn.textContent = "";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "14"); svg.setAttribute("height", "14");
      svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
      svg.innerHTML = `<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>`;
      checkBtn.appendChild(svg);
      checkBtn.appendChild(document.createTextNode("Check for Updates"));
      checkBtn.disabled = false;
      checkBtn.style.color = "";
      checkBtn.classList.remove("isettings-update-btn--success", "isettings-update-btn--error", "isettings-update-btn--spin");
    };

    const onUpdateStatus = (e) => {
      const detail = e.detail;
      document.removeEventListener("invisic-update-status", onUpdateStatus);
      clearTimeout(_updateResetTimer);
      checkBtn.classList.remove("isettings-update-btn--spin");
      checkBtn.disabled = false;
      if (detail.error) {
        checkBtn.classList.add("isettings-update-btn--error");
        checkBtn.textContent = "Check failed";
      } else if (detail.available) {
        checkBtn.classList.add("isettings-update-btn--success");
        checkBtn.textContent = `Update available: ${detail.version}`;
      } else {
        checkBtn.classList.add("isettings-update-btn--success");
        checkBtn.textContent = "You're up to date!";
      }
      _updateResetTimer = setTimeout(resetCheckBtn, 4000);
    };

    checkBtn.addEventListener("click", () => {
      clearTimeout(_updateResetTimer);
      checkBtn.disabled = true;
      checkBtn.classList.remove("isettings-update-btn--success", "isettings-update-btn--error");
      checkBtn.classList.add("isettings-update-btn--spin");
      checkBtn.textContent = "Checking…";
      document.addEventListener("invisic-update-status", onUpdateStatus);
      window.electronAPI.checkForUpdate();
    });

    // --- Corner Rounding Toggle ---
    const toggle = body.querySelector("#invisic-corner-toggle");
    const radiusRow = body.querySelector("#invisic-radius-row");
    const slider = body.querySelector("#invisic-radius-slider");
    const radiusValue = body.querySelector("#invisic-radius-value");
    const resetBtn = body.querySelector("#invisic-radius-reset");

    const updateSliderFill = (el) => {
      const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
      el.style.setProperty("--range-percent", pct + "%");
    };
    updateSliderFill(slider);

    const applyCornerCSS = (enabled, radius) => {
      const r = enabled ? `${radius}px` : "0px";
      document.documentElement.style.borderRadius = r;
      document.body.style.borderRadius = r;
    };

    toggle.addEventListener("click", async () => {
      const nowEnabled = toggle.getAttribute("aria-checked") !== "true";
      const state = nowEnabled ? "checked" : "unchecked";
      toggle.setAttribute("aria-checked", nowEnabled);
      toggle.setAttribute("data-state", state);
      toggle.querySelector("span").setAttribute("data-state", state);
      radiusRow.style.opacity = nowEnabled ? "" : "0.4";
      radiusRow.style.pointerEvents = nowEnabled ? "" : "none";
      clientSettings.cornerRoundingEnabled = nowEnabled;
      applyCornerCSS(nowEnabled, parseInt(slider.value, 10));
      try {
        await window.electronAPI.saveClientSettings({ cornerRoundingEnabled: nowEnabled, cornerRadius: parseInt(slider.value, 10) });
      } catch (e) {}
    });

    slider.addEventListener("input", () => {
      radiusValue.textContent = `${slider.value}px`;
      updateSliderFill(slider);
    });

    slider.addEventListener("change", async () => {
      const radius = parseInt(slider.value, 10);
      clientSettings.cornerRadius = radius;
      applyCornerCSS(toggle.getAttribute("aria-checked") === "true", radius);
      try {
        await window.electronAPI.saveClientSettings({ cornerRoundingEnabled: toggle.getAttribute("aria-checked") === "true", cornerRadius: radius });
      } catch (e) {}
    });

    resetBtn.addEventListener("click", async () => {
      slider.value = 20;
      radiusValue.textContent = "20px";
      updateSliderFill(slider);
      clientSettings.cornerRadius = 20;
      applyCornerCSS(toggle.getAttribute("aria-checked") === "true", 20);
      try {
        await window.electronAPI.saveClientSettings({ cornerRoundingEnabled: toggle.getAttribute("aria-checked") === "true", cornerRadius: 20 });
      } catch (e) {}
    });
  }

  activateAddonTab(nav, addonBtn, addonPane) {
    this.isActive = true;
    const offset = this.getTopOffset();
    addonPane.style.top = `${offset}px`;

    nav.querySelectorAll("button").forEach((btn) => {
      if (
        btn.id !== "invisic-nav-addons" &&
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
    let modal = document.getElementById("invisic-addon-settings-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "invisic-addon-settings-modal";
      modal.innerHTML = `
            <div class="invisic-modal-container modal-neutral">
                <div class="invisic-modal-header">
                    <div class="invisic-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <div class="invisic-modal-title-group">
                        <h3 id="addon-settings-title" class="invisic-modal-title">Addon Info</h3>
                        <p class="invisic-modal-subtitle">Configuration & Details</p>
                    </div>
                    <button id="addon-settings-close" class="invisic-btn-secondary invisic-modal-close-icon-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
                <div id="addon-settings-content" class="invisic-modal-body mb-0"></div>
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
        <div class="invisic-esc-wrapper">
        <button id="invisic-addon-close" aria-label="Close" class="invisic-esc-button">
          <div class="invisic-esc-icon-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="invisic-esc-icon"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
          </div>
          <span class="invisic-esc-label">ESC</span>
        </button>
        </div>

        <div class="addon-header-container">
        <h2>Addons</h2>
        <p>Manage custom addons and client modifications</p>

        <div class="addon-header-actions">
        <button id="invisic-open-folder" class="addon-card addon-action-btn">
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

        <button id="invisic-get-addons" class="addon-card addon-action-btn">
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
                <button type="button" role="switch" aria-checked="${isEnabled}" data-state="${isEnabled ? "checked" : "unchecked"}" class="addon-toggle peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50" data-id="${addon.id}"><span data-state="${isEnabled ? "checked" : "unchecked"}" class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"></span></button>
                </div>
                </div>
                `;
      });
      html += `</div>`;
    }

    container.innerHTML = html;

    container
      .querySelector("#invisic-open-folder")
      ?.addEventListener("click", () => window.electronAPI.openAddonsFolder());
    container
      .querySelector("#invisic-get-addons")
      ?.addEventListener("click", () => this.openAppStore());
    container
      .querySelector("#invisic-addon-close")
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

        const isNowEnabled = e.currentTarget.getAttribute("aria-checked") !== "true";
        const state = isNowEnabled ? "checked" : "unchecked";
        e.currentTarget.setAttribute("aria-checked", isNowEnabled);
        e.currentTarget.setAttribute("data-state", state);
        const knob = e.currentTarget.querySelector("span");
        if (knob) knob.setAttribute("data-state", state);

        this.states[addonId] = isNowEnabled;
        if (window.electronAPI.log)
          window.electronAPI.log(
            `Invisic Addons: Toggling ${addonId} to ${isNowEnabled}`,
          );
        window.electronAPI.saveAddonState({ addonId, enabled: isNowEnabled, userId: this._activeUserId });

        try {
          if (isNowEnabled && addon.onEnable) addon.onEnable();
          if (!isNowEnabled && addon.onDisable) addon.onDisable();
        } catch (err) {
          if (window.electronAPI.log)
            window.electronAPI.log(
              `Invisic Addons ERROR toggling: ${err.message}`,
            );
        }
      });
    });
  }

  async openAppStore() {
    let storeModal = document.getElementById("invisic-addon-store-modal");
    if (!storeModal) {
      storeModal = document.createElement("div");
      storeModal.id = "invisic-addon-store-modal";
      storeModal.className = "invisic-modal-overlay";
      storeModal.innerHTML = `
            <div class="invisic-modal-container modal-neutral store-modal-container">
                <div class="invisic-modal-header">
                    <div class="invisic-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    </div>
                    <div class="invisic-modal-title-group">
                        <h3 class="invisic-modal-title">Addon Store</h3>
                        <p class="invisic-modal-subtitle">Download from Codeberg</p>
                    </div>
                    <button id="store-close-btn" class="invisic-btn-secondary invisic-modal-close-icon-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
                <div id="store-content" class="invisic-modal-body store-modal-content">
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
          btnHtml = `<button class="store-install-btn invisic-btn-primary store-btn-install" data-id="${id}" data-url="${addon.url}" data-ver="${addon.version}">Install</button>`;
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
            e.target.style.color = "hsl(var(--primary))";
          } else {
            e.target.textContent = "Failed";
            e.target.style.background = "#EB1414";
          }
        });
      });
    } catch (err) {
      content.innerHTML = `<p class="store-error-msg">Failed to load store: ${err.message}</p>`;
    }
  }
}
window.InvisicAddons = new InvisicAddonManager();
