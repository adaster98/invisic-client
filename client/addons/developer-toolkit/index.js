(async () => {
  const ADDON_ID = "developer-toolkit";

  let config = { showIdsInChat: true };
  try {
    if (window.electronAPI && window.electronAPI.getAddonConfig) {
      const savedConfig = await window.electronAPI.getAddonConfig(ADDON_ID);
      if (savedConfig && typeof savedConfig.showIdsInChat === "boolean") {
        config.showIdsInChat = savedConfig.showIdsInChat;
      }
    }
  } catch (e) {}

  const STYLE_CONFIG = {
    msgId:
      "kloak-injected-msg-id text-[10px] text-muted-foreground/40 font-mono mt-1 select-text transition-colors hover:text-muted-foreground/80 block",
    userId:
      "kloak-injected-user-id text-[10px] text-muted-foreground/40 font-mono ml-2 mr-1 select-text transition-colors hover:text-muted-foreground/80",
  };

  const MESSAGE_SELECTOR = 'div[id^="message-"], div[id^="dm-message-"]';

  const extractMsgId = (id) =>
    id.replace(/^dm-message-/, "").replace(/^message-/, "");

  // Global State & Caches
  let domObserver = null;
  let rightClickObserver = null;
  let messagesLoadedHandler = null;

  let lastRightClickedMessageId = null;

  const msgToUserMap = new Map();
  const userProfileCache = new Map();

  // Use the centralized event system instead of fetch interception
  const setupEventListener = () => {
    const api = window.KloakAddonAPI;
    if (!api || !api.events) return;

    messagesLoadedHandler = ({ messages }) => {
      if (!Array.isArray(messages)) return;
      messages.forEach((msg) => {
        const uId = msg.user_id || msg.sender_id;
        const uProfile = msg.user || msg.sender;

        if (msg.id && uId) {
          msgToUserMap.set(String(msg.id), String(uId));
        }

        if (uProfile && uProfile.id) {
          userProfileCache.set(String(uProfile.id), uProfile);
        }
      });

      if (config.showIdsInChat) {
        setTimeout(
          () =>
            document
              .querySelectorAll(MESSAGE_SELECTOR)
              .forEach(processMessage),
          50,
        );
      }
    };
    api.events.on("messagesLoaded", messagesLoadedHandler);
  };

  const removeEventListener = () => {
    if (messagesLoadedHandler && window.KloakAddonAPI?.events) {
      window.KloakAddonAPI.events.off("messagesLoaded", messagesLoadedHandler);
      messagesLoadedHandler = null;
    }
  };

  const getUserIdForMessage = (msgNode) => {
    const msgId = extractMsgId(msgNode.id);

    if (msgToUserMap.has(msgId)) return msgToUserMap.get(msgId);

    const api = window.KloakAddonAPI;
    if (api && api.userID && msgNode.classList.contains("flex-row-reverse")) {
      msgToUserMap.set(msgId, api.userID);
      return api.userID;
    }

    return null;
  };

  const processMessage = (msgNode) => {
    if (!config.showIdsInChat) return;

    const fullMsgId = msgNode.id;
    if (!fullMsgId) return;

    const isMsg =
      fullMsgId.startsWith("message-") || fullMsgId.startsWith("dm-message-");
    if (!isMsg) return;

    const msgId = extractMsgId(fullMsgId);
    const isDM = fullMsgId.startsWith("dm-message-");

    if (!msgNode.dataset.msgIdInjected) {
      let contentContainer = null;

      if (isDM) {
        // Fix: Securely target the 2nd child (message body div) instead of fragile CSS classes
        const minW0 = msgNode.querySelector(".flex-1.min-w-0");
        if (minW0 && minW0.children.length > 1) {
          contentContainer = minW0.children[1];
        }
      } else {
        contentContainer = msgNode.querySelector(
          ".flex-1.min-w-0.overflow-hidden",
        );
      }

      if (contentContainer) {
        const idDiv = document.createElement("div");
        idDiv.className = STYLE_CONFIG.msgId;
        idDiv.textContent = `msg: ${msgId}`;
        contentContainer.appendChild(idDiv);
        msgNode.dataset.msgIdInjected = "true";
      }
    }

    if (!msgNode.dataset.usrIdInjected) {
      const userId = getUserIdForMessage(msgNode);

      if (userId) {
        const headerContainer = msgNode.querySelector(
          ".flex.items-baseline.gap-2",
        );
        if (headerContainer) {
          const uidSpan = document.createElement("span");
          uidSpan.className = STYLE_CONFIG.userId;
          uidSpan.textContent = `usr: ${userId}`;

          // Fix: Let natural flexbox gap handle spacing, no extra CSS logic needed
          const timestamp = headerContainer.querySelector(
            ".text-muted-foreground",
          );
          if (timestamp) headerContainer.insertBefore(uidSpan, timestamp);
          else headerContainer.appendChild(uidSpan);

          msgNode.dataset.usrIdInjected = "true";
        }
      }
    }
  };

  const showDeveloperModal = (messageId, u = {}) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 9999999; justify-content: center; align-items: center;";

    const formatDate = (dateStr) =>
      dateStr ? new Date(dateStr).toLocaleString() : "Unable to fetch";

    const avatarSrc =
      u.avatar_url ||
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNTI1MjViIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTE5IDIxdi0yYTQgNCAwIDAgMC00LTRIOSBhNCA0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0Ii8+PC9zdmc+";
    const displayName = u.display_name || u.username || "Unknown User";
    const username = u.username ? `@${u.username}` : "n/a";
    const userId = u.id || "Unknown ID";
    const isPartial = !u.created_at && !u.bio;
    const bannerColor = u.banner_color || "var(--kloak-bg-box)";

    const primaryTheme = u.profile_theme_primary || "var(--kloak-bg-main)";
    const accentTheme = u.profile_theme_accent || "var(--kloak-icon-bg)";

    const bannerStyle = u.banner_url
      ? `background-image: url('${u.banner_url}'); background-size: cover; background-position: center;`
      : `background-color: ${bannerColor};`;

    overlay.innerHTML = `
        <div style="background: var(--kloak-bg-main); border: 1px solid var(--kloak-bg-btn); border-radius: 12px; width: 440px; overflow: hidden; font-family: sans-serif; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);">
        <div style="height: 100px; width: 100%; position: relative; ${bannerStyle}">
          <div style="position: absolute; bottom: -36px; left: 20px; padding: 4px; background: var(--kloak-bg-main); border-radius: 50%;">
            <img src="${avatarSrc}" style="width: 72px; height: 72px; border-radius: 50%; background: var(--kloak-bg-box); object-fit: cover; border: 1px solid var(--kloak-bg-btn);">
          </div>
        </div>

        <div style="padding: 48px 20px 20px 20px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
            <div style="min-width: 0; flex: 1;">
              <h2 style="margin: 0 0 2px 0; color: var(--kloak-text-main); font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayName}</h2>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: var(--kloak-text-sub); font-size: 13px;">${username}</span>
                <span style="color: var(--kloak-text-sub); font-size: 11px; background: var(--kloak-bg-btn); padding: 1px 6px; border-radius: 4px; border: 1px solid var(--kloak-bg-btn);">${u.pronouns || "None"}</span>
              </div>
            </div>
            ${u.status === "online" ? '<span style="color: var(--kloak-text-main); font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; background: var(--kloak-text-main); border-radius: 50%;"></span> Online</span>' : ""}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="grid-column: span 2; background: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn); border-radius: 8px; padding: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <label style="color: var(--kloak-text-sub); font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Message ID</label>
                <code style="color: var(--kloak-text-main); font-size: 11px; user-select: text;">${messageId || "N/A"}</code>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label style="color: var(--kloak-text-sub); font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">User ID</label>
                <code style="color: var(--kloak-text-main); font-size: 11px; user-select: text;">${userId}</code>
              </div>
            </div>

            <div style="background: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn); border-radius: 8px; padding: 10px;">
              <label style="color: var(--kloak-text-sub); font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Theme Primary</label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 14px; height: 14px; border-radius: 3px; background: ${primaryTheme}; border: 1px solid var(--kloak-bg-btn);"></div>
                <code style="color: var(--kloak-text-main); font-size: 11px;">${primaryTheme}</code>
              </div>
            </div>

            <div style="background: var(--kloak-bg-box); border: 1px solid var(--kloak-bg-btn); border-radius: 8px; padding: 10px;">
              <label style="color: var(--kloak-text-sub); font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Theme Accent</label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 14px; height: 14px; border-radius: 3px; background: ${accentTheme}; border: 1px solid var(--kloak-bg-btn);"></div>
                <code style="color: var(--kloak-text-main); font-size: 11px;">${accentTheme}</code>
              </div>
            </div>

            <div>
              <label style="color: var(--kloak-text-sub); font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block;">Last Seen</label>
              <div style="color: var(--kloak-text-main); font-size: 11px; margin-top: 4px;">${formatDate(u.last_seen)}</div>
            </div>

            <div>
              <label style="color: var(--kloak-text-sub); font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block;">Joined</label>
              <div style="color: var(--kloak-text-main); font-size: 11px; margin-top: 4px;">${formatDate(u.created_at)}</div>
            </div>

            <div style="grid-column: span 2;">
              <label style="color: var(--kloak-text-sub); font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Custom Status</label>
              <div style="color: var(--kloak-text-main); font-size: 12px; background: var(--kloak-bg-box); padding: 8px; border-radius: 6px; border: 1px solid var(--kloak-bg-btn);">${u.custom_status || "None set"}</div>
            </div>

            <div style="grid-column: span 2;">
              <label style="color: var(--kloak-text-sub); font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Bio</label>
              <div style="color: var(--kloak-text-main); font-size: 12px; line-height: 1.4; background: var(--kloak-bg-box); padding: 10px; border-radius: 6px; border: 1px solid var(--kloak-bg-btn); max-height: 80px; overflow-y: auto; white-space: pre-wrap;">${u.bio || "No biography available."}</div>
            </div>
            
            ${
              isPartial
                ? `
            <div style="grid-column: span 2; background: transparent; border: 1px solid var(--kloak-accent-warning); border-radius: 6px; padding: 8px; font-size: 11px; color: var(--kloak-accent-warning); display: flex; align-items: center; gap: 8px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
                Profile fetch failed. Using cached basic user data.
            </div>
            `
                : ""
            }
          </div>

          <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
            <button id="dev-modal-close" style="background: var(--kloak-bg-btn); color: var(--kloak-text-main); border: 1px solid var(--kloak-bg-btn); padding: 6px 20px; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px; transition: all 0.2s;">Close</button>
          </div>
        </div>
        </div>
        `;
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector("#dev-modal-close");
    closeBtn.onmouseenter = () =>
      (closeBtn.style.background = "var(--kloak-icon-bg)");
    closeBtn.onmouseleave = () =>
      (closeBtn.style.background = "var(--kloak-bg-btn)");

    closeBtn.onclick = () => overlay.remove();
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
  };

  const handleContextMenu = (e) => {
    const msgNode = e.target.closest(MESSAGE_SELECTOR);
    if (msgNode) {
      lastRightClickedMessageId = extractMsgId(msgNode.id);
    } else {
      lastRightClickedMessageId = null;
    }
  };

  const handleGlobalClick = (e) => {
    // Clear last right clicked ID if we left click anything
    // This prevents the context menu items from leaking into other Radix menus (like server menus)
    if (e.button !== 2) {
      lastRightClickedMessageId = null;
    }
  };

  const createContextMenuItem = (text, iconSvg, onClickAction) => {
    const item = document.createElement("div");
    item.className =
      "relative flex cursor-default select-none items-center rounded-lg px-3 py-2 text-sm outline-none transition-colors text-popover-foreground hover:bg-white/10 hover:text-foreground focus:bg-white/15 focus:text-foreground kloak-custom-context-btn";
    item.setAttribute("role", "menuitem");
    item.tabIndex = -1;
    item.innerHTML = `${iconSvg}${text}`;

    item.addEventListener("click", () => {
      onClickAction();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    return item;
  };

  const initAddon = () => {
    window.KloakAddons.registerAddon({
      id: ADDON_ID,
      name: "Developer Toolkit",
      description:
        "A powerful multitool for developers. View hidden user info and copy raw database IDs directly from the chat.",

      onEnable: () => {
        setupEventListener();

        setTimeout(
          () =>
            document.querySelectorAll(MESSAGE_SELECTOR).forEach(processMessage),
          1000,
        );

        domObserver = new MutationObserver((mutations) => {
          for (const mut of mutations) {
            for (const node of mut.addedNodes) {
              if (node.nodeType === 1) {
                if (
                  node.id &&
                  (node.id.startsWith("message-") ||
                    node.id.startsWith("dm-message-"))
                ) {
                  processMessage(node);
                } else if (node.querySelectorAll) {
                  node
                    .querySelectorAll(MESSAGE_SELECTOR)
                    .forEach(processMessage);
                }
              }
            }
          }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });

        document.addEventListener("contextmenu", handleContextMenu, true);
        document.addEventListener("pointerdown", handleGlobalClick, true);

        rightClickObserver = new MutationObserver((mutations) => {
          for (const mut of mutations) {
            for (const node of mut.addedNodes) {
              if (
                node.nodeType === 1 &&
                node.querySelector &&
                lastRightClickedMessageId
              ) {
                const menu =
                  node.querySelector("[data-radix-menu-content]") ||
                  (node.hasAttribute("data-radix-menu-content") ? node : null);

                if (menu && !menu.querySelector(".kloak-custom-context-btn")) {
                  // Capture the ID in a local variable for the closures
                  const currentMsgId = lastRightClickedMessageId;
                  const targetUserId = msgToUserMap.get(currentMsgId);

                  const msgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hash w-4 h-4 mr-2"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>`;
                  menu.appendChild(
                    createContextMenuItem("Copy Message ID", msgIcon, () =>
                      navigator.clipboard.writeText(currentMsgId),
                    ),
                  );

                  if (targetUserId) {
                    const userIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user w-4 h-4 mr-2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
                    menu.appendChild(
                      createContextMenuItem("Copy User ID", userIcon, () =>
                        navigator.clipboard.writeText(targetUserId),
                      ),
                    );
                  }

                  const devIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-terminal w-4 h-4 mr-2"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>`;
                  menu.appendChild(
                    createContextMenuItem(
                      "View User Info",
                      devIcon,
                      async () => {
                        if (!targetUserId) {
                          showDeveloperModal(currentMsgId, {
                            bio: "Error: Could not identify target User ID from network cache.",
                          });
                          return;
                        }

                        if (userProfileCache.has(targetUserId)) {
                          showDeveloperModal(
                            currentMsgId,
                            userProfileCache.get(targetUserId),
                          );
                          return;
                        }

                        const api = window.KloakAddonAPI;
                        if (!api || !api.isReady) {
                          showDeveloperModal(currentMsgId, {
                            id: targetUserId,
                            bio: `RPC Failed: API not ready.`,
                          });
                          return;
                        }

                        try {
                          const rawData = await api.rpc(
                            "get_user_profile_secure",
                            {
                              _target_user_id: targetUserId,
                              _requesting_user_id: api.userID,
                            },
                          );

                          const profile = Array.isArray(rawData)
                            ? rawData[0]
                            : rawData;

                          if (profile && profile.id) {
                            userProfileCache.set(targetUserId, profile);
                            showDeveloperModal(currentMsgId, profile);
                            return;
                          }
                        } catch (e) {
                          console.error(`[${ADDON_ID}] RPC Fetch error:`, e);
                        }

                        showDeveloperModal(currentMsgId, {
                          id: targetUserId,
                          bio: "User data not found in cache and RPC fetch failed.",
                        });
                      },
                    ),
                  );
                  // Clear the ID immediately after successfully populating a menu
                  // This prevents the same ID from being used for accidental subsequent menu opens
                  lastRightClickedMessageId = null;
                }
              }
            }
          }
        });
        rightClickObserver.observe(document.body, {
          childList: true,
          subtree: false,
        });
      },

      onDisable: () => {
        removeEventListener();
        if (domObserver) domObserver.disconnect();
        if (rightClickObserver) rightClickObserver.disconnect();
        document.removeEventListener("contextmenu", handleContextMenu, true);
        document.removeEventListener("pointerdown", handleGlobalClick, true);

        document
          .querySelectorAll(".kloak-injected-msg-id, .kloak-injected-user-id")
          .forEach((el) => el.remove());
        document.querySelectorAll(MESSAGE_SELECTOR).forEach((msg) => {
          delete msg.dataset.msgIdInjected;
          delete msg.dataset.usrIdInjected;
        });
      },

      renderSettings: (container) => {
        container.innerHTML = `
              <div class="addon-settings-item">
                <p style="margin: 0; color: var(--kloak-text-sub); font-size: 13px;">Configure your Developer Toolkit preferences.</p>
                <label class="kloak-checkbox-label">
                  <input type="checkbox" id="dt-show-ids" ${config.showIdsInChat ? "checked" : ""} style="width: 16px; height: 16px; accent-color: var(--kloak-text-main);">
                  <span>Show Message & User IDs in Chat</span>
                </label>
              </div>
  
              <button id="dt-save-btn" class="addon-btn-save">Save Changes</button>
              `;

        container
          .querySelector("#dt-save-btn")
          .addEventListener("click", () => {
            config.showIdsInChat =
              container.querySelector("#dt-show-ids").checked;

            if (window.electronAPI && window.electronAPI.saveAddonConfig) {
              window.electronAPI.saveAddonConfig({
                addonId: ADDON_ID,
                data: config,
              });
              const saveBtn = container.querySelector("#dt-save-btn");
              const originalText = saveBtn.textContent;
              saveBtn.textContent = "✓ Saved to config";
              setTimeout(() => (saveBtn.textContent = originalText), 2000);
            }

            if (config.showIdsInChat) {
              document.querySelectorAll(MESSAGE_SELECTOR).forEach((n) => {
                delete n.dataset.msgIdInjected;
                delete n.dataset.usrIdInjected;
                processMessage(n);
              });
            } else {
              document
                .querySelectorAll(
                  ".kloak-injected-msg-id, .kloak-injected-user-id",
                )
                .forEach((el) => el.remove());
              document.querySelectorAll(MESSAGE_SELECTOR).forEach((msg) => {
                delete msg.dataset.msgIdInjected;
                delete msg.dataset.usrIdInjected;
              });
            }
          });
      },
    });
  };

  if (window.KloakAddonAPI) {
    window.KloakAddonAPI.onReady(() => {
      initAddon();
    });
  } else {
    initAddon();
  }
})();
