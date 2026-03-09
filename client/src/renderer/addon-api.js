const SUPABASE_URL = "https://foquucurnwpqcvgqukpz.supabase.co";
const SUPABASE_RPC_URL = `${SUPABASE_URL}/rest/v1/rpc`;
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;
const SUPABASE_STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public`;

// Cache limits (matching Kloak's own constants from messageStore)
const MAX_CACHED_CHANNELS = 12;
const MAX_MESSAGES_PER_CHANNEL = 300;
const EMOJI_CACHE_TTL = 60000; // 60s
const USER_CACHE_TTL = 300000; // 5min

class InvisicAddonAPI {
  constructor() {
    // Auth state
    this.userID = null;
    this.xHash = null;
    this.apiKey = null;
    this.authToken = null;
    this.userProfile = null;

    // Navigation state
    this.currentServerID = null;
    this.currentServerName = null;
    this.currentChannelID = null;
    this.currentDMStatus = false;
    this.currentDMID = null;

    // Internal caches
    this._serverMap = new Map(); // serverId -> name
    this._messageCache = new Map(); // channelId -> { messages: Map<id, msg>, lastFetched }
    this._emojiCache = new Map(); // serverId -> { emojis: [], lastFetched }
    this._userCache = new Map(); // userId -> { user, fetchedAt }
    this._conversationCache = new Map(); // convId -> conversation
    this._serverDataCache = new Map(); // serverId -> { members, roles, lastFetched }

    // Ready state
    this._readyCallbacks = [];
    this.isReady = false;
    this._profilePromise = null;

    // Event bus
    this._eventListeners = new Map();

    // Dedup map for in-flight fetches
    this._pendingFetches = new Map();

    // Store original fetch BEFORE anything can patch it
    this._originalFetch = window.fetch.bind(window);

    // Per-user instancing: resolve active user ID early for config routing
    this._activeUserId = null;
    this._activeUserIdPromise = window.electronAPI?.getActiveUserId?.() || Promise.resolve(null);
    this._activeUserIdPromise.then((id) => {
      if (id) this._activeUserId = id;
    });

    this._log("Initialising...");

    // --- Public API namespaces ---

    this.settings = {
      get: async (addonId) => {
        if (window.electronAPI && window.electronAPI.getAddonConfig) {
          const userId = this._activeUserId || await this._activeUserIdPromise;
          return await window.electronAPI.getAddonConfig(addonId, userId);
        }
        return {};
      },
      set: async (addonId, data) => {
        if (window.electronAPI && window.electronAPI.saveAddonConfig) {
          const userId = this._activeUserId || await this._activeUserIdPromise;
          window.electronAPI.saveAddonConfig({ addonId, data, userId });
        }
      },
    };

    this.fs = {
      read: async (addonId, filePath) => {
        const userId = this._activeUserId || await this._activeUserIdPromise;
        return await window.electronAPI.readAddonFile(addonId, filePath, { userId });
      },
      write: async (addonId, filePath, data) => {
        const userId = this._activeUserId || await this._activeUserIdPromise;
        return await window.electronAPI.writeAddonFile(addonId, filePath, data, { userId });
      },
      list: async (addonId, subDir = "") => {
        const userId = this._activeUserId || await this._activeUserIdPromise;
        return await window.electronAPI.listAddonFiles(addonId, subDir, { userId });
      },
      delete: async (addonId, filePath) => {
        const userId = this._activeUserId || await this._activeUserIdPromise;
        return await window.electronAPI.deleteAddonFile(addonId, filePath, { userId });
      },
      exists: async (addonId, filePath) => {
        const userId = this._activeUserId || await this._activeUserIdPromise;
        return await window.electronAPI.addonFileExists(addonId, filePath, { userId });
      },
      // Shared file storage (not per-user — for ML models, shared assets, etc.)
      shared: {
        read: async (addonId, filePath) => {
          return await window.electronAPI.readAddonFile(addonId, filePath, { shared: true });
        },
        write: async (addonId, filePath, data) => {
          return await window.electronAPI.writeAddonFile(addonId, filePath, data, { shared: true });
        },
        list: async (addonId, subDir = "") => {
          return await window.electronAPI.listAddonFiles(addonId, subDir, { shared: true });
        },
        delete: async (addonId, filePath) => {
          return await window.electronAPI.deleteAddonFile(addonId, filePath, { shared: true });
        },
        exists: async (addonId, filePath) => {
          return await window.electronAPI.addonFileExists(addonId, filePath, { shared: true });
        },
      },
    };

    // --- Events namespace ---
    this.events = {
      on: (event, callback) => {
        if (typeof callback !== "function") return;
        if (!this._eventListeners.has(event)) {
          this._eventListeners.set(event, new Set());
        }
        this._eventListeners.get(event).add(callback);
      },
      off: (event, callback) => {
        const listeners = this._eventListeners.get(event);
        if (listeners) listeners.delete(callback);
      },
      once: (event, callback) => {
        if (typeof callback !== "function") return;
        const wrapper = (data) => {
          this.events.off(event, wrapper);
          callback(data);
        };
        this.events.on(event, wrapper);
      },
    };

    // --- RPC wrapper ---
    this.rpc = async (functionName, params = {}) => {
      if (!this.apiKey || !this.authToken || !this.xHash) {
        throw new Error(
          "InvisicAddonAPI: Not authenticated. Use onReady() first.",
        );
      }
      const response = await this._originalFetch(
        `${SUPABASE_RPC_URL}/${functionName}`,
        {
          method: "POST",
          headers: this._buildHeaders(),
          body: JSON.stringify(params),
        },
      );
      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `RPC "${functionName}" failed (${response.status}): ${errText}`,
        );
      }
      return response.json();
    };

    // --- Messages namespace ---
    this.messages = {
      getCached: (channelId) => {
        const cache = this._messageCache.get(channelId);
        if (!cache) return [];
        return Array.from(cache.messages.values()).sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime(),
        );
      },

      getById: (messageId) => {
        for (const cache of this._messageCache.values()) {
          const msg = cache.messages.get(messageId);
          if (msg) return msg;
        }
        return null;
      },

      onMessage: (cb) => this.events.on("messageReceived", cb),
      offMessage: (cb) => this.events.off("messageReceived", cb),

      onEdit: (cb) => this.events.on("messageEdited", cb),
      offEdit: (cb) => this.events.off("messageEdited", cb),

      onDelete: (cb) => this.events.on("messageDeleted", cb),
      offDelete: (cb) => this.events.off("messageDeleted", cb),

      addReaction: async (messageId, emoji) => {
        const rpcName = this.currentDMStatus
          ? "add_dm_reaction"
          : "add_reaction";
        return this.rpc(rpcName, {
          _message_id: messageId,
          _user_id: this.userID,
          _emoji: emoji,
        });
      },

      removeReaction: async (messageId, emoji) => {
        const rpcName = this.currentDMStatus
          ? "remove_dm_reaction"
          : "remove_reaction";
        return this.rpc(rpcName, {
          _message_id: messageId,
          _user_id: this.userID,
          _emoji: emoji,
        });
      },
    };

    // --- Servers namespace ---
    this.servers = {
      getAll: () =>
        Array.from(this._serverMap.entries()).map(([id, name]) => ({
          id,
          name,
        })),

      getCurrent: () => ({
        id: this.currentServerID,
        name: this.currentServerName,
      }),

      onChange: (cb) => this.events.on("serverChange", cb),
      offChange: (cb) => this.events.off("serverChange", cb),

      getMembers: (serverId) => {
        const data = this._serverDataCache.get(serverId);
        return data ? data.members || [] : [];
      },

      getRoles: (serverId) => {
        const data = this._serverDataCache.get(serverId);
        return data ? data.roles || [] : [];
      },
    };

    // --- Channels namespace ---
    this.channels = {
      getCurrentId: () => this.currentChannelID,
      onChange: (cb) => this.events.on("channelChange", cb),
      offChange: (cb) => this.events.off("channelChange", cb),
    };

    // --- Emojis namespace ---
    this.emojis = {
      getForServer: async (serverId) => {
        const cached = this._emojiCache.get(serverId);
        if (cached && Date.now() - cached.lastFetched < EMOJI_CACHE_TTL) {
          return cached.emojis;
        }
        const emojis = await this._fetchServerEmojis(serverId);
        this._emojiCache.set(serverId, {
          emojis,
          lastFetched: Date.now(),
        });
        this._emit("serverEmojisLoaded", { serverId, emojis });
        return emojis;
      },

      getCurrent: async () => {
        if (!this.currentServerID) return [];
        return this.emojis.getForServer(this.currentServerID);
      },

      getImageUrl: (filePath) =>
        `${SUPABASE_STORAGE_URL}/server-emojis/${filePath}`,

      onLoad: (cb) => this.events.on("serverEmojisLoaded", cb),
      offLoad: (cb) => this.events.off("serverEmojisLoaded", cb),
    };

    // --- Users namespace ---
    this.users = {
      getCached: (userId) => {
        const entry = this._userCache.get(userId);
        return entry ? entry.user : null;
      },

      fetch: async (userId) => {
        const cached = this._userCache.get(userId);
        if (cached && Date.now() - cached.fetchedAt < USER_CACHE_TTL) {
          return cached.user;
        }
        const data = await this._deduplicatedFetch(
          `user:${userId}`,
          () => this.rpc("get_user_by_id", { _user_id: userId }),
        );
        const user = Array.isArray(data) ? data[0] : data;
        if (user) {
          this._userCache.set(userId, { user, fetchedAt: Date.now() });
          this._emit("userProfileFetched", { userId, user });
        }
        return user || null;
      },

      getSelf: () => this.userProfile,
    };

    // --- Conversations namespace ---
    this.conversations = {
      getAll: () => Array.from(this._conversationCache.values()),

      fetch: async () => {
        const data = await this.rpc("get_user_dm_conversations", {
          _user_id: this.userID,
        });
        if (Array.isArray(data)) {
          data.forEach((conv) => {
            const id = conv.conversation?.id || conv.id;
            if (id) this._conversationCache.set(id, conv);
          });
          this._emit("dmConversationsLoaded", { conversations: data });
        }
        return data;
      },

      onLoad: (cb) => this.events.on("dmConversationsLoaded", cb),
      offLoad: (cb) => this.events.off("dmConversationsLoaded", cb),
    };

    // --- UI namespace ---
    this.ui = {
      getTheme: () => {
        try {
          const stored = localStorage.getItem("kloak-ui");
          if (stored) {
            const parsed = JSON.parse(stored);
            return parsed.state?.theme || "default";
          }
        } catch (e) {}
        return "default";
      },

      onThemeChange: (cb) => this.events.on("themeChange", cb),
      offThemeChange: (cb) => this.events.off("themeChange", cb),
    };

    // --- Presence namespace ---
    this.presence = {
      suppressTyping: false,
    };

    // Expose original fetch for addons that truly need raw access
    this.originalFetch = this._originalFetch;

    // Initialize
    this._watchLocalStorage();
    this._setupInterceptor();
  }

  // --- Logging helper ---

  _log(msg) {
    if (window.electronAPI && window.electronAPI.log) {
      window.electronAPI.log(`Invisic Addon API: ${msg}`);
    }
  }

  // --- Event bus internal ---

  _emit(event, data) {
    const listeners = this._eventListeners.get(event);
    if (!listeners) return;
    for (const cb of listeners) {
      try {
        cb(data);
      } catch (e) {
        console.error(`[Invisic Addon API] Event handler error (${event}):`, e);
      }
    }
  }

  // --- Auth helpers ---

  _buildHeaders() {
    return {
      "Content-Type": "application/json",
      apikey: this.apiKey,
      Authorization: this.authToken,
      "X-Key-Hash": this.xHash,
    };
  }

  _extractHeaders(options) {
    if (!options || !options.headers) return {};
    const h = options.headers;
    if (h instanceof Headers) {
      return {
        xHash: h.get("X-Key-Hash") || h.get("x-key-hash"),
        apiKey: h.get("apikey") || h.get("apiKey"),
        authToken: h.get("Authorization") || h.get("authorization"),
      };
    }
    return {
      xHash: h["X-Key-Hash"] || h["x-key-hash"],
      apiKey: h["apikey"] || h["apiKey"],
      authToken: h["Authorization"] || h["authorization"],
    };
  }

  _updateAuth(headers) {
    // Always update — tokens can refresh
    if (headers.apiKey) this.apiKey = headers.apiKey;
    if (headers.authToken) this.authToken = headers.authToken;
    if (headers.xHash) this.xHash = headers.xHash;
  }

  // --- Dedup helper ---

  async _deduplicatedFetch(key, fetchFn) {
    if (this._pendingFetches.has(key)) {
      return this._pendingFetches.get(key);
    }
    const promise = fetchFn().finally(() => this._pendingFetches.delete(key));
    this._pendingFetches.set(key, promise);
    return promise;
  }

  // --- Ready system ---

  onReady(callback) {
    if (typeof callback !== "function") return;
    if (this.isReady) {
      callback(this);
    } else {
      this._readyCallbacks.push(callback);
    }
  }

  _fireReady() {
    if (this.isReady) return;
    if (!this.userProfile || !this.userID) return;

    this.isReady = true;

    console.log("[Invisic Addon API] Ready:", {
      userID: this.userID,
      profileLoaded: true,
      currentServerID: this.currentServerID,
      currentDMStatus: this.currentDMStatus,
    });
    this._log(
      `Ready - UserID: ${this.userID}, server: ${this.currentServerName} (${this.currentServerID}), dm: ${this.currentDMStatus}`,
    );

    this._readyCallbacks.forEach((cb) => {
      try {
        cb(this);
      } catch (e) {
        console.error("[Invisic Addon API] onReady callback error:", e);
      }
    });
    this._readyCallbacks = [];
    this._emit("ready", this);
  }

  async _fetchUserProfile() {
    if (!this.xHash || !this.apiKey || !this.authToken) return;
    if (this._profilePromise) return this._profilePromise;

    this._profilePromise = (async () => {
      try {
        this._log("Fetching user profile...");
        const response = await this._originalFetch(
          `${SUPABASE_RPC_URL}/login_user`,
          {
            method: "POST",
            headers: this._buildHeaders(),
            body: JSON.stringify({ _key_hash: this.xHash }),
          },
        );

        if (response.ok) {
          const bodyText = await response.text();
          if (bodyText) {
            const profileData = JSON.parse(bodyText);
            if (profileData && profileData.id) {
              this.userProfile = profileData;
              this.userID = profileData.id;
              this._fireReady();
            }
          }
        } else {
          const errorText = await response
            .text()
            .catch(() => "Unknown error");
          console.error("Invisic Addon API: Profile fetch failed", errorText);
        }
      } catch (e) {
        this._log(`ERROR fetchUserProfile: ${e.message}`);
      } finally {
        this._profilePromise = null;
      }
    })();

    return this._profilePromise;
  }

  // --- Emoji fetching ---

  async _fetchServerEmojis(serverId) {
    try {
      const response = await this._originalFetch(
        `${SUPABASE_REST_URL}/server_emojis?server_id=eq.${serverId}&select=id,name,file_path`,
        {
          method: "GET",
          headers: this._buildHeaders(),
        },
      );
      if (response.ok) {
        const emojis = await response.json();
        return Array.isArray(emojis)
          ? emojis.map((e) => ({
              id: e.id,
              name: e.name,
              file_path: e.file_path,
              url: this.emojis.getImageUrl(e.file_path),
            }))
          : [];
      }
    } catch (e) {
      console.error(
        `[Invisic Addon API] Failed to fetch emojis for server ${serverId}:`,
        e,
      );
    }
    return [];
  }

  // --- localStorage watcher with events ---

  _watchLocalStorage() {
    this.currentServerID = localStorage.getItem("kloak-current-server-id");
    this.currentChannelID = localStorage.getItem("kloak-current-channel-id");
    this.currentDMID = localStorage.getItem("kloak-current-dm-id");
    this.currentDMStatus =
      localStorage.getItem("kloak-dm-view-active") === "true";
    if (this.currentServerID) {
      this.currentServerName =
        this._serverMap.get(this.currentServerID) || "Unknown Server";
    }

    const self = this;
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      orig(key, value);

      switch (key) {
        case "kloak-current-server-id": {
          const prev = self.currentServerID;
          self.currentServerID = value || null;
          self.currentServerName =
            self._serverMap.get(value) || "Unknown Server";
          if (value !== prev) {
            self._emit("serverChange", {
              serverID: self.currentServerID,
              serverName: self.currentServerName,
              previousServerID: prev,
            });
          }
          break;
        }
        case "kloak-current-channel-id": {
          const prev = self.currentChannelID;
          self.currentChannelID = value || null;
          if (value !== prev) {
            self._emit("channelChange", {
              channelID: self.currentChannelID,
              previousChannelID: prev,
            });
          }
          break;
        }
        case "kloak-dm-view-active": {
          const prev = self.currentDMStatus;
          self.currentDMStatus = value === "true";
          if (self.currentDMStatus !== prev) {
            self._emit("dmStatusChange", {
              isDM: self.currentDMStatus,
              dmID: self.currentDMID,
            });
          }
          break;
        }
        case "kloak-current-dm-id": {
          const prev = self.currentDMID;
          self.currentDMID = value || null;
          if (value !== prev) {
            self._emit("dmChange", {
              dmID: self.currentDMID,
              previousDMID: prev,
            });
          }
          break;
        }
        case "kloak-ui": {
          try {
            const parsed = JSON.parse(value);
            if (parsed.state?.theme) {
              self._emit("themeChange", { theme: parsed.state.theme });
            }
          } catch (e) {}
          break;
        }
      }
    };
  }

  // --- Central fetch interceptor ---

  _setupInterceptor() {
    const self = this;

    // Response route table — only clone responses for matched URL patterns
    const responseRoutes = [
      { match: "login_user", handler: "_handleLoginUser" },
      { match: "get_user_servers", handler: "_handleGetUserServers" },
      {
        match: "get_channel_messages_secure",
        handler: "_handleChannelMessages",
      },
      {
        match: "get_channel_bootstrap_secure",
        handler: "_handleChannelBootstrap",
      },
      { match: "get_dm_messages", handler: "_handleDmMessages" },
      {
        match: "get_user_dm_conversations",
        handler: "_handleDmConversations",
      },
      { match: "server_emojis", handler: "_handleServerEmojis" },
      { match: "get_server_roles_secure", handler: "_handleRoles" },
      { match: "get_role_permissions", handler: "_handlePermissions" },
      { match: "get_server_members", handler: "_handleMembers" },
      { match: "get_user_profile_secure", handler: "_handleUserProfile" },
      { match: "get_user_by_id", handler: "_handleUserById" },
      { match: "update-user-profile", handler: "_handleProfileUpdate" },
    ];

    // Request interception routes (pre-send, can block)
    // Mutation routes — capture request body for event data
    const mutationRoutes = [
      { match: "send_message", handler: "_handleSendMessage" },
      { match: "edit_message", handler: "_handleEditMessage" },
      { match: "delete_message", handler: "_handleDeleteMessage" },
      { match: "send_dm", handler: "_handleSendMessage" },
      { match: "edit_dm", handler: "_handleEditMessage" },
      { match: "delete_dm", handler: "_handleDeleteMessage" },
      { match: "add_reaction", handler: "_handleReactionAdd" },
      { match: "add_dm_reaction", handler: "_handleReactionAdd" },
      { match: "remove_reaction", handler: "_handleReactionRemove" },
      { match: "remove_dm_reaction", handler: "_handleReactionRemove" },
    ];

    window.fetch = async function (...args) {
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] && args[0].url
            ? args[0].url
            : "";
      const options = args[1] || {};

      // --- Extract and update auth headers from every request ---
      try {
        const headers = self._extractHeaders(options);
        self._updateAuth(headers);
      } catch (e) {}

      // Trigger profile fetch if we have auth but no profile yet
      if (
        self.xHash &&
        self.apiKey &&
        self.authToken &&
        !self.userProfile &&
        !self._profilePromise &&
        !url.includes("login_user")
      ) {
        self._fetchUserProfile();
      }

      // --- Pre-send interception ---

      // Block typing requests if suppressTyping is enabled
      if (self.presence.suppressTyping && url.includes("broadcast-typing")) {
        return new Response(null, { status: 204 });
      }

      // Capture request body for mutations (before sending)
      let requestBody = null;
      const matchedMutation = mutationRoutes.find((r) => url.includes(r.match));
      if (matchedMutation && options.body) {
        try {
          requestBody =
            typeof options.body === "string"
              ? options.body
              : JSON.stringify(options.body);
        } catch (e) {}
      }

      // --- Send the actual request ---
      const response = await self._originalFetch.apply(this, args);

      // --- Post-response processing ---

      // Process mutation events (using request body, not response)
      if (matchedMutation && requestBody && response.ok) {
        try {
          self[matchedMutation.handler](url, requestBody, response);
        } catch (e) {
          console.error(
            `[Invisic Addon API] Mutation handler error (${matchedMutation.match}):`,
            e,
          );
        }
      }

      // Process response routes (clone response to read without consuming)
      if (response.ok) {
        const matchedRoute = responseRoutes.find((r) =>
          url.includes(r.match),
        );
        if (matchedRoute) {
          try {
            const clone = response.clone();
            // Process async — don't block the caller
            clone
              .text()
              .then((bodyText) => {
                if (!bodyText) return;
                try {
                  const data = JSON.parse(bodyText);
                  self[matchedRoute.handler](url, data, options);
                } catch (e) {}
              })
              .catch(() => {});
          } catch (e) {}
        }
      }

      return response;
    };
  }

  // --- Response handlers ---

  _handleLoginUser(url, data, options) {
    if (data && data.id) {
      this.userProfile = data;
      this.userID = data.id;
      // Update per-user instancing state
      this._activeUserId = data.id;
      if (window.electronAPI?.setActiveUserId) {
        window.electronAPI.setActiveUserId(data.id);
      }
      // Also update auth from the request that carried this
      const headers = this._extractHeaders(options);
      this._updateAuth(headers);
      this._fireReady();
    }
  }

  _handleGetUserServers(url, data) {
    if (Array.isArray(data)) {
      data.forEach((srv) => {
        if (srv.id && srv.name) this._serverMap.set(srv.id, srv.name);
      });
      if (this.currentServerID && this._serverMap.has(this.currentServerID)) {
        this.currentServerName = this._serverMap.get(this.currentServerID);
      }
    }
  }

  _handleChannelMessages(url, data) {
    if (!Array.isArray(data)) return;
    // Extract channel ID from the messages themselves
    const channelId = data[0]?.channel_id;
    if (!channelId) return;
    this._cacheMessages(channelId, data);
    this._emit("messagesLoaded", { channelId, messages: data });
  }

  _handleChannelBootstrap(url, data) {
    // Bootstrap returns { messages: [...], ... } or just an array
    const messages = Array.isArray(data)
      ? data
      : data?.messages || data?.data;
    if (!Array.isArray(messages) || messages.length === 0) return;
    const channelId = messages[0]?.channel_id;
    if (!channelId) return;
    this._cacheMessages(channelId, messages);
    this._emit("messagesLoaded", { channelId, messages });
  }

  _handleDmMessages(url, data) {
    if (!Array.isArray(data) || data.length === 0) return;
    const convId = data[0]?.conversation_id;
    if (!convId) return;
    // Cache DM messages under the conversation ID
    this._cacheMessages(convId, data);
    this._emit("messagesLoaded", { channelId: convId, messages: data });
  }

  _handleDmConversations(url, data) {
    if (!Array.isArray(data)) return;
    data.forEach((conv) => {
      const id = conv.conversation?.id || conv.id;
      if (id) this._conversationCache.set(id, conv);
    });
    this._emit("dmConversationsLoaded", { conversations: data });
  }

  _handleServerEmojis(url, data) {
    if (!Array.isArray(data) || data.length === 0) return;
    const serverId = data[0]?.server_id;
    if (!serverId) return;
    const emojis = data.map((e) => ({
      id: e.id,
      name: e.name,
      file_path: e.file_path,
      url: this.emojis.getImageUrl(e.file_path),
    }));
    this._emojiCache.set(serverId, { emojis, lastFetched: Date.now() });
    this._emit("serverEmojisLoaded", { serverId, emojis });
  }

  _handleRoles(url, data) {
    if (!Array.isArray(data) || data.length === 0) return;
    const serverId = data[0]?.server_id;
    if (!serverId) return;
    const existing = this._serverDataCache.get(serverId) || {};
    this._serverDataCache.set(serverId, {
      ...existing,
      roles: data,
      lastFetched: Date.now(),
    });
    this._emit("rolesLoaded", { serverId, roles: data });
  }

  _handlePermissions(url, data) {
    // Permissions are associated with a server but don't carry server_id directly
    // They're fetched after roles, so cache update is best-effort
    if (Array.isArray(data) && data.length > 0) {
      this._emit("permissionsLoaded", { permissions: data });
    }
  }

  _handleMembers(url, data) {
    if (!Array.isArray(data) || data.length === 0) return;
    const serverId = data[0]?.server_id;
    if (!serverId) return;
    const existing = this._serverDataCache.get(serverId) || {};
    this._serverDataCache.set(serverId, {
      ...existing,
      members: data,
      lastFetched: Date.now(),
    });
    this._emit("membersLoaded", { serverId, members: data });
  }

  _handleUserProfile(url, data) {
    const user = Array.isArray(data) ? data[0] : data;
    if (user && user.id) {
      this._userCache.set(user.id, { user, fetchedAt: Date.now() });
      this._emit("userProfileFetched", { userId: user.id, user });
    }
  }

  _handleUserById(url, data) {
    this._handleUserProfile(url, data);
  }

  _handleProfileUpdate(url, data) {
    // Profile was updated — re-fetch to get fresh data
    setTimeout(() => this._fetchUserProfile(), 500);
  }

  // --- Mutation handlers (use request body, not response) ---

  _handleSendMessage(url, requestBody) {
    try {
      const body = JSON.parse(requestBody);
      this._emit("messageReceived", {
        channelId: body._channel_id || body._conversation_id,
        userId: body._user_id,
        content: body._content,
        replyToId: body._reply_to_id || null,
      });
    } catch (e) {}
  }

  _handleEditMessage(url, requestBody) {
    try {
      const body = JSON.parse(requestBody);
      const messageId = body._message_id;
      // Try to find previous content from cache
      const existing = this.messages.getById(messageId);
      const previousContent = existing ? existing.content : null;

      // Update cache
      if (existing) {
        existing.content = body._content;
        existing.is_edited = true;
      }

      this._emit("messageEdited", {
        messageId,
        previousContent,
        newContent: body._content,
        editedBy: body._user_id,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {}
  }

  _handleDeleteMessage(url, requestBody) {
    try {
      const body = JSON.parse(requestBody);
      const messageId = body._message_id;
      const existing = this.messages.getById(messageId);

      // Snapshot before removal
      this._emit("messageDeleted", {
        messageId,
        message: existing ? { ...existing } : null,
        deletedBy: body._user_id,
        timestamp: new Date().toISOString(),
      });

      // Remove from cache
      if (existing) {
        for (const cache of this._messageCache.values()) {
          if (cache.messages.has(messageId)) {
            cache.messages.delete(messageId);
            break;
          }
        }
      }
    } catch (e) {}
  }

  _handleReactionAdd(url, requestBody) {
    try {
      const body = JSON.parse(requestBody);
      this._emit("reactionAdded", {
        messageId: body._message_id,
        emoji: body._emoji,
        userId: body._user_id,
      });
    } catch (e) {}
  }

  _handleReactionRemove(url, requestBody) {
    try {
      const body = JSON.parse(requestBody);
      this._emit("reactionRemoved", {
        messageId: body._message_id,
        emoji: body._emoji,
        userId: body._user_id,
      });
    } catch (e) {}
  }

  // --- Message cache management ---

  _cacheMessages(channelId, messages) {
    if (!this._messageCache.has(channelId)) {
      // Evict oldest channel if at capacity
      if (this._messageCache.size >= MAX_CACHED_CHANNELS) {
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [key, val] of this._messageCache) {
          if (val.lastFetched < oldestTime) {
            oldestTime = val.lastFetched;
            oldestKey = key;
          }
        }
        if (oldestKey) this._messageCache.delete(oldestKey);
      }
      this._messageCache.set(channelId, {
        messages: new Map(),
        lastFetched: Date.now(),
      });
    }

    const cache = this._messageCache.get(channelId);
    cache.lastFetched = Date.now();

    for (const msg of messages) {
      if (msg.id) cache.messages.set(msg.id, msg);
    }

    // Also populate user cache from message author data
    for (const msg of messages) {
      const user = msg.user || msg.sender;
      if (user && user.id) {
        this._userCache.set(user.id, { user, fetchedAt: Date.now() });
      }
    }

    // Trim to max per channel
    if (cache.messages.size > MAX_MESSAGES_PER_CHANNEL) {
      const sorted = Array.from(cache.messages.entries()).sort(
        (a, b) =>
          new Date(a[1].created_at).getTime() -
          new Date(b[1].created_at).getTime(),
      );
      const excess = sorted.length - MAX_MESSAGES_PER_CHANNEL;
      for (let i = 0; i < excess; i++) {
        cache.messages.delete(sorted[i][0]);
      }
    }
  }
}

window.InvisicAddonAPI = new InvisicAddonAPI();
