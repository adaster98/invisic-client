(() => {
  const ADDON_ID = "dm-folders";
  const STYLE_ID = "dmf-styles";
  const MENU_ID = "dmf-context-menu";

  let config = { folders: [] };
  let dmConversations = []; // Populated from intercepted RPC
  let observer = null;
  let isEnabled = false;
  let isRenaming = false;
  let isRebuilding = false;

  // Manual Drag State
  let activeManualDrag = null; // { convId, el, ghost, startY, currentFolderId }
  let lastCollisionTarget = null; // { type: 'dm'|'folder'|'ungroup', id, el }

  // ── Preset colour palette ──
  const PRESET_COLORS = [
    "#40BF80",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#84cc16",
    "#f97316",
    "#6366f1",
    "#14b8a6",
    "#e879f9",
  ];

  // ── Persistence ──
  const loadConfig = async () => {
    try {
      if (window.KloakAddonAPI && window.KloakAddonAPI.settings) {
        const saved = await window.KloakAddonAPI.settings.get(ADDON_ID);
        if (saved && saved.folders) config.folders = saved.folders;
      } else if (window.electronAPI && window.electronAPI.getAddonConfig) {
        const saved = await window.electronAPI.getAddonConfig(ADDON_ID);
        if (saved && saved.folders) config.folders = saved.folders;
      }
    } catch (e) {
      console.error(`[${ADDON_ID}] Failed to load config:`, e);
    }
  };

  const saveConfig = () => {
    try {
      if (window.KloakAddonAPI && window.KloakAddonAPI.settings) {
        window.KloakAddonAPI.settings.set(ADDON_ID, config);
      } else if (window.electronAPI && window.electronAPI.saveAddonConfig) {
        window.electronAPI.saveAddonConfig({ addonId: ADDON_ID, data: config });
      }
    } catch (e) {
      console.error(`[${ADDON_ID}] Failed to save config:`, e);
    }
  };

  const genId = () => crypto.randomUUID();

  // ── Fetch intercept: capture DM conversations ──
  const originalFetch = window.fetch;
  const patchedFetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      if (url && url.includes("get_user_dm_conversations")) {
        const clone = response.clone();
        const data = await clone.json();
        if (Array.isArray(data)) {
          dmConversations = data;
          if (isEnabled) requestAnimationFrame(() => rebuildFolders());
        }
      }
    } catch (_) {
      /* ignore parse errors */
    }
    return response;
  };

  // ── Bootstrap: Fetch DM conversations manually ──
  const fetchConversations = async () => {
    const api = window.KloakAddonAPI;
    if (!api || !api.authToken || !api.apiKey || !api.xHash) return;

    try {
      const res = await originalFetch(
        "https://foquucurnwpqcvgqukpz.supabase.co/rest/v1/rpc/get_user_dm_conversations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: api.authToken,
            apiKey: api.apiKey,
            "X-Key-Hash": api.xHash,
          },
          body: JSON.stringify({ _user_id: api.userID }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          dmConversations = data;
          if (isEnabled) rebuildFolders();
        }
      }
    } catch (e) {
      console.error(`[${ADDON_ID}] Bootstrap fetch failed:`, e);
    }
  };

  // ── DOM helpers ──
  const getDmContainer = () => {
    // The scrollable list
    const sidebar = document.querySelector(".bg-layout-sidebar-secondary");
    if (!sidebar) return null;

    // Check for "Direct Messages" header to ensure we're not in a server channel list
    const hasDmHeader = Array.from(sidebar.querySelectorAll("h3")).some(
      (h) => h.textContent.trim() === "Direct Messages",
    );
    if (!hasDmHeader) return null;

    return sidebar.querySelector(".overflow-y-auto.scrollbar-overlay");
  };

  const getDmHeader = () => {
    const sidebar = document.querySelector(".bg-layout-sidebar-secondary");
    if (!sidebar) return null;
    // "Direct Messages" header row
    const headers = sidebar.querySelectorAll("h3");
    for (const h of headers) {
      if (h.textContent.trim() === "Direct Messages")
        return h.closest(".px-4.py-2");
    }
    return null;
  };

  const fullCleanupDOM = () => {
    document.body.classList.remove("dmf-active");
    document
      .querySelectorAll(
        ".dmf-folder-header, .dmf-ungroup-zone, .dmf-ungroup-gradient, .dmf-create-btn, .dmf-divider, .dmf-drag-tray",
      )
      .forEach((el) => el.remove());
    document
      .querySelectorAll("aside.w-60 .flex-1.overflow-y-auto > .group")
      .forEach((el) => {
        el.removeAttribute("draggable");
        el.style.display = "";
        el.style.order = "";
        el.classList.remove("dmf-dm-dragging");
      });
    const container = getDmContainer();
    if (container) {
      container.classList.remove("dmf-dm-container");
      container.style.display = "";
      container.style.gridTemplateColumns = "";
      container.style.alignContent = "";
    }
  };

  const removeHeadersOnly = () => {
    document
      .querySelectorAll(
        ".dmf-folder-header, .dmf-ungroup-zone, .dmf-ungroup-gradient, .dmf-create-btn, .dmf-divider, .dmf-drag-tray",
      )
      .forEach((el) => el.remove());
  };

  // Match a DM item to a conversation by comparing the display_name shown in DOM
  // with participants from the intercepted RPC data.
  const getConversationIdForDmItem = (dmItem) => {
    const nameEl = dmItem.querySelector("span.text-sm.truncate.font-medium");
    if (!nameEl) return null;
    const displayName = nameEl.textContent.trim();

    // Also try to extract user id from avatar URL
    const avatarImg = dmItem.querySelector("img.aspect-square");
    let avatarUserId = null;
    if (avatarImg && avatarImg.src && avatarImg.src.includes("/avatars/")) {
      const match = avatarImg.src.match(/\/avatars\/([a-f0-9-]{36})\//);
      if (match) avatarUserId = match[1];
    } else if (
      avatarImg &&
      avatarImg.src &&
      avatarImg.src.includes("supabase.co")
    ) {
      // Handle cases where the ID might be differently formatted in the URL
      const parts = avatarImg.src.split("/");
      const avatarsIdx = parts.indexOf("avatars");
      if (avatarsIdx !== -1 && parts[avatarsIdx + 1]) {
        avatarUserId = parts[avatarsIdx + 1];
      }
    }

    const myUserId = window.KloakAddonAPI ? window.KloakAddonAPI.userID : null;

    for (const conv of dmConversations) {
      const otherParticipants = conv.participants.filter(
        (p) => p.user_id !== myUserId,
      );
      for (const p of otherParticipants) {
        const pName = p.user.display_name || p.user.username;
        // Match by avatar user ID (most reliable) or display name
        if (avatarUserId && p.user_id === avatarUserId)
          return conv.conversation.id;
        if (pName === displayName) return conv.conversation.id;
      }
    }
    return null;
  };

  // ── Inject styles ──
  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Folder header */
      .dmf-folder-header {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; margin: 2px 0;
        border-radius: 6px; cursor: pointer;
        transition: background 0.15s;
        user-select: none; position: relative;
        margin-left: -20px; /* Pull header back into the gutter space */
      }
      .dmf-folder-header:hover { background: var(--kloak-bg-btn); }
      .dmf-folder-header.dmf-drag-over {
        background: var(--kloak-bg-btn);
        outline: 2px dashed var(--kloak-icon-fg);
        outline-offset: -2px;
      }
      .dmf-folder-header.dmf-dragging { opacity: 0.4; }

      .dmf-color-dot {
        width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
      }
      .dmf-folder-name {
        flex: 1; font-size: 12px; font-weight: 600; color: var(--kloak-text-sub);
        text-transform: uppercase; letter-spacing: 0.04em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .dmf-folder-count {
        font-size: 11px; color: var(--kloak-icon-fg); flex-shrink: 0;
        margin-right: 4px;
      }
      .dmf-chevron {
        flex-shrink: 0; color: var(--kloak-icon-fg);
        transition: transform 0.2s;
      }
      .dmf-chevron.collapsed { transform: rotate(-90deg); }

      /* Create folder button */
      .dmf-create-btn {
        background: transparent; border: none; cursor: pointer;
        color: var(--kloak-icon-fg); padding: 0;
        display: flex; align-items: center; justify-content: center;
        width: 24px; height: 24px; border-radius: 4px;
        transition: color 0.2s, background 0.2s;
        margin-left: auto;
        margin-right: 4px;
      }
      .dmf-create-btn:hover { color: var(--kloak-text-main); background: var(--kloak-bg-btn); }

      /* Drag visuals */
      .dmf-dm-container {
        padding-left: 28px !important;
        position: relative;
      }
      .dmf-dm-container > .group {
        position: relative !important;
        user-select: none !important;
        transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s;
      }
      .dmf-dm-dragging {
        opacity: 0.2;
        transform: scale(0.95);
      }

      .dmf-item-unfoldered {
        margin-left: -20px !important;
        width: calc(100% + 20px) !important;
      }
      .dmf-item-unfoldered .dmf-drag-tray {
        display: none !important;
      }

      .dmf-drag-tray {
        position: absolute;
        left: -22px;
        top: 6px;
        bottom: 6px;
        width: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--kloak-icon-fg);
        opacity: 0.2;
        cursor: grab;
        transition: all 0.2s;
        border-radius: 6px;
        background: rgba(128, 128, 128, 0.05);
        z-index: 10;
        border: 2px solid transparent;
      }
      .dmf-dm-dragging .dmf-drag-tray {
        border: 2px dotted var(--kloak-icon-fg);
        opacity: 1;
        background: var(--kloak-bg-btn);
      }
      .dmf-drag-tray svg { width: 16px; height: 22px; pointer-events: none; }
      .dmf-drag-tray:hover {
        opacity: 0.9;
        background: var(--kloak-bg-btn);
        color: var(--kloak-text-main);
      }
      .dmf-drag-tray:active { cursor: grabbing; }

      /* Ghost element for manual dragging */
      .dmf-drag-ghost {
        position: fixed !important;
        pointer-events: none !important;
        z-index: 10000 !important;
        opacity: 0.8;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        background: var(--kloak-bg-secondary) !important;
        border: 1px solid var(--kloak-bg-btn);
        transform: scale(1.02);
        transition: none !important;
      }

      .dmf-drag-over {
        background: var(--kloak-bg-btn) !important;
        outline: 2px dashed var(--kloak-icon-fg) !important;
        outline-offset: -2px !important;
      }

      /* Ungrouped drop zone - Floating pill overlay */
      .dmf-ungroup-zone {
        position: absolute;
        bottom: 12px;
        left: 12px;
        right: 12px;
        background: var(--kloak-bg-secondary);
        border: 2px dashed var(--kloak-icon-fg);
        border-radius: 8px;
        padding: 14px 8px;
        text-align: center;
        color: var(--kloak-icon-fg);
        font-weight: 700;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        z-index: 10001;
        pointer-events: auto;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);

        display: none;
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28);
      }
      .dmf-ungroup-zone.visible {
        display: block;
        opacity: 1;
        transform: translateY(0);
      }
      .dmf-ungroup-zone.dmf-drag-over {
        background: var(--kloak-bg-btn);
        border-color: var(--kloak-text-main);
        color: var(--kloak-text-main);
        transform: scale(1.02);
        box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      }

      /* Dark gradient fade from bottom up */
      .dmf-ungroup-gradient {
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 160px;
        background: linear-gradient(to top,
          var(--kloak-bg-main) 0%,
          var(--kloak-bg-main) 45%,
          rgba(0,0,0,0) 100%
        );
        z-index: 10000;
        pointer-events: none;
        display: none;
        opacity: 0;
        transition: opacity 0.25s;
      }
      .dmf-ungroup-gradient.visible {
        display: block;
        opacity: 1;
      }

      /* Context menu */
      #${MENU_ID} {
        position: fixed; z-index: 99999;
        background: var(--kloak-bg-main); border: 1px solid var(--kloak-bg-btn);
        border-radius: 8px; padding: 4px; min-width: 160px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      }
      .dmf-ctx-item {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 10px; border-radius: 4px;
        font-size: 13px; color: var(--kloak-text-main);
        cursor: pointer; transition: background 0.1s;
        border: none; background: transparent; width: 100%;
        text-align: left;
      }
      .dmf-ctx-item:hover { background: var(--kloak-bg-btn); }
      .dmf-ctx-item.destructive { color: var(--kloak-accent-destructive); }
      .dmf-ctx-item.destructive:hover { background: rgba(235,20,20,0.1); }
      .dmf-ctx-sep { height: 1px; background: var(--kloak-bg-btn); margin: 4px 0; }

      /* Color picker inside context menu */
      .dmf-color-grid {
        display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;
        padding: 6px 10px;
      }
      .dmf-color-swatch {
        width: 22px; height: 22px; border-radius: 50%;
        cursor: pointer; border: 2px solid transparent;
        transition: border-color 0.15s, transform 0.1s;
      }
      .dmf-color-swatch:hover { transform: scale(1.15); }
      .dmf-color-swatch.selected { border-color: var(--kloak-text-main); }

      /* Rename input */
      .dmf-rename-input {
        background: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn);
        color: var(--kloak-text-main); font-size: 12px; font-weight: 600;
        padding: 4px 6px; border-radius: 4px; outline: none;
        text-transform: uppercase; letter-spacing: 0.04em;
        width: 100%;
      }
      .dmf-rename-input:focus { border-color: var(--kloak-text-main); }
    `;
    document.head.appendChild(style);
  };

  // ── Context menu ──
  const closeContextMenu = () => {
    const existing = document.getElementById(MENU_ID);
    if (existing) existing.remove();
    document.removeEventListener("click", closeContextMenu);
  };

  const showContextMenu = (e, folder) => {
    e.preventDefault();
    e.stopPropagation();
    closeContextMenu();

    const menu = document.createElement("div");
    menu.id = MENU_ID;

    // Rename
    const renameBtn = document.createElement("button");
    renameBtn.className = "dmf-ctx-item";
    renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg> Rename`;
    renameBtn.onclick = (ev) => {
      ev.stopPropagation();
      closeContextMenu();
      startRename(folder);
    };
    menu.appendChild(renameBtn);

    // Colour header
    const colorLabel = document.createElement("div");
    colorLabel.style.cssText =
      "padding: 6px 10px 2px; font-size: 11px; color: var(--kloak-icon-fg); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;";
    colorLabel.textContent = "Colour";
    menu.appendChild(colorLabel);

    // Colour grid
    const colorGrid = document.createElement("div");
    colorGrid.className = "dmf-color-grid";
    PRESET_COLORS.forEach((c) => {
      const swatch = document.createElement("div");
      swatch.className =
        "dmf-color-swatch" + (folder.color === c ? " selected" : "");
      swatch.style.background = c;
      swatch.onclick = (ev) => {
        ev.stopPropagation();
        folder.color = c;
        saveConfig();
        closeContextMenu();
        rebuildFolders();
      };
      colorGrid.appendChild(swatch);
    });
    menu.appendChild(colorGrid);

    const sep = document.createElement("div");
    sep.className = "dmf-ctx-sep";
    menu.appendChild(sep);

    // Delete
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "dmf-ctx-item destructive";
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Delete Folder`;
    deleteBtn.onclick = (ev) => {
      ev.stopPropagation();
      config.folders = config.folders.filter((f) => f.id !== folder.id);
      saveConfig();
      closeContextMenu();
      rebuildFolders();
    };
    menu.appendChild(deleteBtn);

    document.body.appendChild(menu);

    // Position
    const rect = menu.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;
    if (x + rect.width > window.innerWidth)
      x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight)
      y = window.innerHeight - rect.height - 8;
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    setTimeout(() => document.addEventListener("click", closeContextMenu), 0);
  };

  // ── Inline rename ──
  const startRename = (folder) => {
    const header = document.querySelector(`[data-dmf-folder="${folder.id}"]`);
    if (!header) return;
    const nameEl = header.querySelector(".dmf-folder-name");
    if (!nameEl) return;

    const input = document.createElement("input");
    input.className = "dmf-rename-input";
    input.value = folder.name;
    input.maxLength = 32;

    const finishRename = () => {
      isRenaming = false;
      const newName = input.value.trim() || folder.name;
      folder.name = newName;
      saveConfig();
      rebuildFolders();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finishRename();
      }
      if (e.key === "Escape") {
        isRenaming = false;
        rebuildFolders();
      }
      e.stopPropagation();
    });
    input.addEventListener("blur", finishRename);

    isRenaming = true;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
  };

  // ── Folder header builder ──
  const createFolderHeader = (folder) => {
    const header = document.createElement("div");
    header.className = "dmf-folder-header";
    header.setAttribute("data-dmf-folder", folder.id);
    header.draggable = false;

    const dot = document.createElement("div");
    dot.className = "dmf-color-dot";
    dot.style.background = folder.color;

    const chevron = document.createElement("div");
    chevron.className = "dmf-chevron" + (folder.collapsed ? " collapsed" : "");
    chevron.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

    const name = document.createElement("span");
    name.className = "dmf-folder-name";
    name.textContent = folder.name;

    const count = document.createElement("span");
    count.className = "dmf-folder-count";
    count.textContent = folder.dmIds.length;

    header.append(chevron, dot, name, count);

    // Click to toggle collapse
    header.addEventListener("click", (e) => {
      if (e.target.closest(".dmf-rename-input")) return;
      if (window._dmfJustDragged) return;
      folder.collapsed = !folder.collapsed;
      saveConfig();
      rebuildFolders();
    });

    // Right-click context menu
    header.addEventListener("contextmenu", (e) => showContextMenu(e, folder));

    // Manual Drag Logic for Folder Headers
    header.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.closest("button, .dmf-rename-input"))
        return;

      const container = getDmContainer();
      if (!container) return;

      const rect = header.getBoundingClientRect();
      activeManualDrag = {
        type: "folder",
        id: folder.id,
        el: header,
        ghost: null, // Deferred
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
      };

      // We DON'T preventDefault here so the click event can still fire
      // We also don't stopPropagation so we don't break other potential app logic
    });

    return header;
  };

  // ── Create folder button ──
  const injectCreateButton = () => {
    const headerRow = getDmHeader();
    if (!headerRow || headerRow.querySelector(".dmf-create-btn")) return;

    const btn = document.createElement("button");
    btn.className = "dmf-create-btn";
    btn.title = "Create DM Folder";
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kloak-icon-fg);"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const color = PRESET_COLORS[config.folders.length % PRESET_COLORS.length];
      config.folders.push({
        id: genId(),
        name: "New Folder",
        color,
        collapsed: false,
        dmIds: [],
      });
      saveConfig();
      rebuildFolders();
    });

    // Insert before existing "Create Group" button
    const existingBtns = headerRow.querySelectorAll("button");
    if (existingBtns.length > 0) {
      existingBtns[0].parentNode.insertBefore(btn, existingBtns[0]);
    } else {
      headerRow.appendChild(btn);
    }
  };

  // ── Main rebuild ──
  const rebuildFolders = () => {
    if (!isEnabled || isRenaming || isRebuilding) return;
    const container = getDmContainer();
    if (!container) return;

    isRebuilding = true;
    // Temporarily disconnect observer to prevent self-triggering Loops
    if (observer) observer.disconnect();

    // Clean up previous injections (headers only, so we don't drop event listeners)
    removeHeadersOnly();

    // Gather all real DM items (exclude our injected elements)
    const allDmItems = Array.from(
      container.querySelectorAll(":scope > .group"),
    );

    // Map each DM item to its conversation ID
    const dmMap = new Map(); // convId -> dmElement
    const unmappedItems = [];
    allDmItems.forEach((item) => {
      const convId = getConversationIdForDmItem(item);
      if (convId) {
        dmMap.set(convId, item);
      } else {
        unmappedItems.push(item);
      }
    });

    container.classList.add("dmf-dm-container");
    container.setAttribute("data-dmf-listeners", "1");
    // We add class to body so React can't strip it from the container and break our drag CSS
    document.body.classList.add("dmf-active");

    // Establish event delegation on the container exactly once
    // Establish manual dragging listeners on the window
    if (!window._dmfManualDragInited) {
      window._dmfManualDragInited = true;

      window.addEventListener("mousemove", (e) => {
        if (!activeManualDrag) return;

        // Lazy ghost creation after 5px movement
        if (!activeManualDrag.ghost) {
          const dx = e.clientX - activeManualDrag.startX;
          const dy = e.clientY - activeManualDrag.startY;
          if (Math.sqrt(dx * dx + dy * dy) < 5) return;

          // Start the drag
          const { el, type } = activeManualDrag;
          const rect = el.getBoundingClientRect();
          const ghost = el.cloneNode(true);

          // Clean up ghost
          const gt = ghost.querySelector(".dmf-drag-tray");
          if (gt) gt.remove();

          ghost.className += " dmf-drag-ghost";
          ghost.style.width = rect.width + "px";
          ghost.style.height = rect.height + "px";
          ghost.style.left = rect.left + "px";
          ghost.style.top = rect.top + "px";
          document.body.appendChild(ghost);

          activeManualDrag.ghost = ghost;
          el.classList.add(type === "dm" ? "dmf-dm-dragging" : "dmf-dragging");

          if (type === "dm") {
            const container = getDmContainer();
            const zone = container.querySelector(".dmf-ungroup-zone");
            if (zone) zone.classList.add("visible");
            const grad = container.querySelector(".dmf-ungroup-gradient");
            if (grad) grad.classList.add("visible");
          }
        }

        const { ghost, offsetX, offsetY } = activeManualDrag;
        ghost.style.left = e.clientX - offsetX + "px";
        ghost.style.top = e.clientY - offsetY + "px";

        // Collision Detection
        document
          .querySelectorAll(".dmf-drag-over")
          .forEach((el) => el.classList.remove("dmf-drag-over"));
        lastCollisionTarget = null;

        // Check objects under mouse
        const targets = document.elementsFromPoint(e.clientX, e.clientY);
        for (const t of targets) {
          // Folder Header?
          const folderHeader = t.closest(".dmf-folder-header");
          if (folderHeader && folderHeader !== activeManualDrag.el) {
            folderHeader.classList.add("dmf-drag-over");
            lastCollisionTarget = {
              type: "folder",
              id: folderHeader.getAttribute("data-dmf-folder"),
              el: folderHeader,
            };
            break;
          }
          // DM Item?
          const dmItem = t.closest(".dmf-dm-container > .group");
          if (dmItem && dmItem !== activeManualDrag.el) {
            dmItem.classList.add("dmf-drag-over");
            lastCollisionTarget = {
              type: "dm",
              id: getConversationIdForDmItem(dmItem),
              el: dmItem,
            };
            break;
          }
          // Ungroup Zone?
          const ungroupZone = t.closest(".dmf-ungroup-zone");
          if (ungroupZone) {
            ungroupZone.classList.add("dmf-drag-over");
            lastCollisionTarget = { type: "ungroup", el: ungroupZone };
            break;
          }
        }
      });

      window.addEventListener("mouseup", () => {
        if (!activeManualDrag) return;
        const drag = activeManualDrag;
        activeManualDrag = null;

        if (drag.ghost) {
          drag.ghost.remove();
          // Suppress next click if we actually dragged
          window._dmfJustDragged = true;
          setTimeout(() => {
            window._dmfJustDragged = false;
          }, 100);
        }
        if (drag.el)
          drag.el.classList.remove("dmf-dm-dragging", "dmf-dragging");

        const zone = document.querySelector(".dmf-ungroup-zone");
        if (zone) zone.classList.remove("visible");
        const grad = document.querySelector(".dmf-ungroup-gradient");
        if (grad) grad.classList.remove("visible");

        if (lastCollisionTarget) {
          const target = lastCollisionTarget;
          const srcId = drag.id;

          if (drag.type === "dm") {
            // Remove from all folders first
            config.folders.forEach((f) => {
              f.dmIds = f.dmIds.filter((id) => id !== srcId);
            });

            if (target.type === "folder") {
              const folder = config.folders.find((f) => f.id === target.id);
              if (folder && !folder.dmIds.includes(srcId))
                folder.dmIds.push(srcId);
            } else if (target.type === "dm") {
              const folder = config.folders.find((f) =>
                f.dmIds.includes(target.id),
              );
              if (folder) {
                const idx = folder.dmIds.indexOf(target.id);
                folder.dmIds.splice(idx, 0, srcId);
              }
            }
            // If target is 'ungroup', it's already removed from folder.dmIds, so we just rebuild.
          } else if (drag.type === "folder") {
            if (target.type === "folder") {
              const srcIdx = config.folders.findIndex((f) => f.id === srcId);
              const dstIdx = config.folders.findIndex(
                (f) => f.id === target.id,
              );
              if (srcIdx !== -1 && dstIdx !== -1) {
                const [moved] = config.folders.splice(srcIdx, 1);
                config.folders.splice(dstIdx, 0, moved);
              }
            }
          }
          saveConfig();
          rebuildFolders();
        }

        lastCollisionTarget = null;
        document
          .querySelectorAll(".dmf-drag-over")
          .forEach((el) => el.classList.remove("dmf-drag-over"));
      });
    }

    // Support CSS order sorting to avoid physically moving DOM nodes
    // Moving DOM nodes breaks the underlying UI framework
    container.style.display = "grid";
    container.style.gridTemplateColumns = "minmax(0, 1fr)";
    container.style.alignContent = "start";

    let currentOrder = 0;

    // Create ungroup drop zone as floating overlay
    const ungroupZone = document.createElement("div");
    ungroupZone.className = "dmf-ungroup-zone";
    ungroupZone.textContent = "Drop here to remove from folder";

    // Create bottom fade gradient
    const ungroupGrad = document.createElement("div");
    ungroupGrad.className = "dmf-ungroup-gradient";

    // Append to sidebar parent for absolute positioning
    const sidebar = container.closest("aside.w-60");
    if (sidebar) {
      if (getComputedStyle(sidebar).position === "static") {
        sidebar.style.position = "relative";
      }
      sidebar.appendChild(ungroupGrad);
      sidebar.appendChild(ungroupZone);
    } else {
      container.appendChild(ungroupGrad);
      container.appendChild(ungroupZone);
    }

    // Track which DM items are in a folder
    const folderedConvIds = new Set();
    config.folders.forEach((f) =>
      f.dmIds.forEach((id) => folderedConvIds.add(id)),
    );

    // Set fallback initialization and inject drag trays
    allDmItems.forEach((item) => {
      item.setAttribute("draggable", "false");
      item
        .querySelectorAll("img")
        .forEach((img) => img.setAttribute("draggable", "false"));

      const convId = getConversationIdForDmItem(item);
      const isFoldered = convId && folderedConvIds.has(convId);

      if (isFoldered) {
        item.classList.remove("dmf-item-unfoldered");
      } else {
        item.classList.add("dmf-item-unfoldered");
      }

      if (!item.querySelector(".dmf-drag-tray")) {
        const tray = document.createElement("div");
        tray.className = "dmf-drag-tray";
        tray.title = "Drag to move";
        tray.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/></svg>`;

        // Manual drag mousedown
        tray.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          const cId = getConversationIdForDmItem(item);
          if (!cId) return;

          const rect = item.getBoundingClientRect();
          activeManualDrag = {
            type: "dm",
            id: cId,
            el: item,
            ghost: null, // Deferred
            startX: e.clientX,
            startY: e.clientY,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
          };

          e.preventDefault();
          e.stopPropagation();
        });

        item.prepend(tray);
      }
    });

    // Removed the stale ID cleanup from here because if dmConversations or the DOM
    // hasn't fully loaded, it incorrectly filters out saved DMs (causing persistence bugs).

    // Build folder sections
    // Strategy: Assign CSS order to sort visually without mutating the DOM layout
    config.folders.forEach((folder) => {
      const header = createFolderHeader(folder);
      header.style.order = currentOrder++;
      container.appendChild(header);

      folder.dmIds.forEach((convId) => {
        const dmEl = dmMap.get(convId);
        if (dmEl) {
          dmEl.style.order = currentOrder++;
          if (folder.collapsed) {
            dmEl.style.display = "none";
          } else {
            dmEl.style.display = "";
          }
        }
      });
    });

    // Add a separator for ungrouped DMs if there are any folders
    let hasUngrouped = false;
    allDmItems.forEach((item) => {
      const convId = getConversationIdForDmItem(item);
      if (convId && !folderedConvIds.has(convId)) {
        hasUngrouped = true;
      }
    });

    if (config.folders.length > 0 && hasUngrouped) {
      const separator = document.createElement("div");
      separator.className = "dmf-divider";
      separator.style.height = "1px";
      separator.style.backgroundColor = "var(--kloak-icon-fg)";
      separator.style.margin = "12px 16px 12px -6px"; // Symmetrical 16px gap on both sides
      separator.style.pointerEvents = "none";
      separator.style.opacity = "0.1";

      separator.style.order = currentOrder++;
      container.appendChild(separator);
    }

    // Show all ungrouped DMs normally
    allDmItems.forEach((item) => {
      const convId = getConversationIdForDmItem(item);
      if (convId && !folderedConvIds.has(convId)) {
        item.style.order = currentOrder++;
        item.style.display = "";
      }
    });

    injectCreateButton();

    isRebuilding = false;
    // Reconnect observer
    if (observer)
      observer.observe(container, { childList: true, subtree: false });
  };

  // ── MutationObserver ──
  const setupObserver = () => {
    if (observer) observer.disconnect();

    const target = getDmContainer();
    if (!target) {
      fullCleanupDOM(); // Just in case, clean up
      return;
    }

    let rebuildTimeout = null;
    observer = new MutationObserver(() => {
      // Debounce rebuilds
      if (rebuildTimeout) clearTimeout(rebuildTimeout);
      rebuildTimeout = setTimeout(() => {
        if (isEnabled) rebuildFolders();
      }, 100);
    });

    observer.observe(target, { childList: true, subtree: false });
    rebuildFolders();
  };

  // Also watch for sidebar appearing/disappearing (navigation)
  let sidebarObserver = null;
  const setupSidebarWatcher = () => {
    if (sidebarObserver) sidebarObserver.disconnect();

    // Find the main layout area where sidebars are swapped
    const mainLayout =
      document.querySelector("main")?.parentNode || document.body;

    sidebarObserver = new MutationObserver((mutations) => {
      if (!isEnabled || isRenaming) return;

      // Only check if children were added (likely navigation)
      const hasAddedNodes = mutations.some((m) => m.addedNodes.length > 0);
      if (!hasAddedNodes) return;

      const container = getDmContainer();
      if (container) {
        if (!container.querySelector(".dmf-ungroup-zone")) {
          setupObserver();
        }
      } else {
        fullCleanupDOM(); // Clean up if we switched tabs
      }
    });

    sidebarObserver.observe(mainLayout, { childList: true, subtree: true });
  };

  // ── Cleanup ──
  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (sidebarObserver) {
      sidebarObserver.disconnect();
      sidebarObserver = null;
    }
    closeContextMenu();

    // Remove style tag
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();

    // Remove injected elements
    fullCleanupDOM();

    // Restore fetch
    if (window.fetch === patchedFetch) {
      window.fetch = originalFetch;
    }
  };

  // ── Register ──
  window.KloakAddons.registerAddon({
    id: ADDON_ID,
    name: "DM Folders",
    description: "Organise your DMs into collapsible, colour-coded folders.",

    onEnable: async () => {
      isEnabled = true;
      if (window.KloakAddonAPI) {
        window.KloakAddonAPI.onReady(async () => {
          if (!isEnabled) return;
          await loadConfig();
          injectStyles();
          window.fetch = patchedFetch;
          await fetchConversations();
          setupObserver();
          setupSidebarWatcher();
        });
      } else {
        await loadConfig();
        injectStyles();
        window.fetch = patchedFetch;
        setupObserver();
        setupSidebarWatcher();
      }
    },

    onDisable: () => {
      isEnabled = false;
      cleanup();
    },

    renderSettings: (container) => {
      const folderCount = config.folders.length;
      const dmCount = config.folders.reduce(
        (sum, f) => sum + f.dmIds.length,
        0,
      );

      container.innerHTML = `
        <div class="addon-settings-item">
          <p style="margin: 0; color: var(--kloak-text-sub); font-size: 13px;">
            Organise your DMs into collapsible folders. Right-click a folder header to rename, change colour, or delete.
          </p>
          <div style="margin-top: 12px; padding: 12px; background: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn); border-radius: 8px;">
            <p style="margin: 0; color: var(--kloak-text-main); font-size: 14px; font-weight: 600;">
              ${folderCount} folder${folderCount !== 1 ? "s" : ""} · ${dmCount} DM${dmCount !== 1 ? "s" : ""} grouped
            </p>
          </div>
          <button id="dmf-reset-btn" class="addon-btn-save" style="margin-top: 12px; background: var(--kloak-accent-destructive); color: var(--kloak-text-main);">
            Reset All Folders
          </button>
          <span id="dmf-reset-msg" class="addon-save-msg"></span>
        </div>
      `;

      container
        .querySelector("#dmf-reset-btn")
        .addEventListener("click", () => {
          config.folders = [];
          saveConfig();
          rebuildFolders();
          const msg = container.querySelector("#dmf-reset-msg");
          msg.textContent = "All folders removed.";
          container.querySelector("#dmf-reset-btn").textContent = "✓ Done";
          setTimeout(() => {
            msg.textContent = "";
            container.querySelector("#dmf-reset-btn").textContent =
              "Reset All Folders";
          }, 2000);
        });
    },
  });
})();
