# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### CI

- **publish:** Debounce bursts of merges into a single release (#129) ([6333652](https://github.com/michellemayes/nootle/commit/6333652d9fd84b870a9fd8e7291528e477c1e844))

## [0.1.4] - 2026-09-30

### Bug Fixes

- **screenshots:** Stop blank meeting, insights, and chat captures (#128) ([19c314c](https://github.com/michellemayes/nootle/commit/19c314ce5153662f746d3cac41332b1e3e896657))

### CI

- **publish:** Auto-release on every push to main (#126) ([7d992d2](https://github.com/michellemayes/nootle/commit/7d992d2acbe0d600ab0f536aad48afd4cbc04bb6))

### Features

- **ux:** Command palette, keyboard shortcuts, streaks, and recording celebration (#124) ([5c06c96](https://github.com/michellemayes/nootle/commit/5c06c96c7961d819762e4a4159327addb8f952c2))

### Refactoring

- **ui:** Deslop copy and motion, unify chat, dialogs, and page patterns (#125) ([a478836](https://github.com/michellemayes/nootle/commit/a478836c1580ec96d22a7d072cfb4bd2af909259))

## [0.1.3] - 2026-07-30

### Bug Fixes

- E2e bugs across chat, library, templates, and meeting detail (#118) ([d6d0b4e](https://github.com/michellemayes/nootle/commit/d6d0b4e30547f4738050d1cf7342c9104bbb2ac9))

### Features

- Add high-fidelity app screenshots to README and landing page (#120) ([de0919c](https://github.com/michellemayes/nootle/commit/de0919cd03503aad2f13f21b3c6433f776385b8e))

### Refactoring

- **ui:** Unify design system and fix dead template picker (#119) ([f4556c4](https://github.com/michellemayes/nootle/commit/f4556c43500d02291cbfe973042608fefab62ce7))

## [0.1.2] - 2026-05-18

### Bug Fixes

- **onboarding:** Keep Download All running after a model fails (#116) ([692a1e5](https://github.com/michellemayes/nootle/commit/692a1e588fcc7def489d857988ebd403cb5a47f2))
- **installer:** Render DMG background crisply on Retina (#115) ([614c20b](https://github.com/michellemayes/nootle/commit/614c20ba5644deff6c85b1ec0f344cd997f7a753))

### Features

- **settings:** Surface Claude CLI and Codex CLI options in API Keys tab (#117) ([c386878](https://github.com/michellemayes/nootle/commit/c3868780944e3bc214edad6529263ed357c32a11))

## [0.1.1] - 2026-05-15

### Bug Fixes

- **permissions:** Use correct macOS sandbox entitlement for microphone (#110) ([6f178f1](https://github.com/michellemayes/nootle/commit/6f178f11f175fcd5dcc651e02fe7b539a0afa7c1))

### CI

- Remove non-functional release-please workflow (#111) ([f8d5044](https://github.com/michellemayes/nootle/commit/f8d50442453e073e73c751e24132720c1390dd73))
- Drop Intel Mac builds, ship Apple Silicon only (#108) ([0db7907](https://github.com/michellemayes/nootle/commit/0db7907f367ca8a030ab8e54e1cccab141caf21a))

### Documentation

- Add MIT LICENSE file (#113) ([d757a14](https://github.com/michellemayes/nootle/commit/d757a1465f1aba57f4993067f1dfe4626b946d72))
- Clarify Apple Silicon support covers M1 through M5 (#112) ([9906739](https://github.com/michellemayes/nootle/commit/9906739d4e02c7d9836a3b0e3f4a368d673d839e))

### Features

- **installer:** Brand the macOS DMG with a Nootle background (#109) ([ae2f99c](https://github.com/michellemayes/nootle/commit/ae2f99cc22826c23864c916be839e99af33e6087))

## [0.1.0] - 2026-05-12

### Bug Fixes

- **release-please:** Use lowercase `jsonpath` key for JSON extra-file (#106) ([8783c5a](https://github.com/michellemayes/nootle/commit/8783c5a3a99c53bd98fa250bb0f6511723a5663f))
- **release-please:** Reset manifest so the first release is 0.1.0 (#104) ([c697d3c](https://github.com/michellemayes/nootle/commit/c697d3cd202b8474bec55f12183b985d4a09040e))
- **audio:** Repair system-audio feature and ship it in releases (#100) ([107e1ab](https://github.com/michellemayes/nootle/commit/107e1ab30b64a6d1a1e221492cf92e80038299d5))
- **release-please:** Use jsonPath key for JSON extra file (#98) ([a844b24](https://github.com/michellemayes/nootle/commit/a844b2468e62caa282dc10c653e0f68106dad8c2))
- Resolve release-please workflow conflicts and config errors (#95) ([66da9f6](https://github.com/michellemayes/nootle/commit/66da9f69ef3592a0dabd589a6b1394171c14bdd8))
- Normalize site design with purple palette and accessibility (#93) ([4224a07](https://github.com/michellemayes/nootle/commit/4224a07565c6efcc42a83dde5bbb6f27f22cdf7e))
- Improve chat page styling and add resizable conversation list (#90) ([575c499](https://github.com/michellemayes/nootle/commit/575c499befe121268e30073c35f14df66697fcee))
- Center integration cards layout (#91) ([291f5da](https://github.com/michellemayes/nootle/commit/291f5dae789445b55a1b8392ab57dc4602d86c53))
- Use data-tauri-drag-region for window dragging in Tauri v2 (#89) ([363ce9a](https://github.com/michellemayes/nootle/commit/363ce9ae7dddaf494af2fdd5ddb43a6d15b7af61))
- Improve sidebar logo and recording button layout (#88) ([3ce3f84](https://github.com/michellemayes/nootle/commit/3ce3f84f68743c05db51b95db8f4db07078750e9))
- Make generated summaries display immediately and surface errors (#86) ([0bc54a4](https://github.com/michellemayes/nootle/commit/0bc54a455ca0bd68f9b03b2bf2d8ffadf7f7b7e9))

### Documentation

- Add README freshness check to pre-PR checklist (#105) ([a4f1090](https://github.com/michellemayes/nootle/commit/a4f1090cda1d8c75e97317a1df32b15bb388db4f))
- Refresh README and marketing site to match current features (#102) ([0565880](https://github.com/michellemayes/nootle/commit/05658808510dd682c0e3aadbf5d1d96320a3d558))

### Features

- **llm:** Add Codex as an AI provider (API key + CLI subscription) (#103) ([0173408](https://github.com/michellemayes/nootle/commit/01734086a7e5ad962a87d030689af27f2944095e))
- **llm:** Add Claude Agent SDK connector (#101) ([ca2059b](https://github.com/michellemayes/nootle/commit/ca2059ba68b0190428c4eac144b954c5caf56402))
- Polish UI details across app and marketing site (#99) ([89abb15](https://github.com/michellemayes/nootle/commit/89abb15085e56f286015dbd97b4a53b1a2a7322a))
- **site:** Add Google tag to root layout (#97) ([54cee3b](https://github.com/michellemayes/nootle/commit/54cee3b24c7a93188d83d20a9a24ca9d7a248db5))
- Comprehensive SEO overhaul — score 30 → 87/100 (#96) ([647d306](https://github.com/michellemayes/nootle/commit/647d30617305bf43110bf9111a09e96f3954cd26))
- Sync app logo and theme with website purple palette (#94) ([5715fe7](https://github.com/michellemayes/nootle/commit/5715fe7e36b3451c8759f60bf84791c312265a0e))
- Improve UX copy, compact mode, animations, and accessibility (#92) ([cab7913](https://github.com/michellemayes/nootle/commit/cab791386b6568bbfde718ca1955599a59e21827))
- Add Obsidian to integrations on landing page (#87) ([08cd4b8](https://github.com/michellemayes/nootle/commit/08cd4b8dcaf3ea0b8f8178c22a9c85cfb42c7c8b))
- Hide sidebar expand button until hover and preserve logo aspect ratio (#84) ([8fc3ec2](https://github.com/michellemayes/nootle/commit/8fc3ec20a55ca8498ae0017a054b5219717e21b0))


