if (window.electronAPI && !window.electron) {
  window.electron = {
    minimize: () => window.electronAPI.minimize(),
    maximize: () => window.electronAPI.maximize(),
    close: () => window.electronAPI.close(),
    // British aliases
    minimise: () => window.electronAPI.minimize(),
    maximise: () => window.electronAPI.maximize(),
    // Shorter aliases
    min: () => window.electronAPI.minimize(),
    max: () => window.electronAPI.maximize(),
    exit: () => window.electronAPI.close(),
    winMin: () => window.electronAPI.minimize(),
    winMax: () => window.electronAPI.maximize(),
    winClose: () => window.electronAPI.close(),
    send: (channel) => {
      const c = channel?.toLowerCase() || "";
      if (c === "minimize" || c === "minimise" || c === "window-min")
        window.electronAPI.minimize();
      else if (c === "maximize" || c === "maximise" || c === "window-max")
        window.electronAPI.maximize();
      else if (c === "close" || c === "window-close")
        window.electronAPI.close();
      else window.electronAPI.send(channel);
    },
  };
}

if (window.electronAPI) {
  window.electronAPI.onModalEvent((type, detail) => {
    if (window.electronAPI.log)
      window.electronAPI.log(`[Kloak] Modal Event Received: ${type}`);

    if (type === "update-status") {
      renderUpdateBanner(detail);
    } else if (type === "show-custom-permission") {
      renderPermissionModal(detail);
    } else if (type === "show-link-warning") {
      renderLinkWarningModal(detail);
    } else if (type === "show-screen-picker") {
      renderScreenPicker(detail);
    }
  });

  function renderUpdateBanner(data) {
    if (document.getElementById("kloak-update-banner")) return;
    const banner = document.createElement("div");
    banner.id = "kloak-update-banner";
    banner.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Update Available: ${data.version}`;
    banner.onclick = () => window.electronAPI.openExternalUrl(data.url);
    document.body.appendChild(banner);
  }

  function renderPermissionModal(data) {
    const overlay = document.createElement("div");
    overlay.className = "kloak-modal-overlay";
    overlay.innerHTML = `
            <div class="kloak-modal-container">
                <h3 style="margin-top:0;">Permission Request</h3>
                <p>The app is requesting access to <strong>${data.permission}</strong>.</p>
                <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
                    <button id="perm-deny" class="kloak-btn-secondary">Deny</button>
                    <button id="perm-allow" class="kloak-btn-primary">Allow</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);
    overlay.querySelector("#perm-allow").onclick = () => {
      window.electronAPI.permissionResponse(data.id, true);
      overlay.remove();
    };
    overlay.querySelector("#perm-deny").onclick = () => {
      window.electronAPI.permissionResponse(data.id, false);
      overlay.remove();
    };
  }

  function renderLinkWarningModal(data) {
    const overlay = document.createElement("div");
    overlay.className = "kloak-modal-overlay";
    overlay.innerHTML = `
            <div class="kloak-modal-container" style="width:450px;">
                <h3 style="margin-top:0;">External Link Warning</h3>
                <p>You are about to open an external link. Proceed with caution.</p>
                <div class="kloak-link-preview">${data.url}</div>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:20px; font-size:13px; cursor:pointer;">
                    <input type="checkbox" id="link-remember"> Don't show again for this session
                </label>
                <div style="display:flex; justify-content:flex-end; gap:12px;">
                    <button id="link-cancel" class="kloak-btn-secondary">Cancel</button>
                    <button id="link-open" class="kloak-btn-primary">Open Link</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);
    overlay.querySelector("#link-open").onclick = () => {
      const remember = document.getElementById("link-remember").checked;
      window.electronAPI.linkWarningResponse(data.url, true, remember);
      overlay.remove();
    };
    overlay.querySelector("#link-cancel").onclick = () => {
      overlay.remove();
    };
  }

  function renderScreenPicker(sources) {
    const overlay = document.createElement("div");
    overlay.className = "kloak-modal-overlay";
    overlay.innerHTML = `
            <div class="kloak-modal-container" style="width:600px; max-height:80vh; display:flex; flex-direction:column;">
                <h3 style="margin-top:0;">Select Screen or Window</h3>
                <div id="sources-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; overflow-y:auto; padding-right:4px;"></div>
                <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                    <button id="picker-cancel" class="kloak-btn-secondary">Cancel</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);
    const grid = overlay.querySelector("#sources-grid");
    sources.forEach((src) => {
      const card = document.createElement("div");
      card.className = "screen-source-card";
      card.innerHTML = `<img src="${src.thumbnail}"> <p>${src.name}</p>`;
      card.onclick = () => {
        window.electronAPI.screenShareSelected(src.id);
        overlay.remove();
      };
      grid.appendChild(card);
    });
    overlay.querySelector("#picker-cancel").onclick = () => {
      window.electronAPI.screenShareSelected(null);
      overlay.remove();
    };
  }

  function setupTopBarButtons() {
    const elements = Array.from(document.querySelectorAll("[aria-label]"));

    // Diagnostic logging to see what we are finding
    if (window.electronAPI.log && elements.length > 0) {
      elements.forEach((el) => {
        if (!el.dataset.kloakLogged) {
          const label = el.getAttribute("aria-label");
          if (/min|max|close/i.test(label || "")) {
            window.electronAPI.log(
              `Kloak Debug: Found element [${label}] as <${el.tagName.toLowerCase()}>`,
            );
            el.dataset.kloakLogged = "true";
          }
        }
      });
    }

    const minBtn = elements.find((b) =>
      /minim/i.test(b.getAttribute("aria-label") || ""),
    );
    const maxBtn = elements.find((b) =>
      /maxim/i.test(b.getAttribute("aria-label") || ""),
    );
    const closeBtn = elements.find((b) =>
      /close/i.test(b.getAttribute("aria-label") || ""),
    );

    if (minBtn && !minBtn.dataset.kloakBound) {
      minBtn.dataset.kloakBound = "true";
      minBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.electronAPI.log)
          window.electronAPI.log("Kloak: Minimise triggered by click.");
        window.electronAPI.minimize();
      });
      if (window.electronAPI.log)
        window.electronAPI.log("Kloak: Minimise element found and bound.");
    }

    if (maxBtn && !maxBtn.dataset.kloakBound) {
      maxBtn.dataset.kloakBound = "true";
      maxBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.electronAPI.log)
          window.electronAPI.log("Kloak: Maximise triggered by click.");
        window.electronAPI.maximize();
      });
      if (window.electronAPI.log)
        window.electronAPI.log("Kloak: Maximise element found and bound.");
    }

    if (closeBtn && !closeBtn.dataset.kloakBound) {
      closeBtn.dataset.kloakBound = "true";
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.electronAPI.log)
          window.electronAPI.log("Kloak: Close triggered by click.");
        window.electronAPI.close();
      });
      if (window.electronAPI.log)
        window.electronAPI.log("Kloak: Close element found and bound.");
    }
  }

  // Periodic check to bind buttons (handles SPA re-renders)
  setInterval(setupTopBarButtons, 1000);
  setupTopBarButtons();
}
