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
    // Transcripts are keyed by meeting id; the live recording's arrive as events.
    if (cmd === "get_transcript") {
      const byId = fixtures.get_transcript || {};
      return byId[args?.meetingId] || [];
    }
    // Annotations are keyed by meeting id, and can be added, resolved, or deleted.
    const annotations = fixtures.list_meeting_annotations || {};
    if (cmd === "list_meeting_annotations") return annotations[args?.meetingId] || [];
    // A translation is saved once made, so the menu lists it afterwards.
    if (cmd === "translate_meeting" && fixtures.translate_meeting) {
      const done = { ...fixtures.translate_meeting, language: args.language };
      fixtures.list_meeting_translations = [
        ...(fixtures.list_meeting_translations || []).filter((t) => t.language !== args.language),
        done,
      ];
      return done;
    }
    if (cmd === "highlight_transcript") {
      const added = {
        id: `hl-${nextId++}`,
        meeting_id: args.meetingId,
        start_ms: args.startMs,
        end_ms: args.endMs,
        kind: "highlight",
        body: args.text.trim(),
        author: "You",
        by_user: true,
        created_at: new Date().toISOString(),
        resolved_at: null,
      };
      fixtures.list_meeting_annotations = annotations;
      annotations[args.meetingId] = [...(annotations[args.meetingId] || []), added];
      return added;
    }
    if (cmd === "resolve_meeting_annotation" || cmd === "delete_meeting_annotation") {
      for (const [meetingId, list] of Object.entries(annotations)) {
        annotations[meetingId] =
          cmd === "delete_meeting_annotation"
            ? list.filter((a) => a.id !== args.id)
            : list.map((a) =>
                a.id === args.id ? { ...a, resolved_at: args.resolved ? new Date().toISOString() : null } : a,
              );
      }
      return null;
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
    // Commitments filtered like the backend does: by owner (or first name) and status.
    if (cmd === "list_commitments") {
      const owner = args?.owner?.toLowerCase();
      return (fixtures.list_commitments || []).filter(
        (c) =>
          (!owner || c.owner.toLowerCase() === owner || c.owner.toLowerCase().split(" ")[0] === owner) &&
          (!args?.status || c.status === args.status),
      );
    }
    if (cmd === "update_commitment") {
      const found = (fixtures.list_commitments || []).find((c) => c.id === args?.id);
      return found && { ...found, status: args.status };
    }
    if (cmd === "get_meeting_followups") {
      return (fixtures.get_meeting_followups || {})[args?.meetingId] || [];
    }
    // Each commitment is brought up once per recording, as the backend does.
    if (cmd === "live_commitment_reminders") {
      return (fixtures.live_commitment_reminders || []).filter(
        (card) => !(args?.reminded || []).includes(card.commitment_id),
      );
    }
    // Settings by key, when the demo sets any.
    if (cmd === "get_app_setting" && fixtures.app_settings) {
      return fixtures.app_settings[args?.key] ?? null;
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
    // Settings are keyed by name; unlisted ones are unset.
    if (cmd === "get_app_setting") {
      return (fixtures.get_app_setting || {})[args?.key] ?? null;
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
