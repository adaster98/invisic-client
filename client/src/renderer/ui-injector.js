const { ipcRenderer } = require("electron");

function injectUI() {
  // -------------------------------------------------------------------------
  // Update Status Handler
  // -------------------------------------------------------------------------
  ipcRenderer.on("update-status", (event, data) => {
    window.dispatchEvent(
      new CustomEvent("kloak:update-status", { detail: data }),
    );
  });

  // -------------------------------------------------------------------------
  // Custom Permission Request Modal
  // -------------------------------------------------------------------------
  ipcRenderer.on("show-custom-permission", (event, data) => {
    window.dispatchEvent(
      new CustomEvent("kloak:show-custom-permission", { detail: data }),
    );
  });

  // -------------------------------------------------------------------------
  // External Link Warning Modal
  // -------------------------------------------------------------------------
  ipcRenderer.on("show-link-warning", (event, url) => {
    window.dispatchEvent(
      new CustomEvent("kloak:show-link-warning", { detail: url }),
    );
  });

  // -------------------------------------------------------------------------
  // Screen Share Picker Modal
  // -------------------------------------------------------------------------
  ipcRenderer.on("show-screen-picker", (event, sources) => {
    window.dispatchEvent(
      new CustomEvent("kloak:show-screen-picker", { detail: sources }),
    );
  });
}

module.exports = { injectUI };
