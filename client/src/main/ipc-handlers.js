const { ipcMain, shell } = require("electron");
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
  openAddonsFolder,
  addonsDir,
  addonStatesPath,
} = require("./services/addons");
const { handlePermissionResponse } = require("./services/permissions");
const { checkForCustomUpdate } = require("./services/updater");

function registerIpcHandlers() {
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

  ipcMain.on("link-warning-response", (event, { url, allowed, remember }) => {
    console.log("[IPC] link-warning-response received:", {
      url,
      allowed,
      remember,
    });
    let appSettings = loadSettings();
    if (remember) {
      appSettings.skipLinkWarning = true;
      saveSettings(appSettings);
    }
    if (allowed) {
      shell.openExternal(url);
    }
  });

  ipcMain.on("check-custom-update", (event) => {
    console.log("[IPC] check-custom-update received");
    checkForCustomUpdate(event);
  });

  ipcMain.on("open-external-url", (event, url) => {
    console.log("[IPC] open-external-url received:", url);
    if (url) shell.openExternal(url);
  });

  ipcMain.handle("get-addon-states", () => {
    console.log("[IPC] get-addon-states (handle) received");
    if (fs.existsSync(addonStatesPath)) {
      try {
        return JSON.parse(fs.readFileSync(addonStatesPath, "utf8"));
      } catch (e) {}
    }
    return {};
  });

  ipcMain.on("save-addon-state", (event, { addonId, enabled }) => {
    console.log("[IPC] save-addon-state received:", { addonId, enabled });
    try {
      let states = {};
      if (fs.existsSync(addonStatesPath)) {
        try {
          states = JSON.parse(fs.readFileSync(addonStatesPath, "utf8"));
        } catch (e) {}
      }
      states[addonId] = enabled;
      fs.writeFileSync(
        addonStatesPath,
        JSON.stringify(states, null, 4),
        "utf8",
      );
      console.log(
        `[Addons] State saved: ${addonId} = ${enabled} → ${addonStatesPath}`,
      );
    } catch (err) {
      console.error("[Addons] Failed to save addon state:", err);
    }
  });

  ipcMain.handle("get-addon-config", (event, addonId) => {
    console.log("[IPC] get-addon-config (handle) received:", addonId);
    const configPath = path.join(addonsDir, addonId, "config.json");
    if (fs.existsSync(configPath)) {
      try {
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch (e) {}
    }
    return {};
  });

  ipcMain.on("save-addon-config", (event, { addonId, data }) => {
    console.log("[IPC] save-addon-config received:", { addonId });
    try {
      const addonFolder = path.join(addonsDir, addonId);
      if (!fs.existsSync(addonFolder))
        fs.mkdirSync(addonFolder, { recursive: true });
      const configPath = path.join(addonFolder, "config.json");
      fs.writeFileSync(configPath, JSON.stringify(data, null, 4), "utf8");
      console.log(`[Addons] Config saved for ${addonId} → ${configPath}`);
    } catch (err) {
      console.error("[Addons] Failed to save addon config:", err);
    }
  });

  ipcMain.handle("get-theme-files", () => {
    const themesDir = path.join(addonsDir, "theme-injector", "themes");
    if (!fs.existsSync(themesDir)) {
      fs.mkdirSync(themesDir, { recursive: true });
      return [];
    }
    try {
      const files = fs.readdirSync(themesDir).filter((f) => f.endsWith(".css"));
      return files.map((f) => ({
        filename: f,
        name: f.replace(".css", "").replace(/-/g, " "),
        content: fs.readFileSync(path.join(themesDir, f), "utf8"),
      }));
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle("fetch-store-data", async () => {
    try {
      const dbUrl =
        "https://codeberg.org/adaster98/kloak-client-unofficial/raw/branch/main/addons/store.json?t=" +
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
          versions[folder] = "9.9.9";
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
}

module.exports = { registerIpcHandlers };
