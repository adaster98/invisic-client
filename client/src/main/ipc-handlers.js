const { app, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const {
  getMainWindow,
  getScreenState,
  setScreenShareCallback,
  setScreenSources,
} = require("./window");
const { loadSettings, saveSettings } = require("./services/settings");
const {
  loadAccounts,
  saveAccounts,
  getLastActiveUserId,
  setLastActiveUserId,
} = require("./services/accounts");
const {
  openAddonsFolder,
  addonsDir,
  addonsDataDir,
  addonStatesPath,
} = require("./services/addons");
const { handlePermissionResponse } = require("./services/permissions");
const {
  checkForCustomUpdate,
  downloadUpdate,
  installAndRestart,
  triggerDebugUpdate,
} = require("./services/updater");

function registerIpcHandlers() {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userDataDir = app.getPath("userData");

  function isValidUserId(userId) {
    return typeof userId === "string" && UUID_RE.test(userId);
  }

  function getPerUserAddonStatesPath(userId) {
    return path.join(addonsDataDir, `addon-states-${userId}.json`);
  }

  function getPerUserFeatureConfigPath(userId) {
    return path.join(userDataDir, "features", userId, "feature-config.json");
  }

  function getPerUserAddonConfigPath(addonId, userId) {
    return path.join(addonsDataDir, addonId, userId, "config.json");
  }

  // --- Per-User Migration ---

  // One-time copy of global configs → per-user paths (guarded by marker)
  function migrateToPerUser(userId) {
    const markerPath = path.join(userDataDir, `.migrated-per-user-v3-${userId}`);
    if (fs.existsSync(markerPath)) return;

    console.log(`[Migration] Starting per-user migration for ${userId}...`);

    // 1. Migrate addon-states.json → per-user
    const perUserStatesPath = getPerUserAddonStatesPath(userId);
    if (fs.existsSync(addonStatesPath) && !fs.existsSync(perUserStatesPath)) {
      try {
        fs.copyFileSync(addonStatesPath, perUserStatesPath);
        console.log(`[Migration] Copied addon-states → ${perUserStatesPath}`);
      } catch (e) {
        console.error(`[Migration] Failed to migrate addon states: ${e.message}`);
      }
    }

    // 2. Migrate addon configs
    // Discover addon folders from code dir, read/write configs in data dir
    if (fs.existsSync(addonsDir)) {
      const folders = fs.readdirSync(addonsDir).filter((f) => {
        const full = path.join(addonsDir, f);
        return fs.lstatSync(full).isDirectory();
      });
      for (const addonId of folders) {
        const perUserConfigPath = getPerUserAddonConfigPath(addonId, userId);
        if (fs.existsSync(perUserConfigPath)) continue;

        // Check data dir first, then code dir for legacy dev configs
        const legacyPerUser = path.join(addonsDataDir, addonId, `config-${userId}.json`);
        const dataConfig = path.join(addonsDataDir, addonId, "config.json");
        const codeConfig = path.join(addonsDir, addonId, "config.json");
        const source = fs.existsSync(legacyPerUser) ? legacyPerUser
          : fs.existsSync(dataConfig) ? dataConfig
          : fs.existsSync(codeConfig) ? codeConfig
          : null;

        if (source) {
          try {
            const dir = path.dirname(perUserConfigPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.copyFileSync(source, perUserConfigPath);
            console.log(`[Migration] Copied ${addonId} config → ${perUserConfigPath}`);
          } catch (e) {
            console.error(`[Migration] Failed to migrate ${addonId} config: ${e.message}`);
          }
        }
      }
    }

    // 3. Migrate feature-config.json → per-user
    const globalFeatureConfig = path.join(userDataDir, "feature-config.json");
    const perUserFeatureConfig = getPerUserFeatureConfigPath(userId);
    if (fs.existsSync(globalFeatureConfig) && !fs.existsSync(perUserFeatureConfig)) {
      try {
        const dir = path.dirname(perUserFeatureConfig);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(globalFeatureConfig, perUserFeatureConfig);
        console.log(`[Migration] Copied feature-config → ${perUserFeatureConfig}`);
      } catch (e) {
        console.error(`[Migration] Failed to migrate feature config: ${e.message}`);
      }
    }

    // Write migration marker
    try {
      fs.writeFileSync(markerPath, new Date().toISOString(), "utf8");
      console.log(`[Migration] Completed for ${userId}`);
    } catch (e) {
      console.error(`[Migration] Failed to write marker: ${e.message}`);
    }
  }

  // Unconditional cleanup: delete global files once per-user versions exist.
  // Runs every time (not guarded by marker) so globals are removed even if
  // migration ran in a previous session and the per-user file was recreated
  // by normal save operations.
  function cleanupGlobalConfigs(userId) {
    // 1. Global addon-states.json
    const perUserStatesPath = getPerUserAddonStatesPath(userId);
    if (fs.existsSync(addonStatesPath) && fs.existsSync(perUserStatesPath)) {
      try {
        fs.unlinkSync(addonStatesPath);
        console.log(`[Cleanup] Deleted global addon-states.json`);
      } catch (e) {
        console.error(`[Cleanup] Failed to delete global addon-states: ${e.message}`);
      }
    }

    // 2. Global addon configs
    if (fs.existsSync(addonsDir)) {
      const folders = fs.readdirSync(addonsDir).filter((f) => {
        const full = path.join(addonsDir, f);
        return fs.existsSync(full) && fs.lstatSync(full).isDirectory();
      });
      for (const addonId of folders) {
        const perUserConfigPath = getPerUserAddonConfigPath(addonId, userId);
        if (!fs.existsSync(perUserConfigPath)) continue;

        // Delete any global/legacy sources that still exist
        const candidates = [
          path.join(addonsDataDir, addonId, `config-${userId}.json`),
          path.join(addonsDataDir, addonId, "config.json"),
          path.join(addonsDir, addonId, "config.json"),
        ];
        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) {
            try {
              fs.unlinkSync(candidate);
              console.log(`[Cleanup] Deleted ${candidate}`);
            } catch (e) {
              console.error(`[Cleanup] Failed to delete ${candidate}: ${e.message}`);
            }
          }
        }
      }
    }

    // 3. Global feature-config.json
    const globalFeatureConfig = path.join(userDataDir, "feature-config.json");
    const perUserFeatureConfig = getPerUserFeatureConfigPath(userId);
    if (fs.existsSync(globalFeatureConfig) && fs.existsSync(perUserFeatureConfig)) {
      try {
        fs.unlinkSync(globalFeatureConfig);
        console.log(`[Cleanup] Deleted global feature-config.json`);
      } catch (e) {
        console.error(`[Cleanup] Failed to delete global feature-config: ${e.message}`);
      }
    }
  }

  ipcMain.on("terminal-log", (event, msg) => {
    console.log(`[Renderer] ${msg}`);
  });

  ipcMain.on("window-min", () => {
    console.log("[IPC] window-min received");
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on("window-max", () => {
    console.log("[IPC] window-max received");
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
  });

  ipcMain.on("window-close", () => {
    console.log("[IPC] window-close received");
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.hide();
  });

  ipcMain.on("open-user-themes-folder", () => {
    const userThemesDir = path.join(app.getPath("userData"), "themes");
    if (!fs.existsSync(userThemesDir))
      fs.mkdirSync(userThemesDir, { recursive: true });
    shell.openPath(userThemesDir);
  });

  ipcMain.on("open-addons-folder", (event, subPath) => {
    console.log("[IPC] open-addons-folder received:", subPath);
    openAddonsFolder(subPath);
  });

  ipcMain.on("permission-response", (event, { id, allowed }) => {
    console.log("[IPC] permission-response received:", { id, allowed });
    handlePermissionResponse(id, allowed);
  });

  ipcMain.on("screen-share-selected", (event, sourceId) => {
    console.log("[IPC] screen-share-selected received:", sourceId);
    let { screenSources, screenShareCallback } = getScreenState();
    if (screenShareCallback) {
      if (sourceId) {
        const chosenSource = screenSources.find((s) => s.id === sourceId);
        if (chosenSource) screenShareCallback({ video: chosenSource });
        else screenShareCallback(null);
      } else {
        screenShareCallback(null);
      }
      setScreenShareCallback(null);
      setScreenSources([]);
    }
  });

  ipcMain.on("check-custom-update", (event) => {
    console.log("[IPC] check-custom-update received");
    checkForCustomUpdate(event);
  });

  ipcMain.on("debug-update-trigger", (event) => {
    console.log("[IPC] debug-update-trigger received");
    triggerDebugUpdate(event);
  });

  ipcMain.on("open-external-url", (event, url) => {
    console.log("[IPC] open-external-url received:", url);
    if (url) shell.openExternal(url);
  });
  // turbo
  ipcMain.on("start-update", (event, { version }) => {
    console.log("[IPC] start-update received:", { version });
    downloadUpdate(event, { version, platform: process.platform });
  });

  ipcMain.on("quit-and-install", () => {
    console.log("[IPC] quit-and-install received");
    installAndRestart();
  });

  ipcMain.handle("get-addon-states", (event, userId) => {
    console.log("[IPC] get-addon-states (handle) received:", { userId: userId || "global" });
    // Per-user states
    if (isValidUserId(userId)) {
      const perUserPath = getPerUserAddonStatesPath(userId);
      if (fs.existsSync(perUserPath)) {
        try {
          return JSON.parse(fs.readFileSync(perUserPath, "utf8"));
        } catch (e) {}
      }
    }
    // Fallback to global
    if (fs.existsSync(addonStatesPath)) {
      try {
        return JSON.parse(fs.readFileSync(addonStatesPath, "utf8"));
      } catch (e) {}
    }
    return {};
  });

  ipcMain.on("save-addon-state", (event, { addonId, enabled, userId }) => {
    console.log("[IPC] save-addon-state received:", { addonId, enabled, userId: userId || "global" });
    try {
      const targetPath = isValidUserId(userId) ? getPerUserAddonStatesPath(userId) : addonStatesPath;
      let states = {};
      if (fs.existsSync(targetPath)) {
        try {
          states = JSON.parse(fs.readFileSync(targetPath, "utf8"));
        } catch (e) {}
      }
      states[addonId] = enabled;
      fs.writeFileSync(targetPath, JSON.stringify(states, null, 4), "utf8");
      console.log(`[Addons] State saved: ${addonId} = ${enabled} → ${targetPath}`);
    } catch (err) {
      console.error("[Addons] Failed to save addon state:", err);
    }
  });

  ipcMain.handle("get-addon-config", (event, arg) => {
    // Accept both string (legacy) and object { addonId, userId } format
    const addonId = typeof arg === "string" ? arg : arg?.addonId;
    const userId = typeof arg === "object" ? arg?.userId : undefined;
    console.log("[IPC] get-addon-config (handle) received:", { addonId, userId: userId || "global" });

    // Per-user config
    if (isValidUserId(userId)) {
      const perUserPath = getPerUserAddonConfigPath(addonId, userId);
      if (fs.existsSync(perUserPath)) {
        try {
          return JSON.parse(fs.readFileSync(perUserPath, "utf8"));
        } catch (e) {}
      }
    }
    // Fallback to global config (data dir, then code dir for legacy)
    const dataConfigPath = path.join(addonsDataDir, addonId, "config.json");
    if (fs.existsSync(dataConfigPath)) {
      try {
        return JSON.parse(fs.readFileSync(dataConfigPath, "utf8"));
      } catch (e) {}
    }
    const codeConfigPath = path.join(addonsDir, addonId, "config.json");
    if (fs.existsSync(codeConfigPath)) {
      try {
        return JSON.parse(fs.readFileSync(codeConfigPath, "utf8"));
      } catch (e) {}
    }
    return {};
  });

  ipcMain.on("save-addon-config", (event, { addonId, data, userId }) => {
    console.log("[IPC] save-addon-config received:", { addonId, userId: userId || "global" });
    try {
      let configPath;
      if (isValidUserId(userId)) {
        configPath = getPerUserAddonConfigPath(addonId, userId);
      } else {
        configPath = path.join(addonsDataDir, addonId, "config.json");
      }
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(data, null, 4), "utf8");
      console.log(`[Addons] Config saved for ${addonId} → ${configPath}`);
    } catch (err) {
      console.error("[Addons] Failed to save addon config:", err);
    }
  });

  ipcMain.handle("get-theme-files", () => {
    const bundledDir = path.join(app.getAppPath(), "themes");
    const userDir = path.join(app.getPath("userData"), "themes");

    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

    function readThemesFrom(dir, bundled) {
      if (!fs.existsSync(dir)) return [];
      try {
        return fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".css"))
          .map((f) => ({
            filename: f,
            name: f.replace(".css", "").replace(/-/g, " "),
            content: fs.readFileSync(path.join(dir, f), "utf8"),
            bundled,
          }));
      } catch (e) {
        return [];
      }
    }

    const bundled = readThemesFrom(bundledDir, true);
    const user = readThemesFrom(userDir, false);
    return [...bundled, ...user];
  });

  ipcMain.handle("fetch-store-data", async () => {
    try {
      const dbUrl =
        "https://codeberg.org/adaster98/invisic-client/raw/branch/main/addons/store.json?t=" +
        Date.now();
      const response = await fetch(dbUrl);
      if (!response.ok)
        throw new Error(`Codeberg returned status: ${response.status}`);
      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      console.error("[Store] Database fetch failed:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-local-versions", () => {
    const versions = {};
    if (fs.existsSync(addonsDir)) {
      const folders = fs.readdirSync(addonsDir);
      folders.forEach((folder) => {
        const versionPath = path.join(addonsDir, folder, "version.json");
        if (fs.existsSync(versionPath)) {
          try {
            versions[folder] = JSON.parse(
              fs.readFileSync(versionPath, "utf8"),
            ).version;
          } catch (e) {}
        } else {
          versions[folder] = "9999";
        }
      });
    }
    return versions;
  });

  ipcMain.handle(
    "install-addon",
    async (event, { addonId, zipUrl, version }) => {
      try {
        const AdmZip = require("adm-zip");
        console.log(`[Store] Downloading ${addonId} v${version}...`);
        const response = await fetch(zipUrl);
        if (!response.ok)
          throw new Error(`Download failed: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`[Store] Extracting ${addonId}...`);
        const zip = new AdmZip(buffer);
        const targetDir = path.join(addonsDir, addonId);
        zip.extractAllTo(targetDir, true);
        fs.writeFileSync(
          path.join(targetDir, "version.json"),
          JSON.stringify({ version }),
        );
        console.log(`[Store] Success!`);
        return { success: true };
      } catch (err) {
        console.error("[Store] Install failed:", err);
        return { success: false, error: err.message };
      }
    },
  );

  // --- Addon File System Handlers ---

  function getSafeAddonPath(addonId, filePath = "", { userId, shared } = {}) {
    let baseDir;
    if (shared) {
      baseDir = path.join(addonsDataDir, addonId, "shared");
    } else if (isValidUserId(userId)) {
      baseDir = path.join(addonsDataDir, addonId, userId);
    } else {
      baseDir = path.join(addonsDataDir, addonId);
    }
    const fullPath = path.join(baseDir, filePath);
    const resolvedPath = path.resolve(fullPath);

    if (!resolvedPath.startsWith(path.resolve(baseDir))) {
      throw new Error("Access denied: Path is outside of addon directory");
    }
    return resolvedPath;
  }

  // Resolve path for reading: try per-user first, then fall back to addon root (migration assist)
  function getSafeAddonReadPath(addonId, filePath, { userId, shared } = {}) {
    const primaryPath = getSafeAddonPath(addonId, filePath, { userId, shared });
    if (fs.existsSync(primaryPath)) return primaryPath;
    // If per-user or shared path doesn't exist, fall back to addon root
    if (userId || shared) {
      const fallbackPath = getSafeAddonPath(addonId, filePath);
      if (fs.existsSync(fallbackPath)) return fallbackPath;
    }
    return primaryPath; // Return primary even if missing (caller handles non-existence)
  }

  ipcMain.handle("addon-fs-read", (event, { addonId, filePath, userId, shared }) => {
    console.log(`[IPC] addon-fs-read: ${addonId}/${filePath} (user: ${userId || "global"}, shared: ${!!shared})`);
    try {
      const safePath = getSafeAddonReadPath(addonId, filePath, { userId, shared });
      if (fs.existsSync(safePath)) {
        return fs.readFileSync(safePath, "utf8");
      }
      return null;
    } catch (e) {
      console.error(`[Addons FS] Read failed: ${e.message}`);
      throw e;
    }
  });

  ipcMain.handle("addon-fs-write", (event, { addonId, filePath, data, userId, shared }) => {
    console.log(`[IPC] addon-fs-write: ${addonId}/${filePath} (user: ${userId || "global"}, shared: ${!!shared})`);
    try {
      const safePath = getSafeAddonPath(addonId, filePath, { userId, shared });
      const dir = path.dirname(safePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(safePath, data, "utf8");
      return { success: true };
    } catch (e) {
      console.error(`[Addons FS] Write failed: ${e.message}`);
      throw e;
    }
  });

  ipcMain.handle("addon-fs-list", (event, { addonId, subDir = "", userId, shared }) => {
    console.log(`[IPC] addon-fs-list: ${addonId}/${subDir} (user: ${userId || "global"}, shared: ${!!shared})`);
    try {
      const safePath = getSafeAddonPath(addonId, subDir, { userId, shared });
      if (fs.existsSync(safePath) && fs.lstatSync(safePath).isDirectory()) {
        return fs.readdirSync(safePath);
      }
      return [];
    } catch (e) {
      console.error(`[Addons FS] List failed: ${e.message}`);
      throw e;
    }
  });

  ipcMain.handle("addon-fs-delete", (event, { addonId, filePath, userId, shared }) => {
    console.log(`[IPC] addon-fs-delete: ${addonId}/${filePath} (user: ${userId || "global"}, shared: ${!!shared})`);
    try {
      const safePath = getSafeAddonPath(addonId, filePath, { userId, shared });
      if (fs.existsSync(safePath)) {
        fs.rmSync(safePath, { recursive: true, force: true });
        return { success: true };
      }
      return { success: false, error: "File not found" };
    } catch (e) {
      console.error(`[Addons FS] Delete failed: ${e.message}`);
      throw e;
    }
  });

  ipcMain.handle("addon-fs-exists", (event, { addonId, filePath, userId, shared }) => {
    try {
      const safePath = getSafeAddonPath(addonId, filePath, { userId, shared });
      if (fs.existsSync(safePath)) return true;
      // Also check fallback for per-user/shared reads
      if (userId || shared) {
        const fallbackPath = getSafeAddonPath(addonId, filePath);
        return fs.existsSync(fallbackPath);
      }
      return false;
    } catch (e) {
      return false;
    }
  });

  // --- Feature Config (native built-in features) ---
  const featureConfigPath = path.join(userDataDir, "feature-config.json");

  ipcMain.handle("get-feature-config", (event, userId) => {
    // Per-user feature config
    if (isValidUserId(userId)) {
      const perUserPath = getPerUserFeatureConfigPath(userId);
      if (fs.existsSync(perUserPath)) {
        try {
          return JSON.parse(fs.readFileSync(perUserPath, "utf8"));
        } catch (e) {}
      }
    }
    // Fallback to global
    try {
      if (fs.existsSync(featureConfigPath)) {
        return JSON.parse(fs.readFileSync(featureConfigPath, "utf8"));
      }
    } catch (e) {}
    return {};
  });

  ipcMain.handle("save-feature-config", (event, arg) => {
    // Accept both legacy format (data directly) and new format { data, userId }
    const data = arg?.data !== undefined ? arg.data : arg;
    const userId = arg?.userId;
    try {
      let targetPath;
      if (isValidUserId(userId)) {
        targetPath = getPerUserFeatureConfigPath(userId);
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      } else {
        targetPath = featureConfigPath;
      }
      fs.writeFileSync(targetPath, JSON.stringify(data, null, 4));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // --- App Version ---

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  // --- Client-level Settings (kloak-settings.json) ---

  ipcMain.handle("get-client-settings", () => {
    return loadSettings();
  });

  ipcMain.handle("save-client-settings", (event, patch) => {
    try {
      const current = loadSettings();
      const merged = { ...current, ...patch };
      saveSettings(merged);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // --- Account Management ---

  ipcMain.handle("get-accounts", () => {
    console.log("[IPC] get-accounts (handle) received");
    return loadAccounts();
  });

  ipcMain.handle("save-accounts", (event, data) => {
    console.log("[IPC] save-accounts (handle) received");
    try {
      saveAccounts(data);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // --- Active User ID (per-user instancing) ---

  ipcMain.handle("get-active-user-id", () => {
    return getLastActiveUserId();
  });

  ipcMain.on("set-active-user-id", (event, userId) => {
    console.log("[IPC] set-active-user-id received:", userId);
    if (!isValidUserId(userId)) return;
    setLastActiveUserId(userId);
    migrateToPerUser(userId);
    cleanupGlobalConfigs(userId);
  });

  // --- Addon Backend Hooks ---
  const addons = fs.readdirSync(addonsDir);
  addons.forEach((folder) => {
    const backendPath = path.join(addonsDir, folder, "backend.js");
    if (fs.existsSync(backendPath)) {
      try {
        const backendModule = require(backendPath);
        if (typeof backendModule.registerBackend === "function") {
          backendModule.registerBackend();
        } else {
          console.error(
            `[IPC] Backend for ${folder} does not export registerBackend().` +
              ` The addon may need to be updated.`,
          );
        }
      } catch (err) {
        console.error(`[IPC] Failed to load backend for ${folder}:`, err);
      }
    }
  });
}

module.exports = { registerIpcHandlers };
