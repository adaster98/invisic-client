/**
 * Quick Translate - Backend (Main Process)
 *
 * Manages a forked child process that runs the AI translation model.
 * If the child crashes (SIGTRAP, OOM, etc.), it reports a clean error
 * to the UI without taking down the Electron process.
 */
const { session, ipcMain, app } = require("electron");
const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

let worker = null;
let workerReady = false;
let translateCallbacks = new Map();
let callIdCounter = 0;

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

function killWorker() {
  if (worker) {
    try {
      worker.kill();
    } catch (e) {}
    worker = null;
  }
  workerReady = false;

  for (const [id, cb] of translateCallbacks) {
    cb.reject(new Error("Translator unloaded"));
  }
  translateCallbacks.clear();
}

function spawnWorker() {
  const workerPath = path.join(__dirname, "translator-worker.js");
  console.log("[Quick Translate] Spawning isolated worker:", workerPath);

  // Resolve the app root — use the unpacked path for forked processes
  let appRoot = app.getAppPath();
  if (appRoot.includes(".asar")) {
    const unpackedRoot = appRoot.replace(".asar", ".asar.unpacked");
    if (fs.existsSync(unpackedRoot)) {
      appRoot = unpackedRoot;
    }
  }

  worker = fork(workerPath, [], {
    cwd: appRoot,
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      KLOAK_APP_ROOT: app.getAppPath(),
      NODE_PATH: path.join(appRoot, "node_modules"),
    },
  });

  worker.stdout.on("data", (data) => {
    console.log(`[QT Worker stdout] ${data.toString().trim()}`);
  });
  worker.stderr.on("data", (data) => {
    const text = data.toString().trim();
    if (!text.includes("CleanUnusedInitializersAndNodeArgs")) {
      console.error(`[QT Worker stderr] ${text}`);
    }
  });

  worker.on("message", (msg) => {
    switch (msg.type) {
      case "alive":
        console.log("[Quick Translate] Worker process is alive.");
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
        console.log("[Quick Translate] Worker: Model loaded and ready.");
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
  });

  worker.on("exit", (code, signal) => {
    console.error(
      `[Quick Translate] Worker exited: code=${code}, signal=${signal}`,
    );
    workerReady = false;
    worker = null;

    for (const [id, cb] of translateCallbacks) {
      cb.reject(new Error("Worker process exited unexpectedly"));
    }
    translateCallbacks.clear();

    const reason =
      signal === "SIGTRAP"
        ? "Native ONNX runtime crashed (SIGTRAP). Try restarting the app."
        : `Worker process died (code: ${code}, signal: ${signal})`;

    sendToRenderer("qt-status", { status: "error", message: reason });
  });

  worker.on("error", (err) => {
    console.error("[Quick Translate] Worker spawn error:", err);
    workerReady = false;
    worker = null;
    sendToRenderer("qt-status", {
      status: "error",
      message: `Failed to spawn worker: ${err.message}`,
    });
  });
}

function registerBackend() {
  const appSession = session.fromPartition("persist:kloak");
  console.log("[Quick Translate] Registering Backend (Child Process Mode)...");

  // IPC: Initialize
  ipcMain.handle("init-translator", async () => {
    console.log("[Quick Translate] Init requested by renderer.");
    killWorker();
    spawnWorker();

    const currentWorker = worker;
    if (!currentWorker) {
      return { success: false, error: "Worker failed to spawn" };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (currentWorker) {
          currentWorker.removeListener("message", onMessage);
        }
        resolve({ success: false, error: "Worker failed to start within 10s" });
      }, 10000);

      const onMessage = (msg) => {
        if (msg.type === "alive") {
          currentWorker.removeListener("message", onMessage);
          clearTimeout(timeout);
          currentWorker.send({ type: "init" });
          resolve({ success: true, pending: true });
        }
      };

      currentWorker.on("message", onMessage);
    });
  });

  // IPC: Unload (kill worker, keep cache)
  ipcMain.handle("unload-translator", async () => {
    console.log("[Quick Translate] Unload requested.");
    killWorker();
    sendToRenderer("qt-status", { status: "unloaded" });
    return { success: true };
  });

  // IPC: Delete cache (kill worker + wipe cached model)
  ipcMain.handle("delete-translator-cache", async () => {
    console.log("[Quick Translate] Delete cache requested.");
    killWorker();

    const possibleCacheDirs = [
      path.join(
        os.homedir(),
        ".cache",
        "huggingface",
        "hub",
        "models--Xenova--nllb-200-distilled-600M",
      ),
      path.join(
        os.homedir(),
        ".cache",
        "huggingface",
        "transformers",
        "Xenova",
        "nllb-200-distilled-600M",
      ),
    ];

    let deleted = false;
    for (const dir of possibleCacheDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(`[Quick Translate] Deleted cache: ${dir}`);
          deleted = true;
        } catch (e) {
          console.error(
            `[Quick Translate] Failed to delete ${dir}:`,
            e.message,
          );
        }
      }
    }

    sendToRenderer("qt-status", { status: "unloaded" });
    return { success: true, deleted };
  });

  // IPC: Translate
  ipcMain.handle("translate-text", async (event, { text, src, tgt }) => {
    if (!worker || !workerReady) {
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

      worker.send({ type: "translate", id, text, src, tgt });
    });
  });

  // CSP bypass for HuggingFace model downloads
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
