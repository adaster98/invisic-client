const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const settingsPath = path.join(app.getPath("userData"), "kloak-settings.json");

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, "utf8");
      console.log(`[Settings] Loaded from ${settingsPath}`);
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`[Settings] Failed to load: ${e.message}`);
  }
  return {
    firstLaunchDone: false,
    savedPermissions: {},
    skipLinkWarning: false,
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
    console.log(`[Settings] Saved to ${settingsPath}`);
  } catch (e) {
    console.error(`[Settings] Failed to save: ${e.message}`);
  }
}

module.exports = { loadSettings, saveSettings };
