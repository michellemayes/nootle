import { invoke } from "@tauri-apps/api/core";

// Importing this sends the window's uncaught errors to the app, which
// reports them only when crash reports are on (Settings → Privacy) and
// Local-only mode is off. React passes render errors it can't recover from
// to `window` too.
window.addEventListener("error", (e) => report(e.error));
window.addEventListener("unhandledrejection", (e) => report(e.reason));

function report(error: unknown) {
  // Only real errors: a rejected command's reason is the backend's message,
  // which can name a meeting or a person.
  if (!(error instanceof Error)) return;
  invoke("report_frontend_error", {
    name: error.name,
    message: error.message,
    stack: error.stack ?? null,
  }).catch(() => {});
}
