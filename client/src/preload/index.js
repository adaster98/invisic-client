const { contextBridge, ipcRenderer } = require("electron");

let modalCallback = null;

const api = {
  minimize: () => ipcRenderer.send("window-min"),
  maximize: () => ipcRenderer.send("window-max"),
  close: () => ipcRenderer.send("window-close"),
  log: (msg) =>
    ipcRenderer.send(
      "terminal-log",
      typeof msg === "string" ? msg : JSON.stringify(msg),
    ),
  onModalEvent: (cb) => {
    modalCallback = cb;
    ipcRenderer.send("terminal-log", "Modal callback registered.");
  },
  permissionResponse: (id, allowed) =>
    ipcRenderer.send("permission-response", { id, allowed }),
  linkWarningResponse: (url, allowed, remember) =>
    ipcRenderer.send("link-warning-response", { url, allowed, remember }),
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
  getThemeFiles: () => ipcRenderer.invoke("get-theme-files"),

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
        // For other allowed channels, pass arguments
        ipcRenderer.send(target, ...args);
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
ipcRenderer.on("show-custom-permission", (event, data) => {
  if (modalCallback) modalCallback("show-custom-permission", data);
});
ipcRenderer.on("show-link-warning", (event, data) => {
  if (modalCallback) modalCallback("show-link-warning", data);
});
ipcRenderer.on("show-screen-picker", (event, data) => {
  if (modalCallback) modalCallback("show-screen-picker", data);
});
