if (window.electronAPI && !window.electron) {
  window.electron = {
    minimize: () => window.electronAPI.minimize(),
    maximize: () => window.electronAPI.maximize(),
    close: () => window.electronAPI.close(),
    send: (channel) => {
      const c = channel?.toLowerCase() || "";
      if (c === "minimize") window.electronAPI.minimize();
      else if (c === "maximize") window.electronAPI.maximize();
      else if (c === "close") window.electronAPI.close();
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

  // Destructive Action Hijacker

  const handleDestructiveIntercept = (e) => {
    // Find the Leave Server button
    let target = e.target.closest(".text-destructive");
    if (!target) {
      const potential = e.target.closest('div[role="menuitem"]');
      if (potential && /Leave|Quit|Exit/i.test(potential.textContent || ""))
        target = potential;
    }

    // If it's not the button, or currently not doing a synthetic click playback, let it pass
    if (!target || target.dataset.kloakBypass) return;

    // Stop the event instantly so the menu stays open
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Only trigger the modal on the initial 'pointerdown' (ignore the trailing mousedown/click)
    if (e.type === "pointerdown") {
      if (document.querySelector(".kloak-modal-overlay")) return;

      renderDestructiveModal(
        "Leave Server",
        "Are you sure you want to leave this server? This action cannot be undone.",
        "Leave Server",
        (confirmed) => {
          if (confirmed) {
            // Allow our synthetic events to bypass this interceptor
            target.dataset.kloakBypass = "true";

            // Temporarily override the app's native confirm to auto-approve instantly
            const origConfirm = window.confirm;
            window.confirm = () => true;

            // Left-click sequence that Radix will accept
            const optsDown = {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons: 1,
            };
            const optsUp = {
              bubbles: true,
              cancelable: true,
              view: window,
              button: 0,
              buttons: 0,
            };

            target.dispatchEvent(new PointerEvent("pointerdown", optsDown));
            target.dispatchEvent(new MouseEvent("mousedown", optsDown));
            target.dispatchEvent(new PointerEvent("pointerup", optsUp));
            target.dispatchEvent(new MouseEvent("mouseup", optsUp));
            target.dispatchEvent(new MouseEvent("click", optsUp));

            // Clean up the bypass and restore native confirm after the API fires
            setTimeout(() => {
              window.confirm = origConfirm;
              if (target) delete target.dataset.kloakBypass;
            }, 500);
          } else {
            // If they cancel, cleanly close the background menu for them
            document.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
          }
        },
      );
    }
  };

  // Intercept all phases of the click to completely paralyze Radix
  document.addEventListener("pointerdown", handleDestructiveIntercept, true);
  document.addEventListener("mousedown", handleDestructiveIntercept, true);
  document.addEventListener("pointerup", handleDestructiveIntercept, true);
  document.addEventListener("mouseup", handleDestructiveIntercept, true);
  document.addEventListener("click", handleDestructiveIntercept, true);
  // End of Destructive Action Hijacker

  // Modal Renderers

  function renderUpdateBanner(data) {
    if (document.getElementById("kloak-update-banner")) return;
    if (data.available === false) return;

    const banner = document.createElement("div");
    banner.id = "kloak-update-banner";
    banner.innerHTML = `
      <div class="update-content">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        <span>Update Available: ${data.version}</span>
      </div>
      <div class="update-close" title="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </div>
    `;

    banner.querySelector(".update-content").onclick = () =>
      window.electronAPI.openExternalUrl(data.url);
    banner.querySelector(".update-close").onclick = (e) => {
      e.stopPropagation();
      banner.style.opacity = "0";
      banner.style.transform = "translateX(20px)";
      setTimeout(() => banner.remove(), 300);
    };

    document.body.appendChild(banner);
  }

  function renderPermissionModal(data) {
    const isMedia = data.permission === "media";
    const iconPath = isMedia
      ? '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>'
      : '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';

    const overlay = document.createElement("div");
    overlay.className = "kloak-modal-overlay";
    overlay.innerHTML = `
            <div class="kloak-modal-container modal-warning kloak-shake">
                <div class="kloak-modal-header">
                    <div class="kloak-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
                    </div>
                    <div class="kloak-modal-title-group">
                        <h3 class="kloak-modal-title">Permission Request</h3>
                        <p class="kloak-modal-subtitle">Kloak wants to access your ${data.permission}</p>
                    </div>
                </div>
                <div class="kloak-modal-body">
                    If you allow this, the app will be able to access your device's hardware or data. You can revoke this later in settings.
                </div>
                <div class="kloak-modal-footer">
                    <button id="perm-deny" class="kloak-btn-secondary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> Deny</button>
                    <button id="perm-allow" class="kloak-btn-primary" style="color: #D49524;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Allow</button>
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
            <div class="kloak-modal-container modal-warning kloak-shake">
                <div class="kloak-modal-header">
                    <div class="kloak-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <div class="kloak-modal-title-group">
                        <h3 class="kloak-modal-title">External Link Warning</h3>
                        <p class="kloak-modal-subtitle">You are about to open an external link</p>
                    </div>
                </div>
                <div class="kloak-modal-body">
                    Proceed with caution. External links may contain malicious content or tracking scripts.
                    <div class="kloak-link-preview">${data.url}</div>
                    <label style="display:flex; align-items:center; gap:8px; margin-top:16px; font-size:13px; cursor:pointer; color: #71717a;">
                        <input type="checkbox" id="link-remember" style="accent-color: #D49524;"> Don't show again for this session
                    </label>
                </div>
                <div class="kloak-modal-footer">
                    <button id="link-cancel" class="kloak-btn-secondary">Cancel</button>
                    <button id="link-open" class="kloak-btn-primary" style="color: #D49524;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg> Open Link</button>
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
            <div class="kloak-modal-container modal-neutral" style="width:640px; max-height:85vh; display:flex; flex-direction:column;">
                <div class="kloak-modal-header">
                    <div class="kloak-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    </div>
                    <div class="kloak-modal-title-group">
                        <h3 class="kloak-modal-title">Select Screen or Window</h3>
                        <p class="kloak-modal-subtitle">Choose a source to start capture</p>
                    </div>
                </div>
                <div id="sources-grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; overflow-y:auto; padding: 12px; border: 1px solid #2a2a2a; border-radius: 10px; background: #0c0c0c;"></div>
                <div class="kloak-modal-footer" style="margin-top: 24px;">
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

  function renderDestructiveModal(title, message, confirmText, callback) {
    const overlay = document.createElement("div");
    overlay.className = "kloak-modal-overlay";

    // Override pointer events to bypass background traps
    overlay.style.cssText = "pointer-events: auto !important;";
    overlay.tabIndex = -1;

    overlay.innerHTML = `
            <div class="kloak-modal-container modal-destructive kloak-shake" tabIndex="0">
                <div class="kloak-modal-header">
                    <div class="kloak-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                    </div>
                    <div class="kloak-modal-title-group">
                        <h3 class="kloak-modal-title">${title}</h3>
                        <p class="kloak-modal-subtitle">Destructive Action</p>
                    </div>
                </div>
                <div class="kloak-modal-body">${message}</div>
                <div class="kloak-modal-footer">
                    <button id="dest-cancel" class="kloak-btn-secondary">Cancel</button>
                    <button id="dest-confirm" class="kloak-btn-primary" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> ${confirmText}</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);

    // Focus management with animation delay
    setTimeout(() => {
      const cancelBtn = overlay.querySelector("#dest-cancel");
      if (cancelBtn) {
        cancelBtn.focus({ preventScroll: true });

        // Force focus event
        cancelBtn.dispatchEvent(new FocusEvent("focus"));
      }
    }, 150);

    // Fallback focus check
    setTimeout(() => {
      const cancelBtn = overlay.querySelector("#dest-cancel");
      if (cancelBtn && document.activeElement !== cancelBtn) {
        cancelBtn.focus({ preventScroll: true });
      }
    }, 500);

    overlay.querySelector("#dest-confirm").onclick = () => {
      callback(true);
      overlay.remove();
    };
    overlay.querySelector("#dest-cancel").onclick = () => {
      callback(false);
      overlay.remove();
    };
  }
  // End of Modal Renderers

  // Top Bar Window Controls

  function setupTopBarButtons() {
    const elements = Array.from(document.querySelectorAll("[aria-label]"));

    // Diagnostic logging
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

  // Handle SPA re-renders
  setInterval(() => {
    setupTopBarButtons();
  }, 1000);
  setupTopBarButtons();

  // End of Top Bar Window Controls
}
