/**
 * Quick Translate - Translator Window Preload
 *
 * Minimal IPC bridge for the hidden BrowserWindow that runs the AI model.
 * Exposes window.bridge.send() and window.bridge.onMessage() only.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridge", {
  send: (data) => ipcRenderer.send("qt-worker-message", data),
  onMessage: (callback) => {
    ipcRenderer.on("qt-worker-command", (_event, data) => callback(data));
  },
});
