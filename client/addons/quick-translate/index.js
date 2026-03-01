(() => {
  const ADDON_ID = "quick-translate";

  // Lucide "Languages" icon
  const ICON_TRANSLATE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-languages w-4 h-4"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`;
  const ICON_TRANSLATE_SM = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;opacity:0.5;margin-left:4px;"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`;

  // FLORES-200 / NLLB-200 language codes — major languages only, no regional dialects
  const LANGUAGES = [
    { code: "afr_Latn", name: "Afrikaans" },
    { code: "als_Latn", name: "Albanian" },
    { code: "amh_Ethi", name: "Amharic" },
    { code: "arb_Arab", name: "Arabic" },
    { code: "hye_Armn", name: "Armenian" },
    { code: "asm_Beng", name: "Assamese" },
    { code: "ast_Latn", name: "Asturian" },
    { code: "azj_Latn", name: "Azerbaijani" },
    { code: "eus_Latn", name: "Basque" },
    { code: "bel_Cyrl", name: "Belarusian" },
    { code: "ben_Beng", name: "Bengali" },
    { code: "bos_Latn", name: "Bosnian" },
    { code: "bul_Cyrl", name: "Bulgarian" },
    { code: "mya_Mymr", name: "Burmese" },
    { code: "cat_Latn", name: "Catalan" },
    { code: "ceb_Latn", name: "Cebuano" },
    { code: "zho_Hans", name: "Chinese (Simplified)" },
    { code: "zho_Hant", name: "Chinese (Traditional)" },
    { code: "hrv_Latn", name: "Croatian" },
    { code: "ces_Latn", name: "Czech" },
    { code: "dan_Latn", name: "Danish" },
    { code: "nld_Latn", name: "Dutch" },
    { code: "eng_Latn", name: "English" },
    { code: "est_Latn", name: "Estonian" },
    { code: "fin_Latn", name: "Finnish" },
    { code: "fra_Latn", name: "French" },
    { code: "glg_Latn", name: "Galician" },
    { code: "kat_Geor", name: "Georgian" },
    { code: "deu_Latn", name: "German" },
    { code: "ell_Grek", name: "Greek" },
    { code: "guj_Gujr", name: "Gujarati" },
    { code: "hat_Latn", name: "Haitian Creole" },
    { code: "hau_Latn", name: "Hausa" },
    { code: "heb_Hebr", name: "Hebrew" },
    { code: "hin_Deva", name: "Hindi" },
    { code: "hun_Latn", name: "Hungarian" },
    { code: "isl_Latn", name: "Icelandic" },
    { code: "ibo_Latn", name: "Igbo" },
    { code: "ind_Latn", name: "Indonesian" },
    { code: "gle_Latn", name: "Irish" },
    { code: "ita_Latn", name: "Italian" },
    { code: "jpn_Jpan", name: "Japanese" },
    { code: "jav_Latn", name: "Javanese" },
    { code: "kan_Knda", name: "Kannada" },
    { code: "kaz_Cyrl", name: "Kazakh" },
    { code: "khm_Khmr", name: "Khmer" },
    { code: "kor_Hang", name: "Korean" },
    { code: "kir_Cyrl", name: "Kyrgyz" },
    { code: "lao_Laoo", name: "Lao" },
    { code: "lvs_Latn", name: "Latvian" },
    { code: "lit_Latn", name: "Lithuanian" },
    { code: "ltz_Latn", name: "Luxembourgish" },
    { code: "mkd_Cyrl", name: "Macedonian" },
    { code: "zsm_Latn", name: "Malay" },
    { code: "mal_Mlym", name: "Malayalam" },
    { code: "mlt_Latn", name: "Maltese" },
    { code: "mri_Latn", name: "Maori" },
    { code: "mar_Deva", name: "Marathi" },
    { code: "khk_Cyrl", name: "Mongolian" },
    { code: "npi_Deva", name: "Nepali" },
    { code: "nob_Latn", name: "Norwegian" },
    { code: "ory_Orya", name: "Odia" },
    { code: "pan_Guru", name: "Punjabi" },
    { code: "pes_Arab", name: "Persian" },
    { code: "pol_Latn", name: "Polish" },
    { code: "por_Latn", name: "Portuguese" },
    { code: "ron_Latn", name: "Romanian" },
    { code: "rus_Cyrl", name: "Russian" },
    { code: "srp_Cyrl", name: "Serbian" },
    { code: "sin_Sinh", name: "Sinhala" },
    { code: "slk_Latn", name: "Slovak" },
    { code: "slv_Latn", name: "Slovenian" },
    { code: "som_Latn", name: "Somali" },
    { code: "spa_Latn", name: "Spanish" },
    { code: "sun_Latn", name: "Sundanese" },
    { code: "swh_Latn", name: "Swahili" },
    { code: "swe_Latn", name: "Swedish" },
    { code: "tgl_Latn", name: "Tagalog" },
    { code: "tgk_Cyrl", name: "Tajik" },
    { code: "tam_Taml", name: "Tamil" },
    { code: "tat_Cyrl", name: "Tatar" },
    { code: "tel_Telu", name: "Telugu" },
    { code: "tha_Thai", name: "Thai" },
    { code: "tur_Latn", name: "Turkish" },
    { code: "ukr_Cyrl", name: "Ukrainian" },
    { code: "urd_Arab", name: "Urdu" },
    { code: "uzn_Latn", name: "Uzbek" },
    { code: "vie_Latn", name: "Vietnamese" },
    { code: "cym_Latn", name: "Welsh" },
    { code: "yor_Latn", name: "Yoruba" },
    { code: "zul_Latn", name: "Zulu" },
  ];

  class QuickTranslateAddon {
    constructor() {
      this.id = ADDON_ID;
      this.name = "Quick Translate";
      this.description = "Translate any message, on-device.";

      this.config = {
        targetLanguage: "eng_Latn",
        translateMode: "selected",
      };

      this._translator = null;
      this._progress = { status: "idle", percent: 0, file: "" };

      this._queue = [];
      this._isProcessing = false;
      this._settingsContainer = null;
      this._cleanup = null;

      this._injectCSS();
      this._listenForBackendEvents();
    }

    _injectCSS() {
      if (document.getElementById("qt-addon-styles")) return;
      const style = document.createElement("style");
      style.id = "qt-addon-styles";
      style.textContent = `
        .qt-settings { display: flex; flex-direction: column; gap: 16px; padding: 4px 0; }

        .qt-card {
          background: var(--kloak-bg-box);
          border: 1px solid var(--kloak-bg-btn);
          border-radius: 12px; padding: 16px;
        }

        .qt-row { display: flex; align-items: center; gap: 14px; }

        .qt-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .qt-dot-off { background: var(--kloak-accent-destructive); box-shadow: 0 0 8px rgba(235,20,20,0.4); }
        .qt-dot-on  { background: var(--kloak-accent-success); box-shadow: 0 0 8px rgba(64,191,128,0.4); }
        .qt-dot-load { background: var(--kloak-accent-warning); box-shadow: 0 0 8px rgba(245,158,11,0.4); }

        .qt-actions { display: flex; gap: 8px; }
        .qt-actions button { flex: 1; }
        .qt-actions .qt-btn-danger {
          flex: 0 0 auto;
          background: rgba(235,20,20,0.08); color: var(--kloak-accent-destructive);
          border-color: rgba(235,20,20,0.2);
        }
        .qt-actions .qt-btn-danger:hover { background: rgba(235,20,20,0.15); }

        .qt-error-box {
          margin-top: 10px; padding: 10px; border-radius: 8px;
          background: rgba(235,20,20,0.08); border: 1px solid rgba(235,20,20,0.2);
          color: var(--kloak-accent-destructive); font-size: 12px; line-height: 1.4;
        }

        .qt-mode-row {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 0; cursor: pointer;
        }
        .qt-mode-row label { cursor: pointer; }
        .qt-mode-label { font-size: 13px; font-weight: 500; color: var(--kloak-text-main); }
        .qt-mode-desc { font-size: 12px; color: var(--kloak-text-sub); margin-top: 2px; }

        /* Searchable dropdown */
        .qt-dropdown { position: relative; }
        .qt-dropdown-input {
          width: 100%; box-sizing: border-box;
          background: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn);
          color: var(--kloak-text-main); padding: 10px 14px; border-radius: 8px;
          font-size: 13px; font-family: inherit; outline: none;
          transition: border-color 0.2s;
        }
        .qt-dropdown-input:focus { border-color: var(--kloak-icon-fg); }
        .qt-dropdown-input::placeholder { color: var(--kloak-text-sub); }
        .qt-dropdown-list {
          display: none; position: absolute; top: 100%; left: 0; right: 0;
          margin-top: 4px; max-height: 200px; overflow-y: auto;
          background: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn);
          border-radius: 8px; z-index: 100;
        }
        .qt-dropdown-list.open { display: block; }
        .qt-dropdown-item {
          padding: 8px 14px; font-size: 13px; color: var(--kloak-text-sub);
          cursor: pointer; transition: background 0.1s, color 0.1s;
        }
        .qt-dropdown-item:hover { background: var(--kloak-bg-btn); color: var(--kloak-text-main); }
        .qt-dropdown-item.selected { color: var(--kloak-text-main); font-weight: 600; }
        .qt-dropdown-empty {
          padding: 12px 14px; font-size: 12px; color: var(--kloak-text-sub); text-align: center;
        }
        .qt-dropdown-list::-webkit-scrollbar { width: 4px; }
        .qt-dropdown-list::-webkit-scrollbar-track { background: transparent; }
        .qt-dropdown-list::-webkit-scrollbar-thumb { background: var(--kloak-bg-btn); border-radius: 2px; }

        /* Inline translation */
        .qt-translation {
          margin-top: 4px; padding: 4px 0; font-size: 13px; line-height: 1.4;
          color: var(--kloak-text-sub);
          display: flex; align-items: flex-start; gap: 4px;
        }
        .qt-translation-icon { flex-shrink: 0; margin-top: 2px; opacity: 0.4; }
        .qt-translation-text { font-style: italic; }
      `;
      document.head.appendChild(style);
    }

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

    renderSettings(container) {
      this._settingsContainer = container;
      const isReady = this._translator === "ready";
      const isLoading = this._translator === "initializing";

      let dotClass = "qt-dot-off";
      let statusTitle = "Offline";
      let statusSub = "AI engine is not loaded.";

      if (isReady) {
        dotClass = "qt-dot-on";
        statusTitle = "Active";
        statusSub = "On-device AI running in isolated background window.";
      } else if (isLoading) {
        dotClass = "qt-dot-load";
        statusTitle = "Loading...";
        statusSub =
          this._progress.status === "downloading"
            ? "Downloading model weights..."
            : "Starting AI engine...";
      }

      const selectedLang = LANGUAGES.find(
        (l) => l.code === this.config.targetLanguage,
      );

      container.innerHTML = `
        <div class="qt-settings">

          <!-- Status -->
          <div class="qt-card">
            <div class="qt-row">
              <div class="qt-dot ${dotClass}"></div>
              <div style="flex:1;">
                <p style="margin:0;font-size:14px;font-weight:600;color:var(--kloak-text-main);">${statusTitle}</p>
                <p style="margin:0;font-size:12px;color:var(--kloak-text-sub);line-height:1.4;">${statusSub}</p>
              </div>
            </div>
            ${
              isLoading && this._progress.status === "downloading"
                ? `<div class="kloak-progress-container" style="margin-top:10px;">
                     <div class="kloak-progress-bar" style="width:${this._progress.percent}%;background:var(--kloak-accent-warning);"></div>
                   </div>
                   <p class="kloak-progress-status">${this._progress.percent}% — ${(this._progress.file || "").split("/").pop()}</p>`
                : ""
            }
            ${
              this._progress.status === "error"
                ? `<div class="qt-error-box">${this._progress.message}</div>`
                : ""
            }
          </div>

          <!-- Model -->
          <div class="addon-settings-item">
            <label class="addon-label">Model</label>
            <div class="addon-val" style="font-size:12px;color:var(--kloak-text-sub);margin-bottom:8px;">
              Xenova/NLLB-200 multilingual. Covers 200+ languages. Cached locally after first download.
            </div>
            <div class="qt-actions">
              <button id="qt-init" class="kloak-btn-primary" ${isReady || isLoading ? "disabled" : ""} style="flex:1;justify-content:center;${isReady || isLoading ? "opacity:0.4;cursor:not-allowed;" : ""}">
                ${isReady ? "Loaded" : isLoading ? "Initialising..." : "Initialize AI"}
              </button>
              <button id="qt-unload" class="kloak-btn-primary" ${!isReady ? "disabled" : ""} style="${!isReady ? "opacity:0.4;cursor:not-allowed;" : ""}">Unload</button>
              <button id="qt-delete" class="kloak-btn-primary qt-btn-danger" ${isLoading ? "disabled" : ""} style="${isLoading ? "opacity:0.4;cursor:not-allowed;" : ""}">Delete</button>
            </div>
          </div>

          <!-- Translation Mode -->
          <div class="addon-settings-item">
            <label class="addon-label">Translation Mode</label>
            <div>
              <label class="qt-mode-row">
                <input type="radio" name="qt-mode" value="selected" ${this.config.translateMode === "selected" ? "checked" : ""}>
                <div>
                  <div class="qt-mode-label">Selected Only</div>
                  <div class="qt-mode-desc">Hover over a message and click the translate icon.</div>
                </div>
              </label>
              <label class="qt-mode-row" style="padding-top:0;">
                <input type="radio" name="qt-mode" value="all" ${this.config.translateMode === "all" ? "checked" : ""}>
                <div>
                  <div class="qt-mode-label">All Messages</div>
                  <div class="qt-mode-desc">All visible messages are translated automatically.</div>
                </div>
              </label>
            </div>
          </div>

          <!-- Target Language -->
          <div class="addon-settings-item">
            <label class="addon-label">Target Language</label>
            <div class="qt-dropdown" id="qt-lang-dropdown">
              <input type="text" class="qt-dropdown-input" id="qt-lang-input"
                placeholder="Search languages..."
                value="${selectedLang ? selectedLang.name : ""}"
                autocomplete="off">
              <div class="qt-dropdown-list" id="qt-lang-list"></div>
            </div>
          </div>

          <!-- Save -->
          <button id="qt-save" class="addon-btn-save">Save Settings</button>
        </div>
      `;

      // --- Event Handlers ---

      container.querySelector("#qt-init").onclick = () =>
        this._initTranslator();

      container.querySelector("#qt-unload").onclick = async () => {
        await window.electronAPI.unloadTranslator();
      };

      container.querySelector("#qt-delete").onclick = async () => {
        if (
          confirm(
            "Delete the cached model files? You'll need to re-download to use translation again.",
          )
        ) {
          await window.electronAPI.deleteTranslatorCache();
        }
      };

      // Radio mode
      container.querySelectorAll('input[name="qt-mode"]').forEach((radio) => {
        radio.onchange = () => {
          this.config.translateMode = radio.value;
        };
      });

      // Searchable language dropdown
      this._setupDropdown(container);

      // Save button
      const saveBtn = container.querySelector("#qt-save");
      saveBtn.onclick = () => {
        if (window.electronAPI?.saveAddonConfig) {
          window.electronAPI.saveAddonConfig({
            addonId: ADDON_ID,
            data: this.config,
          });
        }
        this._removeAllTranslations();
        if (
          this.config.translateMode === "all" &&
          this._translator === "ready"
        ) {
          this._translateAllVisible();
        }
        const originalText = saveBtn.textContent;
        saveBtn.textContent = "Settings saved!";
        setTimeout(() => {
          if (document.body.contains(saveBtn)) {
            saveBtn.textContent = originalText;
          }
        }, 2000);
      };
    }

    _setupDropdown(container) {
      const input = container.querySelector("#qt-lang-input");
      const list = container.querySelector("#qt-lang-list");
      let selectedCode = this.config.targetLanguage;

      const renderList = (filter = "") => {
        const query = filter.toLowerCase();
        const filtered = query
          ? LANGUAGES.filter((l) => l.name.toLowerCase().includes(query))
          : LANGUAGES;

        if (filtered.length === 0) {
          list.innerHTML = `<div class="qt-dropdown-empty">No languages found</div>`;
          return;
        }

        list.innerHTML = filtered
          .map(
            (l) =>
              `<div class="qt-dropdown-item${l.code === selectedCode ? " selected" : ""}" data-code="${l.code}">${l.name}</div>`,
          )
          .join("");

        list.querySelectorAll(".qt-dropdown-item").forEach((item) => {
          item.onclick = () => {
            selectedCode = item.dataset.code;
            this.config.targetLanguage = selectedCode;
            input.value = item.textContent;
            list.classList.remove("open");
          };
        });
      };

      input.onfocus = () => {
        input.select();
        renderList(input.value === (LANGUAGES.find((l) => l.code === selectedCode)?.name || "") ? "" : input.value);
        list.classList.add("open");
      };

      input.oninput = () => {
        renderList(input.value);
        list.classList.add("open");
      };

      // Close dropdown when clicking outside
      const closeHandler = (e) => {
        if (!container.querySelector("#qt-lang-dropdown")?.contains(e.target)) {
          list.classList.remove("open");
          // Restore display name if user typed gibberish
          const match = LANGUAGES.find((l) => l.code === selectedCode);
          if (match) input.value = match.name;
        }
      };
      document.addEventListener("mousedown", closeHandler);

      // Clean up listener if settings container is removed
      const observer = new MutationObserver(() => {
        if (!document.body.contains(container)) {
          document.removeEventListener("mousedown", closeHandler);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    _updateSettingsUI() {
      if (
        this._settingsContainer &&
        document.body.contains(this._settingsContainer)
      ) {
        this.renderSettings(this._settingsContainer);
      }
    }

    async _initTranslator() {
      this._translator = "initializing";
      this._progress = { status: "initializing", percent: 0, file: "" };
      this._updateSettingsUI();

      try {
        const res = await window.electronAPI.initTranslator();
        if (!res || !res.success)
          throw new Error(res?.error || "Backend failure");
      } catch (err) {
        this._translator = null;
        this._progress = { status: "error", message: err.message };
        this._updateSettingsUI();
      }
    }

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

    _setupObserver() {
      const observer = new MutationObserver(() =>
        this._processVisibleMessages(),
      );
      observer.observe(document.body, { childList: true, subtree: true });
      this._processVisibleMessages();
      this._cleanup = () => observer.disconnect();
    }

    _processVisibleMessages() {
      const messageDivs = document.querySelectorAll("div[data-message-id]");

      messageDivs.forEach((msgDiv) => {
        if (this.config.translateMode === "selected") {
          this._injectHoverButton(msgDiv);
        }

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
      const messageRow = msgDiv.closest(".group.relative");
      if (!messageRow) return;

      const hoverMenu = messageRow.querySelector(
        'div.absolute[class*="right-2"][class*="-top-4"]',
      );
      if (!hoverMenu || hoverMenu.querySelector(".qt-hover-btn")) return;

      const addReactionBtn = hoverMenu.querySelector(
        'button[aria-label="Add reaction"]',
      );

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
        if (msgDiv.querySelector(".qt-translation")) return;
        this._queueTranslation(msgDiv);
      };

      if (addReactionBtn) {
        const divider = document.createElement("div");
        divider.className = "qt-hover-btn w-px h-5 bg-border mx-0.5";
        hoverMenu.insertBefore(divider, addReactionBtn);
        hoverMenu.insertBefore(btn, addReactionBtn);
      } else {
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

        const inlineSpan = msgDiv.querySelector("span.inline");
        if (!inlineSpan) continue;
        const originalText = inlineSpan.innerText.trim();
        if (!originalText || originalText.length < 2) continue;

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

        await new Promise((r) => setTimeout(r, 100));
      }

      this._isProcessing = false;
    }

    _removeAllTranslations() {
      document.querySelectorAll(".qt-translation").forEach((el) => el.remove());
      document.querySelectorAll(".qt-hover-btn").forEach((el) => el.remove());
    }
  }

  const instance = new QuickTranslateAddon();
  if (window.KloakAddons) window.KloakAddons.registerAddon(instance);
})();
