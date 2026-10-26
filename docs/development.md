# Developing Nootle

## Running from source

```bash
# Install dependencies
pnpm install

# Run in dev mode
pnpm tauri dev
```

`tauri build` refuses to run when an `@tauri-apps/*` npm package and its Rust crate are on different minor versions. The npm packages are pinned with `~` to the minors in `src-tauri/Cargo.lock`, so when you bump a Tauri crate, bump its npm package to the same minor.

## Integration sign-in

Notion, Linear, and Confluence connect with one click through each vendor's official MCP server (`mcp.notion.com`, `mcp.linear.app`, `mcp.atlassian.com`). Those servers support OAuth dynamic client registration, so Nootle registers itself the first time you connect. There's no OAuth app to create and nothing to configure at build time. Sign-in opens the vendor's consent page and catches the redirect on a one-off `127.0.0.1` port. Workflows then call the server's MCP tools, and `rmcp` refreshes the token when it expires.

GitHub can reuse a signed-in GitHub CLI (`gh auth token`). Slack and Asana connect with a pasted token, because their MCP servers require a registered app. The **Get a token** button opens the right page for each, and Slack's app setup comes pre-filled. Every service still accepts a pasted token.

## Releases

Every push to `main` publishes a release. The version comes from the [conventional commits](https://www.conventionalcommits.org/) since the last tag. Any `feat:` bumps the minor version, and anything else bumps the patch. A breaking change (`feat!:` or a `BREAKING CHANGE:` footer) bumps the minor version while Nootle is on 0.x, and the major version from 1.0 on. The rules live in the `[bump]` section of `cliff.toml`.

## Testing

```bash
# Rust tests (also run on Linux, apart from macOS capture code)
cd src-tauri && cargo test

# Golden tests: a short two-speaker call through the real transcription,
# speaker and search models, checking word error rate and speaker labels.
# Models download (and are hash-checked) into a folder of your choice.
scripts/fetch-test-models.sh ~/nootle-test-models
cd src-tauri && XDG_DATA_HOME=~/nootle-test-models cargo test --release --test models_test -- --ignored
```

On macOS, point the golden tests at your own downloaded models instead by leaving `XDG_DATA_HOME` unset. CI runs these on every backend change.

[`formal/`](../formal/README.md) has TLA+ models of the speech endpointer and the cancellable download and summary jobs. Run `formal/tla/check.sh` (needs Java) after changing `vad.rs`, `DownloadManager` or `SummaryJobsState`.

## Layout

Pages have to fit any window from 300 px wide up. Follow [layout.md](layout.md), and run `pnpm check:layout` after UI changes; CI runs it on every pull request.

## Built with

- [Tauri 2](https://tauri.app) — native app shell
- [React 19](https://react.dev) — frontend UI
- [ONNX Runtime](https://onnxruntime.ai) — local ML inference
- [Tailwind CSS](https://tailwindcss.com) — styling

## Screenshots and demo GIF

The README's demo GIF and the site's screenshots are generated from the real UI with demo data. See [`scripts/screenshots`](../scripts/screenshots).
