(() => {
  const ADDON_ID = "quick-translate";

  // Lucide "Languages" icon
  const ICON_TRANSLATE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-languages w-4 h-4"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`;
  const ICON_TRANSLATE_SM = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;opacity:0.5;margin-left:4px;"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`;

  const LANGUAGES = [
    { code: "eng_Latn", name: "English" },
    { code: "spa_Latn", name: "Spanish" },
    { code: "fra_Latn", name: "French" },
    { code: "deu_Latn", name: "German" },
    { code: "rus_Cyrl", name: "Russian" },
    { code: "jpn_Jpan", name: "Japanese" },
    { code: "zho_Hans", name: "Chinese (Simplified)" },
    { code: "ara_Arab", name: "Arabic" },
    { code: "por_Latn", name: "Portuguese" },
    { code: "ita_Latn", name: "Italian" },
    { code: "kor_Hang", name: "Korean" },
    { code: "hin_Deva", name: "Hindi" },
    { code: "tur_Latn", name: "Turkish" },
    { code: "vie_Latn", name: "Vietnamese" },
    { code: "pol_Latn", name: "Polish" },
    { code: "nld_Latn", name: "Dutch" },
    { code: "ukr_Cyrl", name: "Ukrainian" },
    { code: "tha_Thai", name: "Thai" },
    { code: "ind_Latn", name: "Indonesian" },
    { code: "swe_Latn", name: "Swedish" },
  ];

  class QuickTranslateAddon {
    constructor() {
      this.id = ADDON_ID;
      this.name = "Quick Translate";
      this.description = "Translate any message, on-device.";

      this.config = {
        targetLanguage: "eng_Latn",
        translateMode: "selected", // "all" | "selected"
      };

      this._translator = null; // null | 'initializing' | 'ready'
      this._progress = { status: "idle", percent: 0, file: "" };

      this._queue = [];
      this._isProcessing = false;
      this._settingsContainer = null;
      this._cleanup = null;

      this._injectCSS();
      this._listenForBackendEvents();
    }

    // CSS
    _injectCSS() {
      if (document.getElementById("qt-addon-styles")) return;
      const style = document.createElement("style");
      style.id = "qt-addon-styles";
      style.textContent = `
        /* ---- Settings ---- */
        .qt-settings { display: flex; flex-direction: column; gap: 20px; padding: 4px 0; }

        .qt-card {
          background: var(--kloak-bg-secondary, #161616);
          border: 1px solid var(--kloak-border, #2a2a2a);
          border-radius: 12px; padding: 16px;
        }

        .qt-row { display: flex; align-items: center; gap: 12px; }
        .qt-row-sb { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

        .qt-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .qt-dot-off { background: var(--kloak-accent-destructive, #eb1414); box-shadow: 0 0 8px rgba(235,20,20,0.4); }
        .qt-dot-on  { background: var(--kloak-accent-success, #40bf80); box-shadow: 0 0 8px rgba(64,191,128,0.4); }
        .qt-dot-load { background: var(--kloak-accent-warning, #f59e0b); box-shadow: 0 0 8px rgba(245,158,11,0.4); }

        .qt-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--kloak-text-main, #fff); }
        .qt-sub { margin: 0; font-size: 12px; color: var(--kloak-text-sub, #888); line-height: 1.4; }
        .qt-label { font-size: 11px; font-weight: 700; color: var(--kloak-text-sub, #888); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; display: block; }

        .qt-select {
          width: 100%; background: var(--kloak-bg-tertiary, #1a1a1a);
          border: 1px solid var(--kloak-border, #333); color: var(--kloak-text-main, #fff);
          padding: 10px 14px; border-radius: 10px; font-size: 13px;
          appearance: none; cursor: pointer;
        }
        .qt-select:hover { border-color: #444; }

        .qt-progress { margin-top: 10px; width: 100%; height: 4px; background: #222; border-radius: 2px; overflow: hidden; }
        .qt-progress-bar { height: 100%; background: var(--kloak-accent-warning, #f59e0b); transition: width 0.3s ease; }
        .qt-progress-label { margin-top: 4px; font-size: 11px; color: var(--kloak-text-sub, #666); }

        .qt-error-box {
          margin-top: 10px; padding: 10px; border-radius: 8px;
          background: rgba(235,20,20,0.08); border: 1px solid rgba(235,20,20,0.2);
          color: var(--kloak-accent-destructive, #eb1414); font-size: 12px; line-height: 1.4;
        }

        .qt-btn {
          padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 600;
          border: 1px solid var(--kloak-border, #333); cursor: pointer; transition: all 0.15s;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .qt-btn-primary { background: var(--kloak-bg-tertiary, #1a1a1a); color: var(--kloak-text-main, #fff); }
        .qt-btn-primary:hover { background: #222; border-color: #444; }
        .qt-btn-danger { background: rgba(235,20,20,0.1); color: var(--kloak-accent-destructive, #eb1414); border-color: rgba(235,20,20,0.25); }
        .qt-btn-danger:hover { background: rgba(235,20,20,0.2); }
        .qt-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .qt-btn-full { width: 100%; justify-content: center; }

        .qt-radio-group { display: flex; gap: 8px; }
        .qt-radio {
          flex: 1; padding: 10px 14px; border-radius: 10px; text-align: center;
          font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
          border: 1px solid var(--kloak-border, #333);
          background: var(--kloak-bg-tertiary, #1a1a1a);
          color: var(--kloak-text-sub, #888);
        }
        .qt-radio:hover { border-color: #444; }
        .qt-radio.active {
          border-color: var(--kloak-accent-success, #40bf80);
          color: var(--kloak-text-main, #fff);
          background: rgba(64,191,128,0.08);
        }

        .qt-actions { display: flex; gap: 8px; }

        /* ---- Inline translation ---- */
        .qt-translation {
          margin-top: 4px; padding: 4px 0; font-size: 13px; line-height: 1.4;
          color: var(--kloak-text-sub, #aaa);
          display: flex; align-items: flex-start; gap: 4px;
        }
        .qt-translation-icon { flex-shrink: 0; margin-top: 2px; opacity: 0.4; }
        .qt-translation-text { font-style: italic; }
      `;
      document.head.appendChild(style);
    }

    // Backend Event Listener
    _listenForBackendEvents() {
      document.addEventListener("qt-status", (e) => {
        const data = e.detail;
        if (data.status === "downloading") {
          this._translator = "initializing";
          this._progress = {
            status: "downloading",
            percent: data.percent,
            file: data.file,
          };
          this._updateSettingsUI();
        } else if (data.status === "ready") {
          this._translator = "ready";
          this._progress = { status: "ready", percent: 100, file: "" };
          this._updateSettingsUI();
          if (this.config.translateMode === "all") this._translateAllVisible();
        } else if (data.status === "unloaded") {
          this._translator = null;
          this._progress = { status: "idle", percent: 0, file: "" };
          this._removeAllTranslations();
          this._updateSettingsUI();
        } else if (data.status === "error") {
          this._translator = null;
          this._progress = { status: "error", message: data.message };
          this._updateSettingsUI();
        }
      });
    }

    // Lifecycle
    async onEnable() {
      try {
        if (window.electronAPI?.getAddonConfig) {
          const saved = await window.electronAPI.getAddonConfig(ADDON_ID);
          if (saved) this.config = { ...this.config, ...saved };
        }
      } catch (e) {}
      this._setupObserver();
    }

    onDisable() {
      if (this._cleanup) this._cleanup();
      this._removeAllTranslations();
      document.querySelectorAll(".qt-hover-btn").forEach((el) => el.remove());
    }

    // Settings Panel
    renderSettings(container) {
      this._settingsContainer = container;
      const isReady = this._translator === "ready";
      const isLoading = this._translator === "initializing";

      // Status display
      let dotClass = "qt-dot-off";
      let statusTitle = "Offline";
      let statusSub = "AI engine is not loaded.";

      if (isReady) {
        dotClass = "qt-dot-on";
        statusTitle = "Active";
        statusSub = "On-device AI running in isolated background process.";
      } else if (isLoading) {
        dotClass = "qt-dot-load";
        statusTitle = "Loading...";
        statusSub =
          this._progress.status === "downloading"
            ? `Downloading model weights...`
            : "Starting isolated WASM AI process...";
      }

      const langOpts = LANGUAGES.map(
        (l) =>
          `<option value="${l.code}" ${l.code === this.config.targetLanguage ? "selected" : ""}>${l.name}</option>`,
      ).join("");

      container.innerHTML = `
        <div class="qt-settings">

          <!-- Status Card -->
          <div class="qt-card">
            <div class="qt-row" style="gap:14px;">
              <div class="qt-dot ${dotClass}"></div>
              <div style="flex:1;">
                <p class="qt-title">${statusTitle}</p>
                <p class="qt-sub">${statusSub}</p>
              </div>
            </div>
            ${
              isLoading && this._progress.status === "downloading"
                ? `<div class="qt-progress"><div class="qt-progress-bar" style="width:${this._progress.percent}%"></div></div>
                   <div class="qt-progress-label">${this._progress.percent}% — ${(this._progress.file || "").split("/").pop()}</div>`
                : ""
            }
            ${
              this._progress.status === "error"
                ? `<div class="qt-error-box">${this._progress.message}</div>`
                : ""
            }
          </div>

          <!-- Model Actions -->
          <div class="qt-card">
            <span class="qt-label">Model · Xenova/NLLB-200 (Multilingual)</span>
            <p class="qt-sub" style="margin-bottom:10px;">One model covers all 200+ languages. ~200 MB download, cached locally after first load.</p>
            <div class="qt-actions">
              <button id="qt-init" class="qt-btn qt-btn-primary qt-btn-full" ${isReady || isLoading ? "disabled" : ""}>
                ${isReady ? "✓ Loaded" : isLoading ? "Initialising..." : "Initialize AI"}
              </button>
              <button id="qt-unload" class="qt-btn qt-btn-primary" ${!isReady ? "disabled" : ""} title="Unload model from memory">Unload</button>
              <button id="qt-delete" class="qt-btn qt-btn-danger" ${isLoading ? "disabled" : ""} title="Delete cached model files from disk">Delete</button>
            </div>
          </div>

          <!-- Translate Mode -->
          <div class="qt-card">
            <span class="qt-label">Translation Mode</span>
            <div class="qt-radio-group">
              <div class="qt-radio ${this.config.translateMode === "selected" ? "active" : ""}" data-mode="selected">Selected Only</div>
              <div class="qt-radio ${this.config.translateMode === "all" ? "active" : ""}" data-mode="all">All Messages</div>
            </div>
            <p class="qt-sub" style="margin-top:8px;">
              ${
                this.config.translateMode === "selected"
                  ? "Hover over a message and click the translate icon to translate it."
                  : "All visible messages are translated automatically."
              }
            </p>
          </div>

          <!-- Target Language -->
          <div class="qt-card">
            <span class="qt-label">Target Language</span>
            <select id="qt-lang" class="qt-select">${langOpts}</select>
          </div>

          <!-- Save -->
          <button id="qt-save" class="qt-btn qt-btn-primary qt-btn-full">Save Settings</button>
        </div>
      `;

      // Event Handlers
      container.querySelector("#qt-init").onclick = () =>
        this._initTranslator();

      container.querySelector("#qt-unload").onclick = async () => {
        await window.electronAPI.unloadTranslator();
      };

      container.querySelector("#qt-delete").onclick = async () => {
        if (
          confirm(
            "Delete the cached model files? You'll need to re-download (~200 MB) to use translation again.",
          )
        ) {
          await window.electronAPI.deleteTranslatorCache();
        }
      };

      container.querySelectorAll(".qt-radio").forEach((el) => {
        el.onclick = () => {
          container
            .querySelectorAll(".qt-radio")
            .forEach((r) => r.classList.remove("active"));
          el.classList.add("active");
          this.config.translateMode = el.dataset.mode;
          // Re-render to update description
          this.renderSettings(container);
        };
      });

      container.querySelector("#qt-save").onclick = () => {
        this.config.targetLanguage = container.querySelector("#qt-lang").value;
        if (window.electronAPI?.saveAddonConfig) {
          window.electronAPI.saveAddonConfig({
            addonId: ADDON_ID,
            data: this.config,
          });
        }
        // If mode changed, refresh translations
        this._removeAllTranslations();
        if (
          this.config.translateMode === "all" &&
          this._translator === "ready"
        ) {
          this._translateAllVisible();
        }
        alert("Settings saved!");
      };
    }

    _updateSettingsUI() {
      if (
        this._settingsContainer &&
        document.body.contains(this._settingsContainer)
      ) {
        this.renderSettings(this._settingsContainer);
      }
    }

    // Init
    async _initTranslator() {
      this._translator = "initializing";
      this._progress = { status: "initializing", percent: 0, file: "" };
      this._updateSettingsUI();

      try {
        const res = await window.electronAPI.initTranslator();
        if (!res || !res.success)
          throw new Error(res?.error || "Backend failure");
        // Actual ready/error status comes via qt-status events
      } catch (err) {
        this._translator = null;
        this._progress = { status: "error", message: err.message };
        this._updateSettingsUI();
      }
    }

    // Translation
    async _translateText(text) {
      if (this._translator !== "ready") return null;
      try {
        const res = await window.electronAPI.translateText(
          text,
          "eng_Latn",
          this.config.targetLanguage,
        );
        return res?.success ? res.text : null;
      } catch {
        return null;
      }
    }

    // DOM: Observer & Message Injection
    _setupObserver() {
      const observer = new MutationObserver(() =>
        this._processVisibleMessages(),
      );
      observer.observe(document.body, { childList: true, subtree: true });
      this._processVisibleMessages();
      this._cleanup = () => observer.disconnect();
    }

    _processVisibleMessages() {
      // Find all message text containers (both server & DM structure)
      const messageDivs = document.querySelectorAll("div[data-message-id]");

      messageDivs.forEach((msgDiv) => {
        // Inject hover button (if "selected" mode)
        if (this.config.translateMode === "selected") {
          this._injectHoverButton(msgDiv);
        }

        // Auto-translate (if "all" mode)
        if (
          this.config.translateMode === "all" &&
          this._translator === "ready" &&
          !msgDiv.querySelector(".qt-translation")
        ) {
          this._queueTranslation(msgDiv);
        }
      });
    }

    _injectHoverButton(msgDiv) {
      // Walk up to find the hover menu (the absolute positioned div)
      const messageRow = msgDiv.closest(".group.relative");
      if (!messageRow) return;

      const hoverMenu = messageRow.querySelector(
        'div.absolute[class*="right-2"][class*="-top-4"]',
      );
      if (!hoverMenu || hoverMenu.querySelector(".qt-hover-btn")) return;

      // Find the "Add reaction" button to insert before
      const addReactionBtn = hoverMenu.querySelector(
        'button[aria-label="Add reaction"]',
      );

      // Create translate button matching native style
      const btn = document.createElement("button");
      btn.className =
        "qt-hover-btn p-2 rounded-lg bg-transparent hover:bg-muted transition-colors text-muted-foreground hover:text-foreground";
      btn.setAttribute("aria-label", "Translate");
      btn.setAttribute("title", "Translate");
      btn.type = "button";
      btn.innerHTML = ICON_TRANSLATE;

      btn.onclick = (e) => {
        e.stopPropagation();
        if (this._translator !== "ready") return;
        if (msgDiv.querySelector(".qt-translation")) return; // already translated
        this._queueTranslation(msgDiv);
      };

      if (addReactionBtn) {
        // Insert a divider + the button before "Add reaction"
        const divider = document.createElement("div");
        divider.className = "qt-hover-btn w-px h-5 bg-border mx-0.5";
        hoverMenu.insertBefore(divider, addReactionBtn);
        hoverMenu.insertBefore(btn, addReactionBtn);
      } else {
        // Fallback: append at the start
        hoverMenu.insertBefore(btn, hoverMenu.firstChild);
      }
    }

    _translateAllVisible() {
      const messageDivs = document.querySelectorAll("div[data-message-id]");
      messageDivs.forEach((msgDiv) => {
        if (!msgDiv.querySelector(".qt-translation")) {
          this._queueTranslation(msgDiv);
        }
      });
    }

    // Translation Queue (sequential to avoid overloading)
    _queueTranslation(msgDiv) {
      if (this._translator !== "ready") return;
      if (msgDiv.querySelector(".qt-translation")) return;
      this._queue.push(msgDiv);
      this._processQueue();
    }

    async _processQueue() {
      if (this._isProcessing || this._queue.length === 0) return;
      this._isProcessing = true;

      while (this._queue.length > 0) {
        const msgDiv = this._queue.shift();
        if (msgDiv.querySelector(".qt-translation")) continue;

        // Extract text from the message
        const inlineSpan = msgDiv.querySelector("span.inline");
        if (!inlineSpan) continue;
        const originalText = inlineSpan.innerText.trim();
        if (!originalText || originalText.length < 2) continue;

        // Show loading indicator
        const translationDiv = document.createElement("div");
        translationDiv.className = "qt-translation";
        translationDiv.innerHTML = `
          <span class="qt-translation-icon">${ICON_TRANSLATE_SM}</span>
          <span class="qt-translation-text" style="opacity:0.5;">Translating...</span>
        `;
        msgDiv.appendChild(translationDiv);

        try {
          const translated = await this._translateText(originalText);
          if (translated && translated !== originalText) {
            translationDiv.querySelector(".qt-translation-text").textContent =
              translated;
            translationDiv.querySelector(".qt-translation-text").style.opacity =
              "1";
          } else {
            translationDiv.remove();
          }
        } catch {
          translationDiv.remove();
        }

        // Small delay between translations to keep UI responsive
        await new Promise((r) => setTimeout(r, 100));
      }

      this._isProcessing = false;
    }

    // Cleanup
    _removeAllTranslations() {
      document.querySelectorAll(".qt-translation").forEach((el) => el.remove());
      document.querySelectorAll(".qt-hover-btn").forEach((el) => el.remove());
    }
  }

  const instance = new QuickTranslateAddon();
  if (window.KloakAddons) window.KloakAddons.registerAddon(instance);
})();
