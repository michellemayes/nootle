# Nootle Deploy, Release & README Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CI/CD pipelines, auto-updater, DMG config, and polished README to Nootle — mirroring Terrarium's production setup.

**Architecture:** GitHub Actions for CI (lint/test) and publish (tag-triggered build/sign/notarize/release). Tauri plugin-updater for in-app update checks via GitHub Releases. README with SVG logo and shields.io badges.

**Tech Stack:** GitHub Actions, tauri-apps/tauri-action@v0, tauri-plugin-updater v2, tauri-plugin-dialog v2, tauri-plugin-process v2, pnpm, Rust/Cargo

**Design doc:** `docs/plans/2026-02-25-deploy-release-readme-design.md`

**Reference implementation:** Terrarium at `/Users/michelle/Documents/Repos/terrarium`

---

### Task 1: Create CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create the workflow file**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check-rust:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: "./src-tauri -> target"
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm install
      - name: Check formatting
        run: cd src-tauri && cargo fmt --check
      - name: Clippy
        run: cd src-tauri && cargo clippy -- -D warnings
      - name: Run tests
        run: cd src-tauri && cargo test

  check-frontend:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm install
      - name: TypeScript check
        run: pnpm exec tsc --noEmit
```

**Step 2: Verify file structure**

Run: `cat .github/workflows/ci.yml | head -5`
Expected: `name: CI`

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow for Rust and frontend checks"
```

---

### Task 2: Create publish workflow

**Files:**
- Create: `.github/workflows/publish.yml`

**Step 1: Create the workflow file**

```yaml
name: Publish

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  publish:
    if: startsWith(github.ref, 'refs/tags/v')
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: "--target aarch64-apple-darwin"
          - platform: macos-latest
            args: "--target x86_64-apple-darwin"
    runs-on: ${{ matrix.platform }}
    env:
      RELEASE_TAG: ${{ github.ref_name }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ env.RELEASE_TAG }}

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: "./src-tauri -> target"

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install frontend dependencies
        run: pnpm install

      - name: Run tests before publish
        run: cd src-tauri && cargo test

      - name: Validate release tag
        run: |
          if [[ ! "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "Invalid RELEASE_TAG: $RELEASE_TAG"
            exit 1
          fi

      - name: Validate version consistency
        run: |
          TAG_VERSION="${RELEASE_TAG#v}"
          TAURI_VERSION=$(node -p 'require("./src-tauri/tauri.conf.json").version')
          CARGO_VERSION=$(awk -F'"' '/^version =/ { print $2; exit }' ./src-tauri/Cargo.toml)
          PKG_VERSION=$(node -p 'require("./package.json").version')

          for name_ver in "tauri.conf.json:$TAURI_VERSION" "Cargo.toml:$CARGO_VERSION" "package.json:$PKG_VERSION"; do
            name="${name_ver%%:*}"
            ver="${name_ver##*:}"
            if [[ "$ver" != "$TAG_VERSION" ]]; then
              echo "$name version ($ver) != tag version ($TAG_VERSION)"
              exit 1
            fi
          done

      - name: Import Apple Developer Certificate
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          echo "$APPLE_CERTIFICATE" | base64 --decode > certificate.p12
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security set-keychain-settings -t 3600 -u build.keychain
          security import certificate.p12 -k build.keychain \
            -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: \
            -s -k "$KEYCHAIN_PASSWORD" build.keychain
          rm certificate.p12

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
        with:
          tagName: ${{ env.RELEASE_TAG }}
          releaseName: ${{ env.RELEASE_TAG }}
          releaseDraft: false
          prerelease: false
          includeUpdaterJson: true
          args: ${{ matrix.args }}

      - name: Verify updater assets
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          ASSETS=$(gh release view "$RELEASE_TAG" --json assets --jq '.assets[].name')
          echo "$ASSETS" | grep -q 'latest.json' || { echo "Missing latest.json"; exit 1; }
          echo "$ASSETS" | grep -qE '\.sig$' || { echo "Missing .sig files"; exit 1; }

  release-notes:
    needs: publish
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      RELEASE_TAG: ${{ github.ref_name }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Add auto-generated release notes
        run: |
          NOTES=$(gh api \
            --method POST \
            -H "Accept: application/vnd.github+json" \
            /repos/${{ github.repository }}/releases/generate-notes \
            -f tag_name="$RELEASE_TAG" \
            --jq '.body')
          gh release edit "$RELEASE_TAG" --notes "$NOTES"
```

**Step 2: Verify file structure**

Run: `cat .github/workflows/publish.yml | head -5`
Expected: `name: Publish`

**Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add publish workflow with code signing and auto-update"
```

---

### Task 3: Add updater dependencies to Cargo.toml

**Files:**
- Modify: `src-tauri/Cargo.toml:20-46` (dependencies section)

**Step 1: Add the three new dependencies**

Add these lines to the `[dependencies]` section in `src-tauri/Cargo.toml`:

```toml
tauri-plugin-updater = "2"
tauri-plugin-dialog = "2"
tauri-plugin-process = "2"
log = "0.4"
```

Note: `log` is needed for `log::warn!()` in the update checker. `tauri-plugin-dialog` is needed for the update dialog.

**Step 2: Verify the dependencies were added**

Run: `grep -c "tauri-plugin-updater\|tauri-plugin-dialog\|tauri-plugin-process" src-tauri/Cargo.toml`
Expected: `3`

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: Should compile (warnings OK, no errors)

**Step 4: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "deps: add updater, dialog, and process plugins"
```

---

### Task 4: Configure tauri.conf.json for updater and DMG

**Files:**
- Modify: `src-tauri/tauri.conf.json`

**Step 1: Update tauri.conf.json**

The file needs three changes:
1. Add `"createUpdaterArtifacts": true` to `bundle`
2. Add DMG layout config to `bundle.macOS`
3. Add `plugins.updater` section with endpoint and pubkey

Replace the entire `tauri.conf.json` with:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Nootle",
  "version": "0.1.0",
  "identifier": "com.nootle.app",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Nootle",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "decorations": true,
        "transparent": false,
        "center": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "dmg": {
        "appPosition": { "x": 180, "y": 170 },
        "applicationFolderPosition": { "x": 480, "y": 170 },
        "windowSize": { "width": 660, "height": 400 }
      },
      "entitlements": "entitlements.plist",
      "minimumSystemVersion": "14.0"
    },
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/michellemayes/nootle/releases/latest/download/latest.json"
      ],
      "pubkey": "REPLACE_WITH_GENERATED_PUBLIC_KEY"
    }
  }
}
```

**Important:** The `pubkey` value must be replaced with the actual public key after running `npx tauri signer generate -w ~/.tauri/nootle.key`. The implementer should run this command and paste the public key string.

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json', 'utf8')); console.log('valid')"`
Expected: `valid`

**Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "config: add updater endpoint, DMG layout, and updater artifacts"
```

---

### Task 5: Update capabilities for updater and dialog

**Files:**
- Modify: `src-tauri/capabilities/default.json`

**Step 1: Update capabilities**

Replace the contents of `src-tauri/capabilities/default.json` with:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "updater:default",
    "dialog:default",
    "process:default"
  ]
}
```

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/capabilities/default.json', 'utf8')); console.log('valid')"`
Expected: `valid`

**Step 3: Commit**

```bash
git add src-tauri/capabilities/default.json
git commit -m "config: add updater, dialog, and process permissions"
```

---

### Task 6: Add menu bar with "Check for Updates" and update checker

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add the updater, dialog, and process plugins plus menu**

In `src-tauri/src/lib.rs`, the `tauri::Builder::default()` chain (starting at line 54) needs modifications. Add three new `.plugin()` calls after the existing opener plugin, add a `.menu()` builder, add `.on_menu_event()` handler, and add a background update check in `.setup()`.

After `.plugin(tauri_plugin_opener::init())` (line 55), add:

```rust
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
```

Before `.manage(db)` (line 56), add the menu:

```rust
        .menu(|handle| {
            use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
            let app_menu = SubmenuBuilder::new(handle, "Nootle")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let window_menu = SubmenuBuilder::new(handle, "Window")
                .minimize()
                .build()?;
            let help_menu = SubmenuBuilder::new(handle, "Help")
                .item(
                    &MenuItemBuilder::with_id(
                        "check-for-updates",
                        "Check for Updates\u{2026}",
                    )
                    .build(handle)?,
                )
                .build()?;
            MenuBuilder::new(handle)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "check-for-updates" {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_dialog::DialogExt;
                    use tauri_plugin_updater::UpdaterExt;

                    let updater = match handle.updater() {
                        Ok(u) => u,
                        Err(e) => {
                            log::warn!("Failed to initialize updater: {e}");
                            handle
                                .dialog()
                                .message("Could not check for updates.")
                                .title("Update Error")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                                .blocking_show();
                            return;
                        }
                    };

                    match updater.check().await {
                        Ok(Some(update)) => {
                            let msg = format!("Version {} is available.", update.version);
                            let should_open = handle
                                .dialog()
                                .message(msg)
                                .title("Update Available")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                                .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                                    "Download".to_string(),
                                    "Later".to_string(),
                                ))
                                .blocking_show();
                            if should_open {
                                use tauri_plugin_opener::OpenerExt;
                                if let Err(e) = handle.opener().open_url(
                                    "https://github.com/michellemayes/nootle/releases/latest",
                                    None::<&str>,
                                ) {
                                    log::warn!("Failed to open releases URL: {e}");
                                }
                            }
                        }
                        Ok(None) => {
                            handle
                                .dialog()
                                .message("You're running the latest version.")
                                .title("No Updates Available")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                                .blocking_show();
                        }
                        Err(e) => {
                            log::warn!("Update check failed: {e}");
                            handle
                                .dialog()
                                .message("Could not check for updates. Please check your internet connection.")
                                .title("Update Error")
                                .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                                .blocking_show();
                        }
                    }
                });
            }
        })
```

In the existing `.setup()` closure, add the background update check after the meeting detection spawn block (after line 76):

```rust
            // Background update check
            let update_handle = app_handle.clone();
            tokio::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;
                if let Ok(updater) = update_handle.updater() {
                    if let Ok(Some(update)) = updater.check().await {
                        let _ = update_handle.emit("update-available", &update.version);
                    }
                }
            });
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -10`
Expected: Should compile (warnings OK, no errors)

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add app menu with Check for Updates and background update check"
```

---

### Task 7: Copy Nootle SVG logo into repo

**Files:**
- Create: `src-tauri/icons/icon.svg` (copy from external location)

**Step 1: Copy the SVG into the repo**

```bash
cp "/Users/michelle/Documents/Repos/nootle/Nootle.icon/Assets/nootle-logo 5.svg" src-tauri/icons/icon.svg
```

**Step 2: Verify it was copied**

Run: `head -1 src-tauri/icons/icon.svg`
Expected: `<svg width="200" height="200"...`

**Step 3: Commit**

```bash
git add src-tauri/icons/icon.svg
git commit -m "art: add Nootle SVG logo for README"
```

---

### Task 8: Write the README

**Files:**
- Modify: `README.md`

**Step 1: Write the README**

Replace the empty `README.md` with:

```markdown
<p align="center">
  <img src="src-tauri/icons/icon.svg" width="128" height="128" alt="Nootle icon" />
</p>

<h1 align="center">Nootle</h1>

<p align="center">
  <strong>Your AI meeting recorder and assistant</strong>
  <br />
  Record, transcribe, and understand your meetings with local AI.
</p>

<p align="center">
  <a href="https://github.com/michellemayes/nootle/releases"><img src="https://img.shields.io/github/v/release/michellemayes/nootle?style=flat-square&color=72937A" alt="Release" /></a>
  <a href="https://github.com/michellemayes/nootle/actions"><img src="https://img.shields.io/github/actions/workflow/status/michellemayes/nootle/ci.yml?style=flat-square&label=CI" alt="CI" /></a>
  <a href="https://github.com/michellemayes/nootle/blob/main/LICENSE"><img src="https://img.shields.io/github/license/michellemayes/nootle?style=flat-square&color=D9B78B" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%2014%2B-CC765B?style=flat-square" alt="macOS 14+" />
</p>

---

Nootle captures your meetings — microphone and system audio — transcribes them in real time with speaker identification, and lets you chat with an AI about what was said. No cloud recording service needed.

## Features

- **Record everything** — capture microphone and system audio simultaneously
- **Live transcription** — speech-to-text powered by Parakeet via ONNX Runtime
- **Speaker identification** — know who said what with automatic diarization
- **AI summaries and chat** — ask questions about your meetings using your preferred LLM
- **Multiple LLM providers** — OpenAI, Anthropic, Google, Groq, or local Ollama
- **Meeting detection** — auto-detects active meeting apps and calendar events
- **MCP server** — integrate with Claude Code and other MCP-compatible tools
- **Customizable** — editable prompts and templates for summaries

## Install

Download the latest `.dmg` from [**Releases**](https://github.com/michellemayes/nootle/releases), open it, and drag Nootle to Applications.

| Chip | Download |
|------|----------|
| Apple Silicon (M1+) | `Nootle_x.y.z_aarch64.dmg` |
| Intel | `Nootle_x.y.z_x64.dmg` |

### Permissions

On first launch, Nootle will ask for:

- **Microphone** — to record your voice
- **Screen Recording** — to capture system audio from meeting apps via Core Audio
- **Calendar** — to auto-detect upcoming meetings

## Development

```bash
# Install dependencies
pnpm install

# Run in dev mode
pnpm tauri dev
```

## Testing

```bash
# Rust tests
cd src-tauri && cargo test
```

## Built With

- [Tauri 2](https://tauri.app) — native app shell
- [React 19](https://react.dev) — frontend UI
- [ONNX Runtime](https://onnxruntime.ai) — local ML inference
- [Tailwind CSS](https://tailwindcss.com) — styling

## License

[MIT](LICENSE)
```

Note: The badge colors (`72937A`, `D9B78B`, `CC765B`) are taken from the Nootle logo gradient to match branding.

**Step 2: Verify the README renders**

Run: `head -20 README.md`
Expected: Should show the centered icon and title HTML

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with branding, features, and install instructions"
```

---

### Task 9: Generate Tauri signing keys

This task requires manual user action.

**Step 1: Generate keys**

Run: `npx tauri signer generate -w ~/.tauri/nootle.key`

This will output a public key string. Copy it.

**Step 2: Update tauri.conf.json with the public key**

In `src-tauri/tauri.conf.json`, replace `"REPLACE_WITH_GENERATED_PUBLIC_KEY"` with the actual public key string output from the previous step.

**Step 3: Verify the key is set**

Run: `node -p 'require("./src-tauri/tauri.conf.json").plugins.updater.pubkey'`
Expected: Should print the public key (NOT "REPLACE_WITH_GENERATED_PUBLIC_KEY")

**Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "config: add Tauri updater signing public key"
```

---

### Task 10: Set up GitHub secrets

This task is entirely manual — instructions for the developer.

**Step 1: Export your Developer ID Application certificate**

1. Open **Keychain Access** on your Mac
2. Find your "Developer ID Application" certificate
3. Right-click > Export Items > save as `.p12` with a password
4. Base64 encode: `base64 -i Certificates.p12 | pbcopy`

**Step 2: Find your signing identity**

Run: `security find-identity -v -p codesigning`

Copy the full string like: `Developer ID Application: Your Name (TEAMID)`

**Step 3: Generate an app-specific password**

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in > Security > App-Specific Passwords > Generate
3. Name it "Nootle CI" and save the generated password

**Step 4: Find your Team ID**

1. Go to [developer.apple.com](https://developer.apple.com) > Account > Membership
2. Copy the 10-character Team ID

**Step 5: Add all secrets to GitHub**

Go to: `https://github.com/michellemayes/nootle/settings/secrets/actions`

Add these repository secrets:

| Secret Name | Value |
|-------------|-------|
| `APPLE_CERTIFICATE` | Base64 string from Step 1 |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting .p12 |
| `APPLE_SIGNING_IDENTITY` | Full string from Step 2 |
| `APPLE_ID` | Your Apple Developer email |
| `APPLE_PASSWORD` | App-specific password from Step 3 |
| `APPLE_TEAM_ID` | Team ID from Step 4 |
| `KEYCHAIN_PASSWORD` | Any random string (used by CI only) |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/nootle.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password from Task 9 key generation |

**Step 6: Verify secrets are set**

Go to `https://github.com/michellemayes/nootle/settings/secrets/actions` and confirm all 9 secrets appear in the list.

---

### Task 11: Verify everything compiles and commit final state

**Files:**
- None (verification only)

**Step 1: Full compilation check**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: No errors

**Step 2: Frontend check**

Run: `pnpm exec tsc --noEmit 2>&1 | tail -5`
Expected: No errors

**Step 3: Run Rust tests**

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: All tests pass

**Step 4: Verify all workflows exist**

Run: `ls .github/workflows/`
Expected: `ci.yml  publish.yml`

**Step 5: Final verification commit (if any unstaged changes)**

```bash
git status
# If clean, no commit needed
# If changes exist, stage and commit appropriately
```
