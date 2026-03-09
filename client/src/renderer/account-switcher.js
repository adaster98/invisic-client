(async () => {

  // ── State ────────────────────────────────────────────────────────────────
  let accountsData = { accounts: [] };
  let currentUserId = null;
  let _flyoutEl = null;
  let _switchLoadingEl = null;
  let _switchHideTimer = null;
  const SWITCH_LOADING_MIN_MS = 1400;
  const SWITCH_LOADING_FADE_IN_MS = 220;
  const SWITCH_LOADING_FADE_OUT_MS = 280;
  const SWITCH_LOGIN_WATCHDOG_MS = 100;
  const SWITCH_TRACE_KEY = "invisic-switch-trace";
  const SWITCH_TRACE_MAX = 500;

  function redact(value, head = 6, tail = 4) {
    const s = String(value || "");
    if (!s) return "";
    if (s.length <= head + tail + 3) return s;
    return `${s.slice(0, head)}...${s.slice(-tail)}`;
  }

  function readTrace() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(SWITCH_TRACE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeTrace(entries) {
    try {
      sessionStorage.setItem(
        SWITCH_TRACE_KEY,
        JSON.stringify(entries.slice(-SWITCH_TRACE_MAX)),
      );
    } catch (e) {}
  }

  function trace(type, extra = {}) {
    const entries = readTrace();
    entries.push({
      ts: new Date().toISOString(),
      path: `${window.location.pathname}${window.location.search}`,
      type,
      ...extra,
    });
    writeTrace(entries);
  }

  function installSwitchTraceTools() {
    if (window.__invisicSwitchTraceInstalled) return;
    window.__invisicSwitchTraceInstalled = true;
    window.InvisicSwitchTrace = {
      dump() {
        return readTrace();
      },
      clear() {
        writeTrace([]);
        trace("trace-cleared");
      },
      print() {
        console.log(JSON.stringify(readTrace(), null, 2));
      },
    };

    const origReplaceState = history.replaceState.bind(history);
    history.replaceState = function (...args) {
      let info = "";
      try {
        info = typeof args[2] === "string" ? args[2] : "";
      } catch (e) {}
      trace("history.replaceState", { info });
      return origReplaceState(...args);
    };

    const origPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
      let info = "";
      try {
        info = typeof args[2] === "string" ? args[2] : "";
      } catch (e) {}
      trace("history.pushState", { info });
      return origPushState(...args);
    };

    const authRaw = localStorage.getItem("kloak-auth") || "";
    const secretRaw = localStorage.getItem("kloak-secret-key") || "";
    trace("trace-installed", {
      info: `ls-auth=${redact(authRaw, 5, 5)}, ls-secret=${redact(secretRaw, 6, 4)}`,
    });
  }

  function resetSwitchWatchdogFlags() {
    sessionStorage.removeItem("invisic-login-user-request-ts");
    sessionStorage.removeItem("invisic-login-user-success-ts");
    sessionStorage.removeItem("invisic-switch-watchdog-reloaded");
  }

  function installDesktopAuthWatchdog() {
    if (window.__invisicDesktopAuthWatchdogInstalled) return;
    window.__invisicDesktopAuthWatchdogInstalled = true;

    const onDesktopAuth = window.location.pathname.startsWith("/desktop-auth");
    const mode = new URLSearchParams(window.location.search).get("mode");
    const hasPendingSwitch = !!sessionStorage.getItem("invisic-pending-key-hash");
    if (!onDesktopAuth || mode !== "login" || !hasPendingSwitch) return;

    trace("watchdog.armed", { info: `timeout=${SWITCH_LOGIN_WATCHDOG_MS}ms` });

    setTimeout(() => {
      const stillOnDesktopAuth = window.location.pathname.startsWith("/desktop-auth");
      const stillPending = !!sessionStorage.getItem("invisic-pending-key-hash");
      const loginUserRequested = Number(
        sessionStorage.getItem("invisic-login-user-request-ts") || "0",
      );
      const alreadyReloaded =
        sessionStorage.getItem("invisic-switch-watchdog-reloaded") === "1";
      if (!stillOnDesktopAuth || !stillPending || loginUserRequested > 0) return;
      if (alreadyReloaded) {
        trace("watchdog.exhausted", { info: "login_user still missing after one auto-reload" });
        return;
      }

      sessionStorage.setItem("invisic-switch-watchdog-reloaded", "1");
      trace("watchdog.reload", { info: "login_user did not fire; forcing one reload" });
      window.location.reload();
    }, SWITCH_LOGIN_WATCHDOG_MS);
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  async function loadAccounts() {
    try {
      const data = await window.electronAPI.getAccounts();
      if (data && Array.isArray(data.accounts)) return data;
    } catch (e) {
      console.error("[AccountSwitcher] Failed to load accounts:", e);
    }
    return { accounts: [] };
  }

  async function saveAccounts() {
    try {
      await window.electronAPI.saveAccounts(accountsData);
    } catch (e) {
      console.error("[AccountSwitcher] Failed to save accounts:", e);
    }
  }

  // ── Crypto ───────────────────────────────────────────────────────────────

  async function hashSecretKey(secretKey) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(secretKey),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // ── Loading Screen ─────────────────────────────────────────────────────

  function showSwitchLoading(instant = false) {
    if (_switchLoadingEl) {
      if (instant) _switchLoadingEl.style.opacity = "1";
      else requestAnimationFrame(() => (_switchLoadingEl.style.opacity = "1"));
      return;
    }
    const overlay = document.createElement("div");
    overlay.id = "invisic-switch-loading-overlay";
    overlay.className = "fixed inset-0 flex items-center justify-center bg-background";
    overlay.style.cssText = `z-index: 2147483647; opacity: 0; transition: opacity ${SWITCH_LOADING_FADE_IN_MS}ms ease;`;
    overlay.innerHTML = `
      <div class="text-center max-w-sm p-6 border border-border/50 rounded-xl bg-card/80" style="box-shadow: 0 10px 40px rgba(0,0,0,0.65);">
        <div class="mx-auto mb-4 w-12 h-12 rounded-full border-[3px] border-primary/20 border-t-primary" style="animation: ias-spin 0.9s linear infinite;"></div>
        <h2 class="text-lg font-bold text-foreground mb-2">Switching Account</h2>
        <p class="text-sm text-muted-foreground">Signing you into the selected account...</p>
      </div>
    `;
    if (!document.getElementById("invisic-switch-loading-style")) {
      const style = document.createElement("style");
      style.id = "invisic-switch-loading-style";
      style.textContent = "@keyframes ias-spin { to { transform: rotate(360deg); } }";
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
    _switchLoadingEl = overlay;
    if (instant) overlay.style.opacity = "1";
    else requestAnimationFrame(() => (overlay.style.opacity = "1"));
  }

  function hideSwitchLoading() {
    clearTimeout(_switchHideTimer);
    _switchHideTimer = null;
    if (!_switchLoadingEl) return;
    _switchLoadingEl.style.opacity = "0";
    setTimeout(() => {
      if (_switchLoadingEl) {
        _switchLoadingEl.remove();
        _switchLoadingEl = null;
      }
    }, SWITCH_LOADING_FADE_OUT_MS);
  }

  function beginSwitchLoadingTransition() {
    sessionStorage.setItem("invisic-switch-ui-start", String(Date.now()));
    showSwitchLoading(false);
  }

  function endSwitchLoadingTransition() {
    const startRaw = sessionStorage.getItem("invisic-switch-ui-start");
    const startedAt = startRaw ? Number(startRaw) : 0;
    const elapsed = startedAt > 0 ? Date.now() - startedAt : SWITCH_LOADING_MIN_MS;
    const remaining = Math.max(0, SWITCH_LOADING_MIN_MS - elapsed);
    clearTimeout(_switchHideTimer);
    _switchHideTimer = setTimeout(() => {
      hideSwitchLoading();
      sessionStorage.removeItem("invisic-switch-ui-start");
    }, remaining);
  }

  function installSwitchLoadingScreen() {
    if (!window.__invisicSwitchLoadingInstalled) {
      window.__invisicSwitchLoadingInstalled = true;
      const sync = () => {
        const isPending = !!sessionStorage.getItem("invisic-pending-key-hash");
        if (isPending) {
          showSwitchLoading(true);
        } else {
          endSwitchLoadingTransition();
        }
      };
      sync();
      setInterval(sync, 250);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function focusModal(container, selector) {
    const focusTarget =
      container.querySelector(selector) ||
      container.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ||
      container;
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus({ preventScroll: true });
    }
  }

  function getCurrentSecretKey() {
    try {
      const auth = JSON.parse(localStorage.getItem("kloak-auth") || "{}");
      if (auth && typeof auth.secretKey === "string" && auth.secretKey.trim()) {
        return auth.secretKey.trim();
      }
      if (
        auth &&
        auth.state &&
        typeof auth.state.secretKey === "string" &&
        auth.state.secretKey.trim()
      ) {
        return auth.state.secretKey.trim();
      }
    } catch (e) {}
    const fallback = localStorage.getItem("kloak-secret-key");
    return typeof fallback === "string" ? fallback.trim() : "";
  }

  function parseKloakAuth() {
    try {
      const parsed = JSON.parse(localStorage.getItem("kloak-auth") || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function buildAuthPayload(existingAuth, secretKey, keyHash) {
    const safeExisting =
      existingAuth && typeof existingAuth === "object" ? existingAuth : {};
    const existingState =
      safeExisting.state && typeof safeExisting.state === "object"
        ? safeExisting.state
        : {};

    return {
      ...safeExisting,
      secretKey,
      keyHash,
      manualStatus:
        typeof safeExisting.manualStatus !== "undefined"
          ? safeExisting.manualStatus
          : null,
      state: {
        ...existingState,
        secretKey,
        keyHash,
        isAuthenticated: !!secretKey,
        isLoading: false,
        error: null,
      },
    };
  }

  function applyPendingAuthState() {
    const pendingSecret = sessionStorage.getItem("invisic-pending-secret-key");
    const pendingHash = sessionStorage.getItem("invisic-pending-key-hash");
    if (!pendingSecret || !pendingHash) return;

    const existingAuth = parseKloakAuth();
    const nextAuth = buildAuthPayload(existingAuth, pendingSecret, pendingHash);
    localStorage.setItem("kloak-auth", JSON.stringify(nextAuth));
    localStorage.setItem("kloak-secret-key", pendingSecret);
    trace("pending-auth-applied", {
      info: `secret=${redact(pendingSecret, 6, 4)} hash=${redact(pendingHash, 6, 4)}`,
    });
    if (window.InvisicAddonAPI && typeof window.InvisicAddonAPI === "object") {
      window.InvisicAddonAPI.xHash = pendingHash;
    }
  }

  function installSessionKeyHashBridge() {
    if (window.__invisicSessionKeyHashBridgeInstalled) return;
    window.__invisicSessionKeyHashBridgeInstalled = true;

    const origFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      try {
        const url =
          typeof input === "string"
            ? input
            : input && typeof input.url === "string"
              ? input.url
              : "";
        const isSupabase = url.includes("foquucurnwpqcvgqukpz.supabase.co");
        if (isSupabase) {
          const options = { ...init };
          const headers = new Headers(options.headers || {});
          const apikey = headers.get("apikey");
          const auth = headers.get("Authorization") || headers.get("authorization");
          if (apikey) sessionStorage.setItem("invisic-last-apikey", apikey);
          if (auth) sessionStorage.setItem("invisic-last-auth", auth);
          const pendingKeyHash = sessionStorage.getItem("invisic-pending-key-hash");
          const isLoginUser = url.includes("/rpc/login_user");
          if (isLoginUser) {
            sessionStorage.setItem("invisic-login-user-request-ts", String(Date.now()));
          }
          const burstUntil = Number(
            sessionStorage.getItem("invisic-switch-trace-burst-until") || "0",
          );
          const shouldTraceFetch =
            isLoginUser || !!pendingKeyHash || Date.now() < burstUntil;
          if (shouldTraceFetch) {
            trace("fetch.supabase.request", {
              url,
              info: `pending=${pendingKeyHash ? "yes" : "no"} login_user=${isLoginUser ? "yes" : "no"}`,
            });
          }

          if (pendingKeyHash) {
            headers.set("X-Key-Hash", pendingKeyHash);
            headers.set("x-key-hash", pendingKeyHash);
          }

          if (pendingKeyHash && isLoginUser) {
            try {
              let payload = {};
              if (typeof options.body === "string" && options.body.trim()) {
                payload = JSON.parse(options.body);
              }
              payload._key_hash = pendingKeyHash;
              options.body = JSON.stringify(payload);
            } catch (e) {}
          }
          options.headers = headers;
          const resp = await origFetch(input, options);
          if (shouldTraceFetch) {
            trace("fetch.supabase.response", {
              url,
              status: resp.status,
              info: `ok=${resp.ok}`,
            });
          }
          try {
            const bodyText = isLoginUser ? await resp.clone().text() : "";
            const parsed = isLoginUser ? JSON.parse(bodyText || "null") : null;
            if (isLoginUser && resp.ok && parsed?.id) {
              sessionStorage.setItem("invisic-login-user-success-ts", String(Date.now()));
              sessionStorage.setItem(
                "invisic-switch-trace-burst-until",
                String(Date.now() + 5000),
              );
              trace("login_user.success", {
                info: `id=${parsed.id} hash=${redact(pendingKeyHash || "", 6, 4)}`,
              });
              applyPendingAuthState();
            }
          } catch (e) {}
          return resp;
        }
      } catch (e) {}
      return origFetch(input, init);
    };
  }

  function installAuthPersistenceLock() {
    if (window.__invisicAuthPersistenceLockInstalled) return;
    window.__invisicAuthPersistenceLockInstalled = true;

    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      const pendingSecret = sessionStorage.getItem("invisic-pending-secret-key");
      const pendingHash = sessionStorage.getItem("invisic-pending-key-hash");

      if (key === "kloak-auth") {
        try {
          if (pendingSecret && pendingHash) {
            const parsed = JSON.parse(value || "{}");
            const sk = parsed?.secretKey || parsed?.state?.secretKey || null;
            const kh = parsed?.keyHash || parsed?.state?.keyHash || null;
            trace("localStorage.setItem", {
              info: `kloak-auth secret=${redact(sk, 6, 4)} hash=${redact(kh, 6, 4)}`,
            });
            if (sk !== pendingSecret || kh !== pendingHash) {
              const coerced = buildAuthPayload(parsed, pendingSecret, pendingHash);
              trace("kloak-auth.coerced", {
                info: `to secret=${redact(pendingSecret, 6, 4)} hash=${redact(pendingHash, 6, 4)}`,
              });
              origSetItem(key, JSON.stringify(coerced));
              return;
            }
          }
        } catch (e) {}
      } else if (key === "kloak-secret-key") {
        trace("localStorage.setItem", {
          info: `kloak-secret-key value=${redact(value, 6, 4)}`,
        });
        if (pendingSecret && (value || "").trim() !== pendingSecret) {
          trace("kloak-secret-key.coerced", {
            info: `to ${redact(pendingSecret, 6, 4)}`,
          });
          origSetItem(key, pendingSecret);
          return;
        }
      }
      origSetItem(key, value);
    };
  }

  // ── Account Switching ────────────────────────────────────────────────────

  async function switchToAccount(account) {
    try {
      closeFlyout();
      writeTrace([]);
      trace("trace-cleared");
      resetSwitchWatchdogFlags();
      const secretKey = (account.secretKey || "").trim();
      if (!/^[0-9a-fA-F]{64}$/.test(secretKey)) {
        throw new Error("Selected account secret key is invalid.");
      }
      const pendingKeyHash = await hashSecretKey(secretKey);
      trace("switch.start", {
        info: `target=${account.id} secret=${redact(secretKey, 6, 4)} hash=${redact(pendingKeyHash, 6, 4)}`,
      });
      sessionStorage.setItem("invisic-pending-secret-key", secretKey);
      sessionStorage.setItem("invisic-pending-key-hash", pendingKeyHash);
      let existingAuth = {};
      try {
        existingAuth = JSON.parse(localStorage.getItem("kloak-auth") || "{}");
      } catch (e) {
        existingAuth = {};
      }
      const clearedAuth = {
        ...(existingAuth && typeof existingAuth === "object" ? existingAuth : {}),
        secretKey: null,
        keyHash: null,
        manualStatus: null,
      };
      if (existingAuth && typeof existingAuth === "object" && existingAuth.state) {
        clearedAuth.state = {
          ...existingAuth.state,
          secretKey: null,
          keyHash: null,
          manualStatus: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        };
      }
      localStorage.setItem("kloak-auth", JSON.stringify(clearedAuth));
      localStorage.removeItem("kloak-secret-key");
      beginSwitchLoadingTransition();

      const target = new URL("/desktop-auth", window.location.origin);
      target.searchParams.set("mode", "login");
      target.searchParams.set("invisicSwitch", String(Date.now()));
      trace("switch.navigate", { info: target.pathname + target.search });
      await new Promise((resolve) => setTimeout(resolve, SWITCH_LOADING_FADE_IN_MS));
      window.location.replace(target.toString());
    } catch (e) {
      console.error("[AccountSwitcher] Switch failed:", e);
      trace("switch.error", { info: e?.message || String(e) });
    }
  }

  // ── Ready Handler ────────────────────────────────────────────────────────

  function initReadyHandler() {
    const tryRegister = () => {
      if (!window.InvisicAddonAPI) {
        setTimeout(tryRegister, 500);
        return;
      }
      window.InvisicAddonAPI.onReady(async (api) => {
        trace("onReady", {
          info: `id=${api?.userID || ""} xHash=${redact((api?.xHash || "").toLowerCase(), 6, 4)}`,
        });
        currentUserId = api.userID;
        const profile = api.userProfile;
        const avatarUrl =
          profile?.avatar_url || profile?.avatarUrl || null;
        const currentSecretKey = getCurrentSecretKey();
        const runtimeXHash = (api?.xHash || "").toLowerCase();
        const pendingKeyHash = (sessionStorage.getItem("invisic-pending-key-hash") || "").toLowerCase();

        if (pendingKeyHash && runtimeXHash === pendingKeyHash) {
          trace("switch.finalized", { info: "runtime hash matched pending hash" });
          applyPendingAuthState();
          sessionStorage.removeItem("invisic-pending-secret-key");
          sessionStorage.removeItem("invisic-pending-key-hash");
          resetSwitchWatchdogFlags();
          endSwitchLoadingTransition();
        }

        if (/^[0-9a-f]{64}$/i.test(currentSecretKey || "") && runtimeXHash) {
          const expectedXHash = await hashSecretKey(currentSecretKey);
          if (expectedXHash !== runtimeXHash) {
            trace("switch.mismatch", {
              info: `expected=${redact(expectedXHash, 6, 4)} runtime=${redact(runtimeXHash, 6, 4)}`,
            });
            console.warn(
              "[AccountSwitcher] Detected auth hash mismatch after switch; skipping account metadata sync.",
              { expectedXHash, runtimeXHash },
            );
            return;
          }
          trace("switch.finalized", { info: "expected hash matched runtime hash" });
          sessionStorage.removeItem("invisic-pending-secret-key");
          sessionStorage.removeItem("invisic-pending-key-hash");
          resetSwitchWatchdogFlags();
          endSwitchLoadingTransition();
        }

        // Resolve pending IDs
        const pendingIdx = accountsData.accounts.findIndex(
          (a) =>
            a.id.startsWith("pending-") && a.secretKey === currentSecretKey,
        );
        if (pendingIdx !== -1) {
          accountsData.accounts[pendingIdx].id = currentUserId;
          if (profile?.username)
            accountsData.accounts[pendingIdx].username = profile.username;
          if (avatarUrl)
            accountsData.accounts[pendingIdx].avatarUrl = avatarUrl;
          saveAccounts();
          return;
        }

        // Update known account metadata
        const knownIdx = accountsData.accounts.findIndex(
          (a) => a.id === currentUserId,
        );
        if (knownIdx !== -1) {
          let changed = false;
          if (profile?.username && accountsData.accounts[knownIdx].username !== profile.username) {
            accountsData.accounts[knownIdx].username = profile.username;
            changed = true;
          }
          if (avatarUrl && accountsData.accounts[knownIdx].avatarUrl !== avatarUrl) {
            accountsData.accounts[knownIdx].avatarUrl = avatarUrl;
            changed = true;
          }
          if (changed) saveAccounts();
          return;
        }

        // Current user not in list — offer to save
        offerToSaveCurrentAccount(api, avatarUrl, currentSecretKey);
      });
    };
    tryRegister();
  }

  // ── Save-account toast ───────────────────────────────────────────────────

  function offerToSaveCurrentAccount(api, avatarUrl, secretKey) {
    if (document.getElementById("invisic-save-account-toast")) return;
    if (!secretKey) return;

    const username = api.userProfile?.username || "this account";
    const toast = document.createElement("div");
    toast.id = "invisic-save-account-toast";
    toast.className = "invisic-account-save-toast";
    toast.innerHTML = `
      <div class="ias-toast-text">Save <strong>${username}</strong> for quick switching?</div>
      <div class="ias-toast-actions">
        <button class="ias-toast-save invisic-btn-primary">Save</button>
        <button class="ias-toast-dismiss invisic-btn-secondary">Dismiss</button>
      </div>
    `;

    toast.querySelector(".ias-toast-save").addEventListener("click", async () => {
      accountsData.accounts.push({
        id: currentUserId,
        username: api.userProfile?.username || "Unknown",
        secretKey,
        avatarUrl: avatarUrl || "",
      });
      await saveAccounts();
      toast.remove();
    });
    toast.querySelector(".ias-toast-dismiss").addEventListener("click", () => toast.remove());

    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 12000);
  }

  async function saveCurrentAccountFromRuntime() {
    if (!window.InvisicAddonAPI) return false;
    const api = window.InvisicAddonAPI;
    const secretKey = (localStorage.getItem("kloak-secret-key") || "").trim();
    if (!/^[0-9a-f]{64}$/i.test(secretKey)) return false;

    const profile = api.userProfile || {};
    const runtimeUserId = api.userID || profile.id || null;
    if (!runtimeUserId) return false;
    currentUserId = runtimeUserId;
    const avatarUrl = profile.avatar_url || profile.avatarUrl || "";
    const username = profile.username || "Unknown";

    const normalizedSecret = secretKey.toLowerCase();
    let existingIdx = accountsData.accounts.findIndex(
      (a) => (a.secretKey || "").toLowerCase() === normalizedSecret,
    );
    if (existingIdx === -1) {
      existingIdx = accountsData.accounts.findIndex(
        (a) => a.id === runtimeUserId,
      );
    }

    if (existingIdx !== -1) {
      accountsData.accounts[existingIdx] = {
        ...accountsData.accounts[existingIdx],
        id: runtimeUserId,
        username,
        secretKey: normalizedSecret,
        avatarUrl,
      };
    } else {
      accountsData.accounts.push({
        id: runtimeUserId,
        username,
        secretKey: normalizedSecret,
        avatarUrl,
      });
    }

    await saveAccounts();
    return true;
  }

  // ── Sidebar Button ────────────────────────────────────────────────────────

  function setupSidebarButton() {
    // The sidebar footer has: avatar | name+status | [buttons container]
    // We look for the container with the settings gear and inject our button before it.
    const findAndInject = () => {
      if (document.getElementById("invisic-switch-btn")) return;

      // Find the sidebar footer bar — it's h-14 with bg-layout-sidebar and a border-t
      const footers = document.querySelectorAll(".h-14.bg-layout-sidebar");
      let footer = null;
      for (const el of footers) {
        // The correct footer has the settings gear button inside it
        if (el.querySelector('svg.lucide-settings')) {
          footer = el;
          break;
        }
      }
      if (!footer) return false;

      // Find the button container (the div with flex items-center gap-0.5)
      const btnContainer = footer.querySelector(".flex.items-center");
      if (!btnContainer) return false;

      // Get the settings button to clone its classes for visual consistency
      const settingsBtn = btnContainer.querySelector("button");
      if (!settingsBtn) return false;

      const btn = document.createElement("button");
      btn.id = "invisic-switch-btn";
      btn.className = settingsBtn.className;
      btn.title = "Switch Account";
      // Lucide "arrow-left-right" icon (represents switching)
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"
             class="lucide lucide-arrow-left-right w-4 h-4">
          <path d="M8 3 4 7l4 4"/>
          <path d="M4 7h16"/>
          <path d="m16 21 4-4-4-4"/>
          <path d="M20 17H4"/>
        </svg>
      `;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFlyout(btn);
      });

      // Insert before the settings button
      btnContainer.insertBefore(btn, settingsBtn);
      return true;
    };

    // Poll until the sidebar footer appears (SPA loads incrementally)
    const waitInterval = setInterval(() => {
      if (findAndInject()) {
        clearInterval(waitInterval);
        // Watch for our button being removed (React re-renders wipe it after
        // account switches) and re-inject whenever that happens
        const observer = new MutationObserver(() => {
          if (!document.getElementById("invisic-switch-btn")) {
            closeFlyout();
            findAndInject();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }, 500);
    // Stop waiting after 30 seconds if sidebar never appears
    setTimeout(() => clearInterval(waitInterval), 30000);
  }

  // ── Flyout ───────────────────────────────────────────────────────────────

  function toggleFlyout(anchorBtn) {
    if (_flyoutEl) {
      closeFlyout();
      return;
    }
    buildFlyout(anchorBtn);
  }

  function buildFlyout(anchorBtn) {
    closeFlyout();

    const btnRect = anchorBtn.getBoundingClientRect();

    const flyout = document.createElement("div");
    flyout.id = "invisic-account-flyout";
    flyout.tabIndex = -1;
    // Use native Kloak classes for visual consistency with any theme
    flyout.className = "fixed flex flex-col rounded-xl border border-border/50 bg-card";
    flyout.style.cssText = `
      bottom: ${window.innerHeight - btnRect.top + 6}px;
      left: ${btnRect.left}px;
      min-width: 240px;
      max-width: 300px;
      z-index: 99999999;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      animation: ias-flyout-in 0.12s ease;
    `;

    // Header
    const header = document.createElement("div");
    header.className = "px-3 py-2 border-b border-border/50";
    header.innerHTML = `<p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Switch Account</p>`;
    flyout.appendChild(header);

    // Account list
    const list = document.createElement("div");
    list.className = "flex flex-col gap-0.5 p-1.5 max-h-60 overflow-y-auto";

    if (accountsData.accounts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "text-center text-sm text-muted-foreground py-4 px-2";
      empty.textContent = "No saved accounts";
      list.appendChild(empty);
    } else {
      accountsData.accounts.forEach((account) => {
        list.appendChild(buildAccountRow(account));
      });
    }
    flyout.appendChild(list);

    // Footer
    const footer = document.createElement("button");
    footer.className = "w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border/50 transition-colors text-center";
    footer.textContent = "Manage Accounts";
    footer.addEventListener("click", (e) => {
      e.stopPropagation();
      closeFlyout();
      openManageAccountsModal();
    });
    flyout.appendChild(footer);

    document.body.appendChild(flyout);
    _flyoutEl = flyout;

    // Edge-clip: if flyout overflows right, shift left
    requestAnimationFrame(() => {
      if (!_flyoutEl) return;
      const flyRect = _flyoutEl.getBoundingClientRect();
      if (flyRect.right > window.innerWidth - 8) {
        _flyoutEl.style.left = `${window.innerWidth - flyRect.width - 8}px`;
      }
    });

    // Close on click outside
    const onClickOutside = (e) => {
      if (_flyoutEl && !_flyoutEl.contains(e.target) && e.target !== anchorBtn && !anchorBtn.contains(e.target)) {
        closeFlyout();
      }
    };
    // Close on Escape
    const onEscape = (e) => {
      if (e.key === "Escape" && _flyoutEl) {
        closeFlyout();
        anchorBtn.focus();
      }
    };
    document.addEventListener("pointerdown", onClickOutside, true);
    document.addEventListener("keydown", onEscape, true);

    // Store cleanup refs on the flyout element
    flyout._cleanup = () => {
      document.removeEventListener("pointerdown", onClickOutside, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  }

  function closeFlyout() {
    if (_flyoutEl) {
      if (_flyoutEl._cleanup) _flyoutEl._cleanup();
      _flyoutEl.remove();
      _flyoutEl = null;
    }
  }

  // ── Account Row ──────────────────────────────────────────────────────────

  function buildAccountRow(account) {
    const isActive = account.id === currentUserId;
    const row = document.createElement("div");
    row.className = `flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${isActive ? "bg-primary/10" : "hover:bg-secondary/50 cursor-pointer"}`;

    // Avatar
    const avatar = document.createElement("div");
    avatar.className = "relative w-8 h-8 rounded-full bg-secondary flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-muted-foreground";
    if (account.avatarUrl) {
      const img = document.createElement("img");
      img.src = account.avatarUrl;
      img.alt = account.username;
      img.className = "w-full h-full object-cover rounded-full";
      img.addEventListener("error", () => {
        img.remove();
        avatar.textContent = (account.username[0] || "?").toUpperCase();
      });
      avatar.appendChild(img);
    } else {
      avatar.textContent = (account.username[0] || "?").toUpperCase();
    }

    // Info
    const info = document.createElement("div");
    info.className = "flex-1 min-w-0 flex flex-col";
    const nameEl = document.createElement("span");
    nameEl.className = "text-sm font-semibold text-foreground truncate";
    nameEl.textContent = account.username;
    info.appendChild(nameEl);

    if (isActive) {
      const badge = document.createElement("span");
      badge.className = "text-[10px] font-bold text-primary uppercase tracking-wide";
      badge.textContent = "Active";
      info.appendChild(badge);
    }

    row.appendChild(avatar);
    row.appendChild(info);

    if (!isActive) {
      row.addEventListener("click", () => switchToAccount(account));
    }

    return row;
  }

  // ── Manage Accounts Modal ────────────────────────────────────────────────

  function buildModalAccountRow(account) {
    const isActive = account.id === currentUserId;
    const row = document.createElement("div");
    row.className = `flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${isActive ? "bg-primary/10" : "hover:bg-secondary/50 cursor-pointer"}`;

    const avatar = document.createElement("div");
    avatar.className = "relative w-8 h-8 rounded-full bg-secondary flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-muted-foreground";
    if (account.avatarUrl) {
      const img = document.createElement("img");
      img.src = account.avatarUrl;
      img.alt = account.username;
      img.className = "w-full h-full object-cover rounded-full";
      img.addEventListener("error", () => {
        img.remove();
        avatar.textContent = (account.username[0] || "?").toUpperCase();
      });
      avatar.appendChild(img);
    } else {
      avatar.textContent = (account.username[0] || "?").toUpperCase();
    }

    const info = document.createElement("div");
    info.className = "flex-1 min-w-0 flex flex-col";
    const nameEl = document.createElement("span");
    nameEl.className = "text-sm font-semibold text-foreground truncate";
    nameEl.textContent = account.username;
    info.appendChild(nameEl);

    if (isActive) {
      const badge = document.createElement("span");
      badge.className = "text-[10px] font-bold text-primary uppercase tracking-wide";
      badge.textContent = "Active";
      info.appendChild(badge);
    }

    row.appendChild(avatar);
    row.appendChild(info);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors";
    removeBtn.title = "Remove account";
    removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      accountsData.accounts = accountsData.accounts.filter(
        (a) => a.id !== account.id,
      );
      await saveAccounts();
      openManageAccountsModal();
    });
    row.appendChild(removeBtn);

    if (!isActive) {
      row.addEventListener("click", () => switchToAccount(account));
    }

    return row;
  }

  function openManageAccountsModal() {
    document.getElementById("invisic-manage-accounts-modal")?.remove();

    const overlay = document.createElement("div");
    overlay.className = "invisic-modal-overlay";
    overlay.id = "invisic-manage-accounts-modal";
    overlay.tabIndex = -1;

    const container = document.createElement("div");
    container.className =
      "invisic-modal-container modal-neutral ias-manage-modal";
    container.innerHTML = `
      <div class="invisic-modal-header">
        <div class="invisic-modal-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div class="invisic-modal-title-group">
          <h3 class="invisic-modal-title">Manage Accounts</h3>
          <p class="invisic-modal-subtitle">Switch between or remove saved accounts</p>
        </div>
        <button class="invisic-modal-close-icon-btn" id="ias-manage-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="ias-manage-account-list" id="ias-manage-list"></div>
      <div class="invisic-modal-footer" style="flex-direction: column; gap: 8px; margin-top: 0;">
        <button class="invisic-btn-secondary ias-add-current-btn" id="ias-manage-add-current">
          Save Current Account
        </button>
        <button class="invisic-btn-primary ias-add-account-btn" id="ias-manage-add">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Add an Account
        </button>
      </div>
    `;

    overlay.appendChild(container);
    document.body.appendChild(overlay);
    focusModal(container, "#ias-manage-add-current");

    const listEl = container.querySelector("#ias-manage-list");
    if (accountsData.accounts.length === 0) {
      listEl.innerHTML =
        '<div class="ias-manage-empty">No saved accounts yet.</div>';
    } else {
      accountsData.accounts.forEach((account) => {
        listEl.appendChild(buildModalAccountRow(account));
      });
    }

    container.querySelector("#ias-manage-close").addEventListener("click", () =>
      overlay.remove(),
    );
    container
      .querySelector("#ias-manage-add-current")
      .addEventListener("click", async () => {
        await saveCurrentAccountFromRuntime();
        overlay.remove();
        openManageAccountsModal();
      });
    container.querySelector("#ias-manage-add").addEventListener("click", () => {
      overlay.remove();
      openAddAccountModal();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ── Add Account Modal ────────────────────────────────────────────────────

  function openAddAccountModal() {
    document.getElementById("invisic-add-account-modal")?.remove();

    const overlay = document.createElement("div");
    overlay.className = "invisic-modal-overlay";
    overlay.id = "invisic-add-account-modal";
    overlay.tabIndex = -1;

    const container = document.createElement("div");
    container.className = "invisic-modal-container modal-neutral";
    container.innerHTML = `
      <div class="invisic-modal-header">
        <div class="invisic-modal-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"/><path d="M12 5v14"/>
          </svg>
        </div>
        <div class="invisic-modal-title-group">
          <h3 class="invisic-modal-title">Add an Account</h3>
          <p class="invisic-modal-subtitle">Enter the account details to save it for quick switching</p>
        </div>
      </div>
      <div class="invisic-modal-body" style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label class="ias-input-label">Username</label>
          <input id="ias-add-username" class="ias-text-input" type="text" placeholder="e.g. Aster" autocomplete="off" />
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label class="ias-input-label">Secret Key</label>
          <input id="ias-add-secretkey" class="ias-text-input" type="password" placeholder="64-character hex key" autocomplete="off" />
        </div>
        <div id="ias-add-error" class="ias-add-error" style="display:none;"></div>
      </div>
      <div class="invisic-modal-footer">
        <button class="invisic-btn-secondary" id="ias-add-cancel">Cancel</button>
        <button class="invisic-btn-primary" id="ias-add-save">Save Account</button>
      </div>
    `;

    overlay.appendChild(container);
    document.body.appendChild(overlay);
    focusModal(container, "#ias-add-username");

    const errorEl = container.querySelector("#ias-add-error");

    container.querySelector("#ias-add-cancel").addEventListener("click", () => {
      overlay.remove();
      openManageAccountsModal();
    });

    container.querySelector("#ias-add-save").addEventListener("click", async () => {
      const username = container.querySelector("#ias-add-username").value.trim();
      const secretKey = container
        .querySelector("#ias-add-secretkey")
        .value.trim();

      errorEl.style.display = "none";

      if (!username) {
        errorEl.textContent = "Username is required.";
        errorEl.style.display = "block";
        return;
      }
      if (!/^[0-9a-f]{64}$/.test(secretKey)) {
        errorEl.textContent =
          "Secret key must be a 64-character lowercase hex string.";
        errorEl.style.display = "block";
        return;
      }

      if (accountsData.accounts.find((a) => a.secretKey === secretKey)) {
        errorEl.textContent = "This account is already saved.";
        errorEl.style.display = "block";
        return;
      }

      const keyHash = await hashSecretKey(secretKey);
      const tempId = "pending-" + keyHash.slice(0, 16);

      accountsData.accounts.push({
        id: tempId,
        username,
        secretKey,
        avatarUrl: "",
      });
      await saveAccounts();
      overlay.remove();
      openManageAccountsModal();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        openManageAccountsModal();
      }
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  accountsData = await loadAccounts();
  installSwitchTraceTools();
  installDesktopAuthWatchdog();
  installSwitchLoadingScreen();
  installAuthPersistenceLock();
  installSessionKeyHashBridge();
  initReadyHandler();
  setupSidebarButton();
})();
