(() => {
  const STYLE_TAG_ID = "invisic-theme-style";

  // Cache the active user ID for per-user theme persistence
  let _activeUserId = null;
  const getActiveUserId = async () => {
    if (!_activeUserId) {
      _activeUserId = await window.electronAPI?.getActiveUserId?.();
    }
    return _activeUserId;
  };

  async function getSavedTheme() {
    try {
      const userId = await getActiveUserId();
      const config = await window.electronAPI.getFeatureConfig(userId);
      return config.selectedTheme ?? "";
    } catch (e) {
      console.error("[Theme Engine] Failed to load theme preference:", e);
      return "";
    }
  }

  async function saveThemePreference(filename) {
    try {
      const userId = await getActiveUserId();
      const config = await window.electronAPI.getFeatureConfig(userId);
      config.selectedTheme = filename;
      await window.electronAPI.saveFeatureConfig(config, userId);
    } catch (e) {
      console.error("[Theme Engine] Failed to save theme preference:", e);
    }
  }

  async function applyTheme(filename) {
    const existing = document.getElementById(STYLE_TAG_ID);
    if (existing) existing.remove();

    if (!filename) {
      await saveThemePreference("");
      return;
    }

    try {
      const files = await window.electronAPI.getThemeFiles();
      const theme = files.find((t) => t.filename === filename);
      if (!theme) return;

      const styleTag = document.createElement("style");
      styleTag.id = STYLE_TAG_ID;
      styleTag.textContent = theme.content;
      document.head.appendChild(styleTag);
      await saveThemePreference(filename);
    } catch (e) {
      console.error("[Theme Engine] Failed to apply theme:", e);
    }
  }

  // Auto-apply saved theme on load
  (async () => {
    const saved = await getSavedTheme();
    applyTheme(saved);
  })();

  // Listen for theme change requests from the settings UI
  document.addEventListener("invisic-apply-theme", (e) => {
    applyTheme(e.detail || "");
  });
})();
