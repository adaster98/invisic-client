const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let addonsDir = !app.isPackaged
    ? path.join(app.getAppPath(), 'addons')
    : path.join(app.getPath('userData'), 'addons');

// Data dir always lives in userData — keeps configs/states out of the repo tree in dev
let addonsDataDir = path.join(app.getPath('userData'), 'addons');

let addonStatesPath = path.join(addonsDataDir, 'addon-states.json');

if (!fs.existsSync(addonsDir)) {
    fs.mkdirSync(addonsDir, { recursive: true });
}
if (!fs.existsSync(addonsDataDir)) {
    fs.mkdirSync(addonsDataDir, { recursive: true });
}

console.log(`[Addons] Code directory: ${addonsDir}`);
console.log(`[Addons] Data directory: ${addonsDataDir}`);
console.log(`[Addons] States file: ${addonStatesPath}`);


function openAddonsFolder(subPath) {
    let targetPath = addonsDir;
    if (subPath && typeof subPath === 'string') {
        targetPath = path.join(addonsDir, subPath);
        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }
    }
    shell.openPath(targetPath);
}

module.exports = {
    addonsDir,
    addonsDataDir,
    addonStatesPath,
    openAddonsFolder
};
