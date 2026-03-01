/**
 * Quick Translate - Backend (Main Process)
 *
 * Manages a hidden BrowserWindow that runs the AI translation model
 * via @xenova/transformers loaded from CDN. The browser context uses
 * onnxruntime-web (WASM/WebGPU) natively, with models cached in the
 * browser's Cache API for offline use after first download.
 */
const { session, ipcMain, app, BrowserWindow } = require("electron");
const path = require("path");

let translatorWindow = null;
let workerReady = false;
let translateCallbacks = new Map();
let callIdCounter = 0;
let workerMessageHandler = null;

function getMainWindow() {
  try {
    const appRoot = app.getAppPath();
    const windowModule = require(
      path.join(appRoot, "src", "main", "window.js"),
    );
    return windowModule.getMainWindow();
  } catch (e) {
    try {
      const windowModule = require(path.join(require.main.path, "window.js"));
      return windowModule.getMainWindow();
    } catch (e2) {
      return null;
    }
  }
}

function sendToRenderer(channel, data) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

function destroyTranslatorWindow() {
  // Remove the IPC listener for this window
  if (workerMessageHandler) {
    ipcMain.removeListener("qt-worker-message", workerMessageHandler);
    workerMessageHandler = null;
  }

  if (translatorWindow && !translatorWindow.isDestroyed()) {
    translatorWindow.close();
  }
  translatorWindow = null;
  workerReady = false;

  for (const [id, cb] of translateCallbacks) {
    cb.reject(new Error("Translator unloaded"));
  }
  translateCallbacks.clear();
}

function handleWorkerMessage(msg) {
  switch (msg.type) {
    case "alive":
      console.log("[Quick Translate] Translator window is alive.");
      break;

    case "log":
      console.log(`[QT Worker] ${msg.text}`);
      break;

    case "progress":
      sendToRenderer("qt-status", {
        status: "downloading",
        percent: msg.percent,
        file: msg.file,
      });
      break;

    case "ready":
      console.log("[Quick Translate] Model loaded and ready.");
      workerReady = true;
      sendToRenderer("qt-status", { status: "ready" });
      break;

    case "error":
      console.error("[Quick Translate] Worker error:", msg.error);
      workerReady = false;
      sendToRenderer("qt-status", {
        status: "error",
        message: msg.error,
      });
      break;

    case "result": {
      const cb = translateCallbacks.get(msg.id);
      if (cb) {
        translateCallbacks.delete(msg.id);
        if (msg.error) {
          cb.reject(new Error(msg.error));
        } else {
          cb.resolve(msg.text);
        }
      }
      break;
    }
  }
}

function createTranslatorWindow() {
  translatorWindow = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      preload: path.join(__dirname, "translator-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:translator",
      // Allows the file:// page to import ES modules from CDN.
      // Safe here: this is a non-user-facing, fully controlled hidden window.
      webSecurity: false,
    },
  });

  // Listen for messages from the hidden window
  workerMessageHandler = (event, msg) => {
    if (
      translatorWindow &&
      !translatorWindow.isDestroyed() &&
      event.sender === translatorWindow.webContents
    ) {
      handleWorkerMessage(msg);
    }
  };
  ipcMain.on("qt-worker-message", workerMessageHandler);

  // Handle renderer process crashes
  translatorWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      "[Quick Translate] Translator window crashed:",
      details.reason,
    );
    workerReady = false;
    translatorWindow = null;

    if (workerMessageHandler) {
      ipcMain.removeListener("qt-worker-message", workerMessageHandler);
      workerMessageHandler = null;
    }

    for (const [id, cb] of translateCallbacks) {
      cb.reject(new Error("Translator process crashed"));
    }
    translateCallbacks.clear();

    sendToRenderer("qt-status", {
      status: "error",
      message: `Translator crashed: ${details.reason}. Try re-initializing.`,
    });
  });

  translatorWindow.on("closed", () => {
    translatorWindow = null;
  });

  translatorWindow.loadFile(path.join(__dirname, "translator.html"));
}

function sendToWorker(data) {
  if (translatorWindow && !translatorWindow.isDestroyed()) {
    translatorWindow.webContents.send("qt-worker-command", data);
  }
}

function registerBackend() {
  const appSession = session.fromPartition("persist:kloak");
  console.log(
    "[Quick Translate] Registering Backend (Hidden BrowserWindow Mode)...",
  );

  // IPC: Initialize
  ipcMain.handle("init-translator", async () => {
    console.log("[Quick Translate] Init requested by renderer.");
    destroyTranslatorWindow();
    createTranslatorWindow();

    if (!translatorWindow) {
      return { success: false, error: "Translator window failed to create" };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          success: false,
          error: "Translator failed to start within 15s",
        });
      }, 15000);

      const onMessage = (_event, msg) => {
        if (
          translatorWindow &&
          !translatorWindow.isDestroyed() &&
          _event.sender === translatorWindow.webContents &&
          msg.type === "alive"
        ) {
          ipcMain.removeListener("qt-worker-message", onMessage);
          clearTimeout(timeout);
          sendToWorker({ type: "init" });
          resolve({ success: true, pending: true });
        }
      };

      ipcMain.on("qt-worker-message", onMessage);
    });
  });

  // IPC: Unload (close window, keep cache)
  ipcMain.handle("unload-translator", async () => {
    console.log("[Quick Translate] Unload requested.");
    destroyTranslatorWindow();
    sendToRenderer("qt-status", { status: "unloaded" });
    return { success: true };
  });

  // IPC: Delete cache (close window + wipe cached models from browser storage)
  ipcMain.handle("delete-translator-cache", async () => {
    console.log("[Quick Translate] Delete cache requested.");
    destroyTranslatorWindow();

    try {
      const translatorSession = session.fromPartition("persist:translator");
      await translatorSession.clearStorageData({
        storages: ["cachestorage", "indexdb", "localstorage"],
      });
      console.log("[Quick Translate] Cleared translator browser storage.");
    } catch (e) {
      console.error(
        "[Quick Translate] Failed to clear storage:",
        e.message,
      );
    }

    sendToRenderer("qt-status", { status: "unloaded" });
    return { success: true };
  });

  // IPC: Translate
  ipcMain.handle("translate-text", async (_event, { text, src, tgt }) => {
    if (!translatorWindow || translatorWindow.isDestroyed() || !workerReady) {
      return { success: false, error: "Translator not ready" };
    }

    const id = callIdCounter++;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        translateCallbacks.delete(id);
        resolve({ success: false, error: "Translation timed out (30s)" });
      }, 30000);

      translateCallbacks.set(id, {
        resolve: (translatedText) => {
          clearTimeout(timeout);
          resolve({ success: true, text: translatedText });
        },
        reject: (err) => {
          clearTimeout(timeout);
          resolve({ success: false, error: err.message });
        },
      });

      sendToWorker({ type: "translate", id, text, src, tgt });
    });
  });

  // CSP bypass for HuggingFace model downloads (main window session)
  appSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = Object.assign({}, details.responseHeaders);
    const cspKey = Object.keys(responseHeaders).find(
      (k) => k.toLowerCase() === "content-security-policy",
    );
    if (cspKey) {
      let csp = responseHeaders[cspKey][0];
      if (csp.includes("connect-src")) {
        csp = csp.replace(
          /connect-src /g,
          "connect-src https://*.huggingface.co https://huggingface.co ",
        );
      }
      responseHeaders[cspKey][0] = csp;
    }
    callback({ cancel: false, responseHeaders });
  });
}

module.exports = { registerBackend };
