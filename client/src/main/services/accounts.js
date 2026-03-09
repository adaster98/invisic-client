const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const accountsPath = path.join(app.getPath("userData"), "accounts.json");

function loadAccounts() {
  try {
    if (fs.existsSync(accountsPath)) {
      const data = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
      console.log(`[Accounts] Loaded from ${accountsPath}`);
      if (data && Array.isArray(data.accounts)) return data;
    }
  } catch (e) {
    console.error(`[Accounts] Failed to load: ${e.message}`);
  }
  return { accounts: [] };
}

function saveAccounts(data) {
  try {
    fs.writeFileSync(accountsPath, JSON.stringify(data, null, 4));
    console.log(`[Accounts] Saved to ${accountsPath}`);
  } catch (e) {
    console.error(`[Accounts] Failed to save: ${e.message}`);
  }
}

module.exports = { loadAccounts, saveAccounts };
