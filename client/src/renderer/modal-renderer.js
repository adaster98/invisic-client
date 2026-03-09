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
      window.electronAPI.log(`[Invisic] Modal Event Received: ${type}`);

    if (type === "update-status") {
      renderUpdateBanner(detail);
      document.dispatchEvent(new CustomEvent("invisic-update-status", { detail }));
    } else if (type === "update-progress") {
      updateProgressModal(detail);
    } else if (type === "show-custom-permission") {
      renderPermissionModal(detail);
    } else if (type === "show-screen-picker") {
      renderScreenPicker(detail);
    }
  });

  // Destructive Action Hijacker

  const handleDestructiveIntercept = (e) => {
    let target =
      e.target.closest(".text-destructive") ||
      e.target.closest('div[role="menuitem"]');

    // Verify it's actually a "Leave", "Quit", or "Exit" action
    if (target && !/Leave|Quit|Exit/i.test(target.textContent || "")) {
      target = null;
    }

    // If it's not the button, or currently not doing a synthetic click playback, let it pass
    if (!target || target.dataset.invisicBypass) return;

    // Stop the event instantly so the menu stays open
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Only trigger the modal on the initial 'pointerdown' (ignore the trailing mousedown/click)
    if (e.type === "pointerdown") {
      if (document.querySelector(".invisic-modal-overlay")) return;

      renderDestructiveModal(
        "Leave Server",
        "Are you sure you want to leave this server? This action cannot be undone.",
        "Leave Server",
        (confirmed) => {
          if (confirmed) {
            // Allow our synthetic events to bypass this interceptor
            target.dataset.invisicBypass = "true";

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
              if (target) delete target.dataset.invisicBypass;
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

  let updateBannerDismissed = false;

  function renderUpdateBanner(data) {
    if (updateBannerDismissed) return;
    if (document.getElementById("invisic-update-banner")) return;
    if (data.available === false) return;

    const banner = document.createElement("div");
    banner.id = "invisic-update-banner";
    banner.innerHTML = `
      <div class="update-content">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        <span>Update Available: ${data.version}</span>
      </div>
      <div class="update-actions">
        <div class="update-now" title="Update Now">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M22 10 16 12 18 18z"/></svg>
        </div>
        <div class="update-close" title="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </div>
      </div>
    `;

    banner.querySelector(".update-content").onclick = () =>
      window.electronAPI.openExternalUrl(data.url);
    banner.querySelector(".update-now").onclick = (e) => {
      e.stopPropagation();
      renderUpdateProgressModal(data);
      window.electronAPI.startUpdate(data.version);
      banner.remove();
    };
    banner.querySelector(".update-close").onclick = (e) => {
      e.stopPropagation();
      updateBannerDismissed = true;
      banner.classList.add("invisic-fade-out");
      setTimeout(() => banner.remove(), 300);
    };

    document.body.appendChild(banner);
  }

  function renderUpdateProgressModal(data) {
    if (document.getElementById("update-progress-modal")) return;

    const overlay = document.createElement("div");
    overlay.className = "invisic-modal-overlay";
    overlay.id = "update-progress-modal";
    overlay.innerHTML = `
      <div class="invisic-modal-container modal-neutral">
        <div class="invisic-modal-header">
          <div class="invisic-modal-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </div>
          <div class="invisic-modal-title-group">
            <h3 class="invisic-modal-title">Updating Invisic</h3>
            <p class="invisic-modal-subtitle">Downloading version ${data.version}</p>
          </div>
        </div>
        <div class="invisic-modal-body">
          <div class="invisic-progress-container">
            <div id="update-progress-bar" class="invisic-progress-bar" style="width: 0%"></div>
          </div>
          <div id="update-status-text" class="invisic-progress-status">Initializing...</div>
        </div>
        <div class="invisic-modal-footer">
          <button id="update-cancel" class="invisic-btn-secondary">Cancel</button>
          <button id="update-restart" class="invisic-btn-primary" disabled>Restart App</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#update-cancel").onclick = () => {
      overlay.remove();
    };

    overlay.querySelector("#update-restart").onclick = () => {
      window.electronAPI.quitAndInstall();
    };
  }

  function updateProgressModal(status) {
    const overlay = document.getElementById("update-progress-modal");
    if (!overlay) return;

    if (status.error) {
      overlay.querySelector("#update-status-text").textContent =
        "Error: " + status.error;
      overlay.querySelector("#update-status-text").style.color =
        "#EB1414";
      const cancelBtn = overlay.querySelector("#update-cancel");
      cancelBtn.style.display = "";
      cancelBtn.textContent = "Dismiss";
      return;
    }

    if (status.progress !== undefined) {
      overlay.querySelector("#update-progress-bar").style.width =
        status.progress + "%";
    }

    if (status.status) {
      overlay.querySelector("#update-status-text").textContent = status.status;
    }

    if (status.progress === 100) {
      overlay.querySelector("#update-restart").disabled = false;
      overlay.querySelector("#update-cancel").style.display = "none";
    }
  }

  window.invisicDebugUpdate = () => {
    window.electronAPI.triggerDebugUpdate();
  };

  function renderPermissionModal(data) {
    const isMedia = data.permission === "media";
    const iconPath = isMedia
      ? '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>'
      : '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';

    const overlay = document.createElement("div");
    overlay.className = "invisic-modal-overlay";
    overlay.innerHTML = `
            <div class="invisic-modal-container modal-warning invisic-shake">
                <div class="invisic-modal-header">
                    <div class="invisic-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
                    </div>
                    <div class="invisic-modal-title-group">
                        <h3 class="invisic-modal-title">Permission Request</h3>
                        <p class="invisic-modal-subtitle">Kloak wants to access your ${data.permission}</p>
                    </div>
                </div>
                <div class="invisic-modal-body">
                    If you allow this, the app will be able to access your device's hardware or data. You can revoke this later in settings.
                </div>
                <div class="invisic-modal-footer">
                    <button id="perm-deny" class="invisic-btn-secondary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> Deny</button>
                    <button id="perm-allow" class="invisic-btn-primary invisic-text-warning"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Allow</button>
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

  function renderScreenPicker(sources) {
    const overlay = document.createElement("div");
    overlay.className = "invisic-modal-overlay";
    overlay.innerHTML = `
            <div class="invisic-modal-container modal-neutral store-modal-container">
                <div class="invisic-modal-header">
                    <div class="invisic-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    </div>
                    <div class="invisic-modal-title-group">
                        <h3 class="invisic-modal-title">Select Screen or Window</h3>
                        <p class="invisic-modal-subtitle">Choose a source to start capture</p>
                    </div>
                </div>
                <div id="sources-grid" class="invisic-screen-picker-grid"></div>
                <div class="invisic-modal-footer mt-24">
                    <button id="picker-cancel" class="invisic-btn-secondary">Cancel</button>
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
    overlay.className = "invisic-modal-overlay";

    // Override pointer events to bypass background traps
    overlay.classList.add("pointer-events-auto");
    overlay.tabIndex = -1;

    overlay.innerHTML = `
            <div class="invisic-modal-container modal-destructive invisic-shake" tabIndex="0">
                <div class="invisic-modal-header">
                    <div class="invisic-modal-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                    </div>
                    <div class="invisic-modal-title-group">
                        <h3 class="invisic-modal-title">${title}</h3>
                        <p class="invisic-modal-subtitle">Destructive Action</p>
                    </div>
                </div>
                <div class="invisic-modal-body">${message}</div>
                <div class="invisic-modal-footer">
                    <button id="dest-cancel" class="invisic-btn-secondary">Cancel</button>
                    <button id="dest-confirm" class="invisic-btn-primary invisic-text-destructive"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> ${confirmText}</button>
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

  // Top Bar Branding Injection

  function setupTopBarBranding() {
    const bar = document.querySelector('.h-9.w-full.border-b');
    if (!bar || document.getElementById('invisic-topbar-brand')) return;

    const label = document.createElement('div');
    label.id = 'invisic-topbar-brand';
    label.textContent = 'Invisic';
    label.setAttribute('data-tauri-drag-region', 'true');
    label.style.cssText = [
      'display: flex',
      'align-items: center',
      'padding: 0 12px',
      'font-size: 13px',
      'font-weight: 600',
      'letter-spacing: 0.02em',
      'color: var(--foreground)',
      'opacity: 0.75',
      'flex-shrink: 0',
      'pointer-events: none',
      'user-select: none',
    ].join('; ');

    bar.insertBefore(label, bar.firstChild);
  }

  // Re-apply branding on SPA navigation
  const _brandingObserver = new MutationObserver(() => {
    if (!document.getElementById('invisic-topbar-brand')) {
      setupTopBarBranding();
    }
  });

  _brandingObserver.observe(document.body, { childList: true, subtree: true });
  setupTopBarBranding();

  // End of Top Bar Branding Injection

  // Top Bar Window Controls

  function setupTopBarButtons() {
    const elements = Array.from(document.querySelectorAll("[aria-label]"));

    // Diagnostic logging
    if (window.electronAPI.log && elements.length > 0) {
      elements.forEach((el) => {
        if (!el.dataset.invisicLogged) {
          const label = el.getAttribute("aria-label");
          if (/min|max|close/i.test(label || "")) {
            window.electronAPI.log(
              `Invisic Debug: Found element [${label}] as <${el.tagName.toLowerCase()}>`,
            );
            el.dataset.invisicLogged = "true";
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

    if (minBtn && !minBtn.dataset.invisicBound) {
      minBtn.dataset.invisicBound = "true";
      minBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.electronAPI.log)
          window.electronAPI.log("Invisic: Minimise triggered by click.");
        window.electronAPI.minimize();
      });
      if (window.electronAPI.log)
        window.electronAPI.log("Invisic: Minimise element found and bound.");
    }

    if (maxBtn && !maxBtn.dataset.invisicBound) {
      maxBtn.dataset.invisicBound = "true";
      maxBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.electronAPI.log)
          window.electronAPI.log("Invisic: Maximise triggered by click.");
        window.electronAPI.maximize();
      });
      if (window.electronAPI.log)
        window.electronAPI.log("Invisic: Maximise element found and bound.");
    }

    if (closeBtn && !closeBtn.dataset.invisicBound) {
      closeBtn.dataset.invisicBound = "true";
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.electronAPI.log)
          window.electronAPI.log("Invisic: Close triggered by click.");
        window.electronAPI.close();
      });
      if (window.electronAPI.log)
        window.electronAPI.log("Invisic: Close element found and bound.");
    }
  }

  // Handle SPA re-renders
  setInterval(() => {
    setupTopBarButtons();
  }, 1000);
  setupTopBarButtons();

  // End of Top Bar Window Controls
}
