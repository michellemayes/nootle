# Nootle Release Setup Guide

One-time setup for code signing, notarization, and auto-updates.

## 1. Generate Tauri Signing Keys

```bash
npx tauri signer generate -w ~/.tauri/nootle.key
```

This outputs a public key string. Copy it and paste it into `src-tauri/tauri.conf.json` replacing `REPLACE_WITH_GENERATED_PUBLIC_KEY`:

```json
"plugins": {
  "updater": {
    "pubkey": "PASTE_PUBLIC_KEY_HERE"
  }
}
```

Save the private key file (`~/.tauri/nootle.key`) — you'll need its contents for the `TAURI_SIGNING_PRIVATE_KEY` secret.

## 2. Export Your Developer ID Certificate

1. Open **Keychain Access**
2. Find your **Developer ID Application** certificate
3. Right-click > **Export Items** > save as `.p12` with a password
4. Base64 encode it:

```bash
base64 -i Certificates.p12 | pbcopy
```

The encoded string is now in your clipboard.

## 3. Find Your Signing Identity

```bash
security find-identity -v -p codesigning
```

Copy the full string, e.g.: `Developer ID Application: Your Name (TEAMID)`

## 4. Generate an App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in > **Sign-In and Security** > **App-Specific Passwords** > **Generate**
3. Name it `Nootle CI`
4. Save the generated password

## 5. Find Your Team ID

1. Go to [developer.apple.com](https://developer.apple.com) > **Account** > **Membership**
2. Copy the 10-character **Team ID**

## 6. Add GitHub Secrets

Go to: https://github.com/michellemayes/nootle/settings/secrets/actions

Add these repository secrets:

| Secret | Value |
|--------|-------|
| `APPLE_CERTIFICATE` | Base64 string from step 2 |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting .p12 |
| `APPLE_SIGNING_IDENTITY` | Full string from step 3 |
| `APPLE_ID` | Your Apple Developer email |
| `APPLE_PASSWORD` | App-specific password from step 4 |
| `APPLE_TEAM_ID` | Team ID from step 5 |
| `KEYCHAIN_PASSWORD` | Any random string (CI-only, e.g. `openssl rand -hex 16`) |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/nootle.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password from step 1 |

## 7. Making a Release

Once secrets are configured:

```bash
# 1. Update version in all three files
#    - package.json
#    - src-tauri/Cargo.toml
#    - src-tauri/tauri.conf.json

# 2. Commit
git commit -am "bump version to 0.2.0"

# 3. Tag and push
git tag v0.2.0
git push origin main v0.2.0
```

The publish workflow will automatically build arm64 + x64 DMGs, sign and notarize them, upload to GitHub Releases, generate `latest.json` for auto-updates, and create release notes.
