const { contextBridge, ipcRenderer } = require("electron");

let modalCallback = null;

const api = {
  minimize: () => ipcRenderer.send("window-min"),
  maximize: () => ipcRenderer.send("window-max"),
  close: () => ipcRenderer.send("window-close"),
  log: (msg) => {
    try {
      const sanitized = typeof msg === "string" ? msg : JSON.stringify(msg);
      ipcRenderer.send("terminal-log", sanitized);
    } catch (e) {
      ipcRenderer.send(
        "terminal-log",
        "[Logger Error] Could not stringify msg",
      );
    }
  },
  onModalEvent: (cb) => {
    modalCallback = cb;
    ipcRenderer.send("terminal-log", "Modal callback registered.");
  },
  permissionResponse: (id, allowed) =>
    ipcRenderer.send("permission-response", { id, allowed }),
  screenShareSelected: (sourceId) =>
    ipcRenderer.send("screen-share-selected", sourceId),
  openExternalUrl: (url) => ipcRenderer.send("open-external-url", url),
  openAddonsFolder: (subPath) =>
    ipcRenderer.send("open-addons-folder", subPath),
  getAddonStates: () => ipcRenderer.invoke("get-addon-states"),
  saveAddonState: (data) => ipcRenderer.send("save-addon-state", data),
  getLocalVersions: () => ipcRenderer.invoke("get-local-versions"),
  installAddon: (data) => ipcRenderer.invoke("install-addon", data),
  fetchStoreData: () => ipcRenderer.invoke("fetch-store-data"),
  getAddonConfig: (addonId) => ipcRenderer.invoke("get-addon-config", addonId),
  saveAddonConfig: (data) => ipcRenderer.send("save-addon-config", data),
  getFeatureConfig: () => ipcRenderer.invoke("get-feature-config"),
  saveFeatureConfig: (data) => ipcRenderer.invoke("save-feature-config", data),
  getAccounts: () => ipcRenderer.invoke("get-accounts"),
  saveAccounts: (data) => ipcRenderer.invoke("save-accounts", data),
  getUserAddonConfig: (addonId, userId) =>
    ipcRenderer.invoke("get-user-addon-config", { addonId, userId }),
  saveUserAddonConfig: (addonId, userId, data) =>
    ipcRenderer.invoke("save-user-addon-config", { addonId, userId, data }),
  getThemeFiles: () => ipcRenderer.invoke("get-theme-files"),
  openUserThemesFolder: () => ipcRenderer.send("open-user-themes-folder"),
  startUpdate: (version) => ipcRenderer.send("start-update", { version }),
  quitAndInstall: () => ipcRenderer.send("quit-and-install"),
  triggerDebugUpdate: () => ipcRenderer.send("debug-update-trigger"),
  initTranslator: () => ipcRenderer.invoke("init-translator"),
  unloadTranslator: () => ipcRenderer.invoke("unload-translator"),
  deleteTranslatorCache: () => ipcRenderer.invoke("delete-translator-cache"),
  translateText: (text, src, tgt) =>
    ipcRenderer.invoke("translate-text", { text, src, tgt }),
  platform: process.platform,

  // FS API for Addons
  readAddonFile: (addonId, filePath) =>
    ipcRenderer.invoke("addon-fs-read", { addonId, filePath }),
  writeAddonFile: (addonId, filePath, data) =>
    ipcRenderer.invoke("addon-fs-write", { addonId, filePath, data }),
  listAddonFiles: (addonId, subDir) =>
    ipcRenderer.invoke("addon-fs-list", { addonId, subDir }),
  deleteAddonFile: (addonId, filePath) =>
    ipcRenderer.invoke("addon-fs-delete", { addonId, filePath }),
  addonFileExists: (addonId, filePath) =>
    ipcRenderer.invoke("addon-fs-exists", { addonId, filePath }),

  // Generic send/invoke for compatibility shims
  send: (channel, ...args) => {
    const allowedChannels = [
      "window-min",
      "window-max",
      "window-close",
      "terminal-log",
      "open-external-url",
      "start-update",
      "quit-and-install",
      "debug-update-trigger",
    ];

    // Map common aliases
    let target = channel;
    if (channel === "minimize" || channel === "minimise") target = "window-min";
    else if (channel === "maximize" || channel === "maximise")
      target = "window-max";
    else if (channel === "close" || channel === "exit" || channel === "quit")
      target = "window-close";

    if (allowedChannels.includes(target)) {
      // For window controls, NEVER pass arguments (website often passes Event objects)
      if (target.startsWith("window-")) {
        ipcRenderer.send(target);
      } else {
        // Sanitize arguments to prevent "An object could not be cloned" errors
        const sanitizedArgs = args.map((arg) => {
          try {
            // If it's a simple type or already safe, just return it
            if (arg === null || typeof arg !== "object") return arg;
            // Otherwise, flatten it to a clean JSON object
            return JSON.parse(JSON.stringify(arg));
          } catch (e) {
            return `[Unclonable ${typeof arg}]`;
          }
        });
        ipcRenderer.send(target, ...sanitizedArgs);
      }
    }
  },
  invoke: (channel, ...args) => {
    const allowedChannels = [
      "get-addon-states",
      "get-addon-config",
      "addon-fs-read",
      "addon-fs-write",
      "addon-fs-list",
      "addon-fs-delete",
      "addon-fs-exists",
      "init-translator",
      "unload-translator",
      "delete-translator-cache",
      "translate-text",
      "get-accounts",
      "save-accounts",
      "get-user-addon-config",
      "save-user-addon-config",
    ];
    if (allowedChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

// Setup IPC Listeners that bridge to the callback
ipcRenderer.on("update-status", (event, data) => {
  if (modalCallback) modalCallback("update-status", data);
});
ipcRenderer.on("update-progress", (event, data) => {
  if (modalCallback) modalCallback("update-progress", data);
});
ipcRenderer.on("show-custom-permission", (event, data) => {
  if (modalCallback) modalCallback("show-custom-permission", data);
});
ipcRenderer.on("show-screen-picker", (event, data) => {
  if (modalCallback) modalCallback("show-screen-picker", data);
});
ipcRenderer.on("qt-status", (event, data) => {
  document.dispatchEvent(new CustomEvent("qt-status", { detail: data }));
});
