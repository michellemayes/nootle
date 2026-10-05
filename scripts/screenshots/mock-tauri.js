/**
 * Minimal stand-in for the Tauri IPC bridge, injected into the page before the
 * app boots. It answers `invoke()` calls from `window.__NOOTLE_FIXTURES__` so
 * the real React app renders against demo data in a plain browser.
 *
 * Loaded by capture.mjs via `addInitScript` — it runs in the browser, not Node.
 */
(() => {
  const fixtures = window.__NOOTLE_FIXTURES__ || {};
  const callbacks = new Map();
  const listeners = new Map(); // event name -> Set of callback ids
  let nextId = 1;

  function resolve(cmd, args) {
    // Conversation messages are keyed by conversation id.
    if (cmd === "list_chat_messages") {
      const byId = fixtures.list_chat_messages || {};
      return byId[args?.conversationId] || [];
    }
    // Mirror the backend's title search so the palette and library filter.
    if (cmd === "list_meetings" && args?.search) {
      const q = args.search.toLowerCase();
      return (fixtures.list_meetings || []).filter((m) => m.title.toLowerCase().includes(q));
    }
    // Honour the Insights filters so counts (e.g. open action items) are real.
    if (cmd === "get_all_insights") {
      return (fixtures.get_all_insights || []).filter(
        (i) =>
          (!args?.insightType || i.type === args.insightType) &&
          (!args?.status || i.status === args.status || i.status === null),
      );
    }
    // A live recording's input levels, wobbling like speech for the meter.
    if (cmd === "recording_status") {
      const t = Date.now() / 180;
      return {
        meeting_id: "live",
        paused: false,
        elapsed_ms: 10_000,
        mic_level: 0.03 + 0.025 * Math.sin(t),
        system_level: 0.02 + 0.015 * Math.cos(t * 1.3),
      };
    }
    if (cmd in fixtures) return fixtures[cmd];
    if (!cmd.startsWith("plugin:")) {
      console.warn(`[mock-tauri] no fixture for "${cmd}" — returning null`);
    }
    return null;
  }

  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    transformCallback(callback, once = false) {
      const id = nextId++;
      callbacks.set(id, { callback, once });
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    runCallback(id, payload) {
      const entry = callbacks.get(id);
      if (!entry) return;
      if (entry.once) callbacks.delete(id);
      entry.callback(payload);
    },
    convertFileSrc(filePath) {
      return filePath;
    },
    async invoke(cmd, args) {
      if (cmd === "plugin:event|listen") {
        const set = listeners.get(args.event) || new Set();
        set.add(args.handler);
        listeners.set(args.event, set);
        return args.handler;
      }
      if (cmd === "plugin:event|unlisten") {
        listeners.get(args.event)?.delete(args.eventId);
        return null;
      }
      return resolve(cmd, args);
    },
  };

  // The event plugin bypasses `invoke` when tearing a listener down.
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener(event, eventId) {
      listeners.get(event)?.delete(eventId);
    },
  };

  /** Fires a backend event at every registered listener. */
  window.__NOOTLE_EMIT__ = (event, payload) => {
    for (const id of listeners.get(event) || []) {
      window.__TAURI_INTERNALS__.runCallback(id, { event, id, payload });
    }
  };
})();
