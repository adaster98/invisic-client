const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let addonsDir = !app.isPackaged
    ? path.join(app.getAppPath(), 'addons')
    : path.join(app.getPath('userData'), 'addons');

let addonStatesPath = path.join(addonsDir, 'addon-states.json');

if (!fs.existsSync(addonsDir)) {
    fs.mkdirSync(addonsDir, { recursive: true });
}

console.log(`[Addons] Directory: ${addonsDir}`);
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
    addonStatesPath,
    openAddonsFolder
};
