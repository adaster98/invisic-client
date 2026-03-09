const {
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { loadSettings, saveSettings } = require("./services/settings");
const {
  handlePermissionRequest,
  pendingPermissions,
} = require("./services/permissions");
const { addonsDir } = require("./services/addons");
const { checkForCustomUpdate } = require("./services/updater");

let mainWindow;
let screenSources = [];
let screenShareCallback = null;

function getMainWindow() {
  return mainWindow;
}

function getScreenState() {
  return { screenSources, screenShareCallback };
}

function setScreenShareCallback(cb) {
  screenShareCallback = cb;
}

function setScreenSources(sources) {
  screenSources = sources;
}

function createWindow() {
  let appSettings = loadSettings();

  // Ensure user themes folder exists on startup
  const userThemesDir = path.join(app.getPath("userData"), "themes");
  if (!fs.existsSync(userThemesDir)) fs.mkdirSync(userThemesDir, { recursive: true });

  let splashWindow = new BrowserWindow({
    width: 350,
    height: 450,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    icon: path.join(__dirname, "../../icons/icon.png"),
  });

  splashWindow.loadFile(path.join(__dirname, "../../splash.html"));

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    icon: path.join(__dirname, "../../icons/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:kloak",
      experimentalFeatures: true,
    },
  });

  const appSession = session.fromPartition("persist:kloak");

  const appUserAgent =
    mainWindow.webContents.getUserAgent() + " KloakClient Electron Tauri";
  mainWindow.webContents.setUserAgent(appUserAgent);

  mainWindow.webContents.on("did-finish-load", () => {
    try {
      // Inject CSS
      let stylesPath = path.join(
        app.getAppPath(),
        "src",
        "renderer",
        "styles.css",
      );
      if (fs.existsSync(stylesPath)) {
        const cssCode = fs.readFileSync(stylesPath, "utf8");
        mainWindow.webContents.insertCSS(cssCode);
      }

      // Inject Theme Engine (after CSS, before modal/addons)
      let themeEnginePath = path.join(
        app.getAppPath(),
        "src",
        "renderer",
        "theme-engine.js",
      );
      if (fs.existsSync(themeEnginePath)) {
        const themeEngineCode = fs.readFileSync(themeEnginePath, "utf8");
        mainWindow.webContents
          .executeJavaScript(themeEngineCode)
          .catch(console.error);
      }

      // Inject Modal Renderer
      let modalRendererPath = path.join(
        app.getAppPath(),
        "src",
        "renderer",
        "modal-renderer.js",
      );
      if (fs.existsSync(modalRendererPath)) {
        const modalCode = fs.readFileSync(modalRendererPath, "utf8");
        mainWindow.webContents.executeJavaScript(modalCode);
      }

      let apiPath = path.join(
        app.getAppPath(),
        "src",
        "renderer",
        "addon-api.js",
      );
      if (fs.existsSync(apiPath)) {
        const apiCode = fs.readFileSync(apiPath, "utf8");
        mainWindow.webContents.executeJavaScript(apiCode).catch(console.error);
      }

      // Inject Native Features (stealth mode + quick edit)
      let nativeFeaturesPath = path.join(
        app.getAppPath(),
        "src",
        "renderer",
        "native-features.js",
      );
      if (fs.existsSync(nativeFeaturesPath)) {
        const nativeFeaturesCode = fs.readFileSync(nativeFeaturesPath, "utf8");
        mainWindow.webContents
          .executeJavaScript(nativeFeaturesCode)
          .catch(console.error);
      }

      // Inject DM Folders
      let dmFoldersPath = path.join(
        app.getAppPath(),
        "src",
        "renderer",
        "dm-folders.js",
      );
      if (fs.existsSync(dmFoldersPath)) {
        const dmFoldersCode = fs.readFileSync(dmFoldersPath, "utf8");
        mainWindow.webContents
          .executeJavaScript(dmFoldersCode)
          .catch(console.error);
      }

      // Inject Account Switcher
      let accountSwitcherPath = path.join(
        app.getAppPath(),
        "src",
        "renderer",
        "account-switcher.js",
      );
      if (fs.existsSync(accountSwitcherPath)) {
        const accountSwitcherCode = fs.readFileSync(accountSwitcherPath, "utf8");
        mainWindow.webContents
          .executeJavaScript(accountSwitcherCode)
          .catch(console.error);
      }

      let managerPath = path.join(
        app.getAppPath(),
        "src",
        "renderer",
        "addon-manager.js",
      );
      if (fs.existsSync(managerPath)) {
        const managerCode = fs.readFileSync(managerPath, "utf8");
        mainWindow.webContents
          .executeJavaScript(managerCode)
          .then(() => {
            console.log("SUCCESS: Addon Manager injected!");
            if (fs.existsSync(addonsDir)) {
              const folders = fs.readdirSync(addonsDir);
              folders.forEach((folder) => {
                const addonScript = path.join(addonsDir, folder, "index.js");
                if (fs.existsSync(addonScript)) {
                  const code = fs.readFileSync(addonScript, "utf8");
                  mainWindow.webContents
                    .executeJavaScript(code)
                    .then(() => console.log(`Loaded Addon: ${folder}`))
                    .catch((err) =>
                      console.error(`Error in addon ${folder}:`, err),
                    );
                }
              });
            }
          })
          .catch((err) => console.error("Manager execution failed:", err));
      }
    } catch (err) {
      console.error("Addon injection sequence failed:", err);
    }
  });

  mainWindow.loadURL("https://kloak.app/app");

  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      mainWindow.show();
      mainWindow.focus();

      // Trigger update check from main process directly
      const fakeEvent = {
        reply: (channel, data) => mainWindow.webContents.send(channel, data),
      };
      checkForCustomUpdate(fakeEvent);

      // Re-check for updates every 5 minutes
      setInterval(
        () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            const intervalEvent = {
              reply: (channel, data) =>
                mainWindow.webContents.send(channel, data),
            };
            checkForCustomUpdate(intervalEvent);
          }
        },
        5 * 60 * 1000,
      );

      if (!appSettings.firstLaunchDone) {
        const permsToAsk = ["media", "notifications"];
        let currentIdx = 0;

        function promptNext() {
          if (currentIdx >= permsToAsk.length) {
            // Reload to get any permissions saved by handlePermissionResponse
            let finalSettings = loadSettings();
            finalSettings.firstLaunchDone = true;
            saveSettings(finalSettings);
            return;
          }
          const perm = permsToAsk[currentIdx];
          currentIdx++;
          if (
            appSettings.savedPermissions &&
            appSettings.savedPermissions[perm] === true
          ) {
            promptNext();
            return;
          }
          const reqId = `first-launch-${perm}-${Date.now()}`;
          pendingPermissions[reqId] = {
            permission: perm,
            callback: (allowed) => {
              // Permission is already saved by handlePermissionResponse in permissions service
              setTimeout(promptNext, 400);
            },
          };
          mainWindow.webContents.send("show-custom-permission", {
            id: reqId,
            permission: perm,
          });
        }
        setTimeout(promptNext, 2000);
      }
    }, 500);
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) {
      event.preventDefault();
      return;
    }
    // Redirect external links (non-kloak) to the system browser
    if (
      !url.startsWith("https://kloak.app") &&
      !url.startsWith("http://kloak.app")
    ) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("file://")) return { action: "deny" };
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-finish-load", () => {
    const settings = loadSettings();
    const cornerEnabled = settings.cornerRoundingEnabled !== false;
    const cornerRadius = settings.cornerRadius != null ? settings.cornerRadius : 20;
    const radiusVal = cornerEnabled ? `${cornerRadius}px` : "0px";
    mainWindow.webContents.insertCSS(`
        html, body { border-radius: ${radiusVal}; overflow: hidden; background: transparent !important; }
        #app, #root, body > div:first-child { background-color: #0f0f0f !important; transition: background-color 0.2s ease; height: 100vh; width: 100vw; }
        .h-9.w-full.border-b { -webkit-app-region: drag !important; user-select: none; }
        .h-9.w-full.border-b button { -webkit-app-region: no-drag !important; cursor: pointer !important; }
        * { backdrop-filter: none !important; }
        `);
  });

  appSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      handlePermissionRequest(
        webContents,
        permission,
        callback,
        details,
        mainWindow,
      );
    },
  );

  mainWindow.on("maximize", () => {
    mainWindow.webContents
      .executeJavaScript(
        'document.documentElement.classList.add("invisic-maximized"); document.body.classList.add("invisic-maximized");',
      )
      .catch(() => {});
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents
      .executeJavaScript(
        'document.documentElement.classList.remove("invisic-maximized"); document.body.classList.remove("invisic-maximized");',
      )
      .catch(() => {});
  });

  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  appSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 300, height: 300 },
      })
      .then((sources) => {
        setScreenSources(sources);
        setScreenShareCallback(callback);
        const cleanSources = sources.map((source) => ({
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail.toDataURL(),
        }));
        mainWindow.webContents.send("show-screen-picker", cleanSources);
      })
      .catch((err) => {
        console.error("Error getting screen sources:", err);
        callback(null);
      });
  });

  return mainWindow;
}

module.exports = {
  createWindow,
  getMainWindow,
  getScreenState,
  setScreenShareCallback,
  setScreenSources,
};
