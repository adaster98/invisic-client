(() => {
  const ADDON_ID = "permissions-viewer";

  // State
  let menuObserver = null;

  // Permission Configuration
  const CATEGORIES = [
    {
      id: "general",
      name: "General",
      subtext: "Basic server access and interaction",
      permissions: [
        {
          id: "view_channels",
          name: "View Channels",
          description:
            "Allows members to view channels and read messages in them.",
        },
        {
          id: "read_message_history",
          name: "Read Message History",
          description:
            "Allows members to read previously sent messages in channels.",
        },
        {
          id: "send_messages",
          name: "Send Messages",
          description: "Allows members to send messages in text channels.",
        },
        {
          id: "add_reactions",
          name: "Add Reactions",
          description: "Allows members to add emoji reactions to messages.",
        },
      ],
    },
    {
      id: "messages",
      name: "Messages",
      subtext: "Messaging features and content",
      permissions: [
        {
          id: "attach_files",
          name: "Attach Files",
          description: "Allows members to upload files and images in messages.",
        },
        {
          id: "embed_links",
          name: "Embed Links",
          description: "Allows members to post links with embedded previews.",
        },
        {
          id: "use_external_emojis",
          name: "Use External Emojis",
          description: "Allows members to use emojis from other servers.",
        },
        {
          id: "mention_roles",
          name: "Mention Roles",
          description:
            "Allows members to mention roles to notify role members.",
        },
        {
          id: "mention_everyone",
          name: "Mention @everyone",
          description: "Allows members to use @everyone to notify all members.",
          comingSoon: true,
        },
      ],
    },
    {
      id: "moderation",
      name: "Moderation",
      subtext: "Member management and moderation tools",
      permissions: [
        {
          id: "kick_members",
          name: "Kick Members",
          description:
            "Allows members to remove other members from the server.",
        },
        {
          id: "ban_members",
          name: "Ban Members",
          description:
            "Allows members to permanently ban other members from the server.",
        },
        {
          id: "manage_nicknames",
          name: "Manage Nicknames",
          description:
            "Allows members to change the nicknames of other members.",
          comingSoon: true,
        },
        {
          id: "change_nickname",
          name: "Change Own Nickname",
          description: "Allows members to change their own server nickname.",
        },
        {
          id: "mute_members",
          name: "Mute Members",
          description: "Allows members to mute other members.",
          comingSoon: true,
        },
        {
          id: "deafen_members",
          name: "Deafen Members",
          description: "Allows members to deafen other members.",
          comingSoon: true,
        },
        {
          id: "move_members",
          name: "Move Members",
          description: "Allows members to move other members.",
          comingSoon: true,
        },
      ],
    },
    {
      id: "management",
      name: "Channel Management",
      subtext: "Channel and message administration",
      permissions: [
        {
          id: "manage_channels",
          name: "Manage Channels",
          description: "Allows members to create, edit, and delete channels.",
        },
        {
          id: "manage_messages",
          name: "Manage Messages",
          description:
            "Allows members to delete and pin messages from other members.",
        },
        {
          id: "pin_messages",
          name: "Pin Messages",
          description: "Allows members to pin important messages in channels.",
        },
        {
          id: "manage_threads",
          name: "Manage Threads",
          description: "Allows members to manage forum threads.",
          comingSoon: true,
        },
      ],
    },
    {
      id: "administration",
      name: "Server Administration",
      subtext: "Server-wide settings and configuration",
      permissions: [
        {
          id: "manage_server",
          name: "Manage Server",
          description: "Allows members to change server settings.",
        },
        {
          id: "manage_roles",
          name: "Manage Roles",
          description: "Allows members to create and edit roles.",
        },
        {
          id: "manage_emojis",
          name: "Manage Emojis",
          description: "Allows members to manage custom server emojis.",
        },
        {
          id: "create_instant_invite",
          name: "Create Invite",
          description: "Allows members to create invite links for the server.",
        },
        {
          id: "manage_invites",
          name: "Manage Invites",
          description: "Allows members to revoke server invite links.",
        },
        {
          id: "manage_webhooks",
          name: "Manage Webhooks",
          description: "Allows members to manage server webhooks.",
          comingSoon: true,
        },
      ],
    },
    {
      id: "voice",
      name: "Voice",
      subtext: "Voice channel capabilities",
      permissions: [
        {
          id: "connect",
          name: "Connect",
          description: "Allows members to join voice channels.",
        },
        {
          id: "speak",
          name: "Speak",
          description: "Allows members to speak in voice channels.",
        },
        {
          id: "use_voice_activation",
          name: "Voice Activity",
          description: "Allows members to use voice activity detection.",
        },
      ],
    },
    {
      id: "advanced",
      name: "Advanced",
      subtext: "Application integrations",
      permissions: [
        {
          id: "use_application_commands",
          name: "Use Commands",
          description: "Allows members to use slash commands.",
        },
      ],
    },
  ];

  const callRpc = (rpcName, body) => window.KloakAddonAPI.rpc(rpcName, body);

  const escapeHtml = (str) => {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const generateTriState = (permId, roleId, roles, permissions) => {
    const everyoneRole = roles.find((r) => r.name === "@everyone");
    const rolePerm = permissions.find(
      (p) => p.role_id === roleId && p.permission === permId,
    );

    let activeState = "inherit";
    if (roleId === everyoneRole?.id) {
      if (rolePerm) activeState = rolePerm.allowed ? "check" : "x";
      else activeState = "x";
    } else {
      if (rolePerm) activeState = rolePerm.allowed ? "check" : "x";
      else activeState = "inherit";
    }

    const btnClass =
      "px-2.5 py-1 text-[10px] font-bold rounded-md transition-all";
    const inactiveClass = "text-muted-foreground";

    return `
      <div class="flex bg-secondary/80 rounded-lg p-0.5 border border-border/50 flex-shrink-0 pointer-events-none">
        <button class="${btnClass} ${activeState === "x" ? "bg-red-600 text-white shadow-sm" : inactiveClass}">✕</button>
        <button class="${btnClass} ${activeState === "inherit" ? "bg-background text-foreground shadow-sm border border-border" : inactiveClass}">/</button>
        <button class="${btnClass} ${activeState === "check" ? "bg-emerald-600 text-white shadow-sm" : inactiveClass}">✓</button>
      </div>
    `;
  };

  const renderModalSkeleton = () => {
    return `
      <div class="addon-role-modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:center; z-index:999999; animation: addonFadeIn 0.2s ease-out;">
        <div class="addon-role-panel" style="width:min(580px, 95vw); max-height:85vh; background:var(--kloak-bg-main); border:1px solid var(--kloak-bg-btn); border-radius:16px; display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,0.6); overflow:hidden; animation: addonPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
          
          <div style="padding:16px 20px; border-bottom:1px solid var(--kloak-bg-btn); display:flex; justify-content:space-between; align-items:center; background:var(--kloak-bg-box);">
            <div>
              <h2 style="color:var(--kloak-text-main); font-size:16px; font-weight:700; margin:0;">Server Permissions</h2>
              <p style="color:var(--kloak-text-sub); font-size:12px; margin:2px 0 0 0;">Inspect role-based access across categories.</p>
            </div>
            <button class="addon-close-btn" style="background:var(--kloak-bg-btn); border:none; width:30px; height:30px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: all 0.2s;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div id="addon-modal-dynamic-content" style="flex:1; display:flex; flex-direction:column; min-height:0;"></div>
        </div>
      </div>
      <style>
        @keyframes addonFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes addonPopIn { from { transform:scale(0.96); opacity:0; } to { transform:scale(1); opacity:1; } }
        .addon-dropdown-wrapper { position: relative; width: 100%; }
        .addon-dropdown-trigger { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background-color: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn); color: var(--kloak-text-main); border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 500; transition: border-color 0.2s; }
        .addon-dropdown-trigger:hover { border-color: var(--kloak-text-sub); }
        .addon-dropdown-menu { display: none; position: absolute; top: calc(100% + 6px); left: 0; width: 100%; background-color: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn); border-radius: 10px; z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-height: 250px; overflow-y: auto; animation: dropdownFade 0.15s ease-out; }
        @keyframes dropdownFade { from { opacity:0; transform: translateY(-10px); } to { opacity:1; transform: translateY(0); } }
        .addon-dropdown-item { display: flex; align-items: center; padding: 10px 14px; font-size: 13px; color: var(--kloak-text-main); cursor: pointer; transition: background-color 0.15s; }
        .addon-dropdown-item:hover { background-color: var(--kloak-bg-btn); }
        .addon-role-dot { width: 10px; height: 10px; border-radius: 50%; margin-right: 10px; flex-shrink: 0; }
        .addon-close-btn:hover { background: var(--kloak-icon-bg) !important; color: var(--kloak-text-main); }
        .permission-row:hover { background-color: var(--kloak-bg-box); }
        .coming-soon-badge { display: inline-flex; align-items: center; border-radius: 9999px; border-width: 1px; font-size: 9px; padding-left: 6px; padding-right: 6px; height: 16px; font-weight: 500; color: var(--kloak-text-sub); border-color: rgba(148, 148, 148, 0.3); margin-left: 8px; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--kloak-bg-btn); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--kloak-text-sub); }
      </style>`;
  };

  const showRolesModal = async () => {
    const api = window.KloakAddonAPI;
    const serverId = api?.currentServerID;
    if (!serverId) {
      alert("Please enter a server first.");
      return;
    }

    const modalContainer = document.createElement("div");
    modalContainer.id = "addon-permissions-modal-root";
    modalContainer.innerHTML = renderModalSkeleton();
    document.body.appendChild(modalContainer);

    const dynamicContent = modalContainer.querySelector(
      "#addon-modal-dynamic-content",
    );

    const renderDataView = (roles, permissions) => {
      roles.sort((a, b) => (b.position || 0) - (a.position || 0));
      const everyone = roles.find((r) => r.name === "@everyone") || roles[0];

      dynamicContent.innerHTML = `
        <div style="padding:16px 20px; border-bottom:1px solid var(--kloak-bg-btn);">
          <label style="color:var(--kloak-text-sub); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; display:block; margin-bottom:8px;">Current Role</label>
          <div class="addon-dropdown-wrapper">
             <div id="snazzy-trigger" class="addon-dropdown-trigger">
                <div style="display:flex; align-items:center;">
                   <div class="addon-role-dot" style="background:${everyone.color || "#949494"}" id="trigger-dot"></div>
                   <span id="trigger-label">${escapeHtml(everyone.name === "@everyone" ? "Everyone" : everyone.name)}</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--kloak-text-sub)"><path d="m6 9 6 6 6-6"/></svg>
             </div>
             <div id="snazzy-menu" class="addon-dropdown-menu custom-scrollbar">
                ${roles
                  .map(
                    (r) => `
                   <div class="addon-dropdown-item" data-id="${r.id}" data-color="${r.color || "#949494"}" data-name="${escapeHtml(r.name === "@everyone" ? "Everyone" : r.name)}">
                      <div class="addon-role-dot" style="background:${r.color || "#949494"}"></div>
                      <span>${escapeHtml(r.name === "@everyone" ? "Everyone" : r.name)}</span>
                   </div>
                `,
                  )
                  .join("")}
             </div>
          </div>
        </div>
        <div id="addon-role-content" class="custom-scrollbar" style="flex:1; overflow-y:auto; padding:16px 20px;"></div>
      `;

      const trigger = dynamicContent.querySelector("#snazzy-trigger");
      const menu = dynamicContent.querySelector("#snazzy-menu");
      const triggerDot = dynamicContent.querySelector("#trigger-dot");
      const triggerLabel = dynamicContent.querySelector("#trigger-label");
      const contentEl = dynamicContent.querySelector("#addon-role-content");

      const updateContent = (roleId) => {
        let html = `<div class="space-y-6">`;
        CATEGORIES.forEach((cat) => {
          html += `<div style="margin-bottom: 24px;">
              <div style="margin-bottom: 10px; padding: 0 10px;">
                <h4 style="font-size:11px; font-family:monospace; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--kloak-text-sub); margin:0;">${cat.name}</h4>
                <p style="font-size:11px; color:var(--kloak-text-sub); margin:2px 0 0 0; opacity:0.8;">${cat.subtext}</p>
              </div>
              <div style="display: flex; flex-direction: column; gap: 2px;">
                ${cat.permissions
                  .map(
                    (perm) => `
                    <div class="permission-row" style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-radius:10px; transition: background-color 0.15s;">
                      <div style="flex:1; min-width:0; margin-right:12px;">
                        <div style="display:flex; align-items:center;">
                          <span style="font-size:14px; font-weight:550; color:var(--kloak-text-main);">${perm.name}</span>
                          ${perm.comingSoon ? `<span class="coming-soon-badge">Coming soon</span>` : ""}
                        </div>
                        <p style="font-size:12px; color:var(--kloak-text-sub); margin:2px 0 0 0; line-height:1.4;">${perm.description}</p>
                      </div>
                      ${generateTriState(perm.id, roleId, roles, permissions)}
                    </div>
                  `,
                  )
                  .join("")}
              </div>
            </div>`;
        });
        html += `</div>`;
        contentEl.innerHTML = html;
      };

      trigger.onclick = (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === "block" ? "none" : "block";
      };
      dynamicContent
        .querySelectorAll(".addon-dropdown-item")
        .forEach((item) => {
          item.onclick = (e) => {
            triggerDot.style.background = item.getAttribute("data-color");
            triggerLabel.textContent = item.getAttribute("data-name");
            menu.style.display = "none";
            updateContent(item.getAttribute("data-id"));
          };
        });
      document.addEventListener(
        "click",
        () => {
          if (menu) menu.style.display = "none";
        },
        { once: true },
      );
      updateContent(everyone.id);
    };

    dynamicContent.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:var(--kloak-text-sub); padding:40px; text-align:center;">
        <div class="loader-spinner" style="width:24px; height:24px; border:2px solid var(--kloak-bg-btn); border-top-color:var(--kloak-text-main); border-radius:50%; animation: spin 1s linear infinite;"></div>
        <p style="color:var(--kloak-text-main); font-weight:600; margin:0;">Loading permissions...</p>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;

    try {
      const [roles, permissions] = await Promise.all([
        callRpc("get_server_roles_secure", {
          _server_id: serverId,
          _user_id: api.userID,
        }),
        callRpc("get_role_permissions", { _server_id: serverId }),
      ]);
      renderDataView(roles, permissions);
    } catch (e) {
      dynamicContent.innerHTML = `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:var(--kloak-text-sub); padding:40px; text-align:center;">
           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--kloak-accent-destructive)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
           <p style="color:var(--kloak-text-main); font-weight:600;">Request Failed</p>
           <p style="font-size:12px;">${e.message}</p>
           <button onclick="window.location.reload()" style="background:var(--kloak-bg-btn); color:var(--kloak-text-main); border:1px solid var(--kloak-bg-btn); padding:8px 20px; border-radius:8px; cursor:pointer; font-weight:600;">Manual Refresh</button>
        </div>
      `;
    }

    modalContainer.querySelector(".addon-close-btn").onclick = () =>
      modalContainer.remove();
    modalContainer.querySelector(".addon-role-modal-overlay").onclick = (e) => {
      if (e.target === e.currentTarget) modalContainer.remove();
    };
  };

  const injectToMenu = (menuEl) => {
    if (!menuEl || menuEl.getAttribute("data-state") !== "open") return;
    if (menuEl.querySelector(`[data-addon="${ADDON_ID}"]`)) return;

    const menuText = menuEl.textContent;
    const isSidebarContextMenu =
      menuText.includes("Mark as Read") || menuText.includes("Mute Server");
    const isHeaderDropdown =
      menuText.includes("Invite People") ||
      menuText.includes("Server Settings");

    if (!isSidebarContextMenu && !isHeaderDropdown) return;

    const leaveBtn = Array.from(
      menuEl.querySelectorAll('[role="menuitem"]'),
    ).find(
      (item) =>
        item.textContent.includes("Leave Server") ||
        item.classList.contains("text-destructive"),
    );

    const newItem = document.createElement("div");
    newItem.setAttribute("role", "menuitem");
    newItem.setAttribute("data-addon", ADDON_ID);

    if (isSidebarContextMenu) {
      // Style for Right-Click Context Menu
      newItem.className =
        "relative flex cursor-default select-none items-center rounded-lg px-3 py-2 text-sm outline-none transition-colors text-popover-foreground hover:bg-white/10 hover:text-foreground focus:bg-white/15 focus:text-foreground cursor-pointer";
      newItem.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-check w-4 h-4 mr-2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
        View Permissions
      `;
    } else {
      // Style for Main Server Header Dropdown
      newItem.className =
        "relative select-none text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:text-foreground focus:text-foreground flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-secondary/60 focus:bg-secondary/80 transition-colors";
      newItem.innerHTML = `
        <div class="w-6 h-6 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield-check w-3.5 h-3.5 text-muted-foreground">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
        </div>
        <span class="text-sm font-medium">View Permissions</span>
      `;
    }

    newItem.onclick = (e) => {
      e.stopPropagation();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      showRolesModal();
    };

    if (leaveBtn) {
      const prev = leaveBtn.previousElementSibling;
      if (prev && prev.getAttribute("role") !== "separator") {
        const sep = document.createElement("div");
        sep.setAttribute("role", "separator");
        sep.className = "-mx-1 h-px my-1 bg-border/50";
        menuEl.insertBefore(sep, leaveBtn);
      }
      menuEl.insertBefore(newItem, leaveBtn);
    } else {
      menuEl.appendChild(newItem);
    }
  };

  const startInjection = () => {
    menuObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "childList") {
          for (const node of m.addedNodes)
            if (node.nodeType === 1) {
              const menu =
                node.querySelector?.('[role="menu"]') ||
                (node.getAttribute?.("role") === "menu" ? node : null);
              if (menu) setTimeout(() => injectToMenu(menu), 50);
            }
        } else if (
          m.type === "attributes" &&
          m.attributeName === "data-state"
        ) {
          if (m.target.getAttribute?.("data-state") === "open")
            injectToMenu(m.target);
        }
      }
    });
    menuObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
  };

  const stopInjection = () => {
    if (menuObserver) menuObserver.disconnect();
    document
      .querySelectorAll(`[data-addon="${ADDON_ID}"]`)
      .forEach((el) => el.remove());
  };

  window.KloakAddons.registerAddon({
    id: ADDON_ID,
    name: "Server Permissions Viewer",
    description:
      "Reveal the inner workings of any server — inspect role permissions and inheritance.",
    onEnable: () => {
      if (window.KloakAddonAPI)
        window.KloakAddonAPI.onReady(() => startInjection());
      else startInjection();
    },
    onDisable: () => stopInjection(),
  });
})();
