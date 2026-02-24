const { systemPreferences } = require("electron");
const { loadSettings, saveSettings } = require("./settings");

let pendingPermissions = {};

function handlePermissionRequest(
  webContents,
  permission,
  callback,
  details,
  mainWindow,
) {
  const permissionsToPrompt = ["media", "geolocation", "notifications"];
  let appSettings = loadSettings();

  if (permissionsToPrompt.includes(permission)) {
    if (
      permission === "media" &&
      (process.platform === "win32" || process.platform === "darwin")
    ) {
      const micStatus = systemPreferences.getMediaAccessStatus("microphone");
      if (micStatus === "denied") return callback(false);
    }

    if (
      appSettings.savedPermissions &&
      appSettings.savedPermissions[permission] === true
    ) {
      return callback(true);
    }

    const reqId = Date.now().toString();
    pendingPermissions[reqId] = { callback, permission };

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("show-custom-permission", {
        id: reqId,
        permission: permission,
      });
    }
  } else {
    callback(true);
  }
}

function handlePermissionResponse(id, allowed) {
  console.log(`[Permissions] Handling response for ${id}: allowed=${allowed}`);
  if (pendingPermissions[id]) {
    const { callback, permission } = pendingPermissions[id];
    let appSettings = loadSettings();
    if (!appSettings.savedPermissions) {
      appSettings.savedPermissions = {};
    }
    appSettings.savedPermissions[permission] = allowed;
    saveSettings(appSettings);

    console.log(`[Permissions] Granted ${permission} and saved to settings.`);
    callback(allowed);
    delete pendingPermissions[id];
  } else {
    console.warn(`[Permissions] No pending request found for ID: ${id}`);
  }
}

function getPendingPermissions() {
  return pendingPermissions;
}

module.exports = {
  handlePermissionRequest,
  handlePermissionResponse,
  getPendingPermissions,
  pendingPermissions,
};
