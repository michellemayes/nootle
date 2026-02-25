# Nootle Deploy, Release & App Polish Design

Date: 2026-02-25
Status: Approved
Reference: Terrarium at /Users/michelle/Documents/Repos/terrarium

## Goal

Make Nootle a complete, shippable macOS app with automated CI/CD, signed releases, auto-updates, and a polished README — mirroring Terrarium's production setup.

## Scope

1. CI workflow (lint + test on every push/PR)
2. Publish workflow (tag-triggered build, sign, notarize, release)
3. Auto-updater (tauri-plugin-updater with GitHub releases)
4. DMG customization
5. Version management and validation
6. README with branding, badges, features, install instructions
7. Apple Developer setup instructions

No Homebrew formula in this iteration (can add later).

---

## 1. CI Workflow (.github/workflows/ci.yml)

**Trigger:** push to `main`, PRs to `main`

**Jobs:**

### check-rust (macos-latest)
- Install Node.js 20, pnpm
- `pnpm install`
- Install Rust stable toolchain
- `cargo fmt --check`
- `cargo clippy -- -D warnings`
- `cargo test`

### test-node (macos-latest)
- Install Node.js 20, pnpm
- `pnpm install`
- `tsc --noEmit` (TypeScript type check)
- Run vitest if tests exist

macOS runner required because Nootle depends on CoreAudio (cidre), security-framework, and other macOS-only APIs.

---

## 2. Publish Workflow (.github/workflows/publish.yml)

**Trigger:** tags matching `v*`

**Matrix:**
- `macos-latest` with `--target aarch64-apple-darwin`
- `macos-latest` with `--target x86_64-apple-darwin`

**Steps:**

1. **Validate tag** — must match `vX.Y.Z` format
2. **Version consistency** — extract version from tag, compare against:
   - `package.json` version
   - `src-tauri/Cargo.toml` version
   - `src-tauri/tauri.conf.json` version
   - Fail if any mismatch
3. **Import Apple certificate:**
   ```bash
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
   ```
4. **Build with tauri-action:**
   ```yaml
   uses: tauri-apps/tauri-action@v0
   env:
     GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
     APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
     APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
     APPLE_ID: ${{ secrets.APPLE_ID }}
     APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
     APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
     TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
     TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
   with:
     tagName: v__VERSION__
     releaseName: 'v__VERSION__'
     releaseBody: ''
     releaseDraft: false
     prerelease: false
     includeUpdaterJson: true
     args: ${{ matrix.args }}
   ```
5. **Verify release** — confirm latest.json and .sig files exist
6. **Generate release notes** via GitHub API

### Required Secrets

| Secret | Purpose | How to get |
|--------|---------|------------|
| `APPLE_CERTIFICATE` | Base64-encoded .p12 Developer ID cert | Export from Keychain Access, then `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting .p12 | Set during export |
| `APPLE_SIGNING_IDENTITY` | Full identity string | `security find-identity -v -p codesigning` |
| `APPLE_ID` | Apple ID email | Your Apple Developer email |
| `APPLE_PASSWORD` | App-specific password (NOT Apple ID password) | Generate at appleid.apple.com > App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-char team ID | Apple Developer portal > Membership |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater signing private key | `npx tauri signer generate -w ~/.tauri/nootle.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for signing key | Set during generation |

---

## 3. Auto-Updater

### Dependencies

**Cargo.toml** — add:
```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

### Tauri Config

**tauri.conf.json** — add to bundle:
```json
"createUpdaterArtifacts": true
```

Add plugins section:
```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/michellemayes/nootle/releases/latest/download/latest.json"
    ],
    "pubkey": "<GENERATED_PUBLIC_KEY>"
  }
}
```

### Capabilities

**capabilities/default.json** — add permissions:
```json
"updater:default",
"process:default"
```

### Rust Implementation

In `lib.rs`:
- Register `tauri_plugin_updater::Builder::new().build()` in `.plugin()` chain
- Register `tauri_plugin_process::init()` in `.plugin()` chain
- Add "Check for Updates..." menu item under Help menu
- Menu handler: async check for update, show dialog if available, open releases page
- Background check on startup in `.setup()`: silent check, emit `update-available` event

### Key Generation

```bash
npx tauri signer generate -w ~/.tauri/nootle.key
```

Store the public key in `tauri.conf.json` and the private key as a GitHub secret.

---

## 4. DMG Configuration

**tauri.conf.json** bundle.macOS section:
```json
"macOS": {
  "dmg": {
    "appPosition": { "x": 180, "y": 170 },
    "applicationFolderPosition": { "x": 480, "y": 170 },
    "windowSize": { "width": 660, "height": 400 }
  },
  "entitlements": "entitlements.plist",
  "minimumSystemVersion": "14.0"
}
```

Standard drag-to-Applications layout matching Terrarium.

---

## 5. Version Management

Manual process (same as Terrarium):

1. Update version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
2. Commit: `git commit -m "bump version to 0.X.Y"`
3. Tag: `git tag v0.X.Y`
4. Push: `git push origin main v0.X.Y`

Publish workflow validates all three files match the tag before building.

---

## 6. README

Structure modeled on Terrarium's README:

1. **Nootle SVG logo** — centered, from `/Users/michelle/Documents/Repos/nootle/Nootle.icon/Assets/nootle-logo 5.svg`
2. **Badges:**
   - Release (shields.io, links to GitHub releases)
   - CI status (GitHub Actions badge)
   - License
   - Platform: macOS 14+
3. **One-liner:** "Your AI meeting recorder and assistant"
4. **Features:**
   - Record meetings (mic + system audio)
   - Automatic transcription with speaker identification
   - AI-powered summaries and chat
   - Multiple LLM providers (OpenAI, Anthropic, Google, Groq, Ollama)
   - MCP server for external tool integration
   - Customizable prompts and templates
5. **Installation:**
   - Download DMG from GitHub Releases (arm64 + x64)
   - Open DMG, drag to Applications
6. **Permissions:** Microphone, screen recording (system audio), calendar
7. **Development:** `pnpm install`, `pnpm tauri dev`
8. **Testing:** `cd src-tauri && cargo test`
9. **Built With:** Tauri 2, React 19, Rust, ONNX Runtime, Tailwind CSS

---

## 7. Apple Developer Setup Guide

Step-by-step instructions included in the design for first-time setup:

1. **Certificate:** Open Keychain Access > export "Developer ID Application" cert as .p12
2. **Base64 encode:** `base64 -i Certificates.p12 | pbcopy`
3. **Signing identity:** `security find-identity -v -p codesigning` — copy the full string
4. **App-specific password:** appleid.apple.com > Sign-In and Security > App-Specific Passwords > Generate
5. **Team ID:** developer.apple.com > Account > Membership > Team ID
6. **Tauri signing keys:** `npx tauri signer generate -w ~/.tauri/nootle.key`
7. **Add to GitHub:** Settings > Secrets and variables > Actions > add all secrets from table above

---

## Release Artifacts

Each release will contain:
- `Nootle_X.Y.Z_aarch64.dmg` — Apple Silicon
- `Nootle_X.Y.Z_x64.dmg` — Intel
- `latest.json` — updater metadata
- `.sig` files — update signatures
- Auto-generated release notes

---

## Out of Scope (Future)

- Homebrew formula
- Windows/Linux builds
- Custom DMG background image
- Frontend update progress UI (beyond dialog)
- Automated version bumping script
