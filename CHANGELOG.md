# Changelog

All notable changes to this project will be documented in this file.

## [0.1.9] - 2026-09-30

### Features

- Keep app running when the window is closed (#135) ([f4d5d86](https://github.com/michellemayes/nootle/commit/f4d5d8686e0c814aaaa993bd5d347cf42e05ae25))

## [0.1.8] - 2026-09-30

### Bug Fixes

- **llm:** Detect claude/codex CLIs when launched from Finder (#134) ([38451d6](https://github.com/michellemayes/nootle/commit/38451d6383300ba8319a94591fba2b0f742d4f1f))

## [0.1.7] - 2026-09-30

### CI

- **publish:** Retry changelog push when main moves (#133) ([0d86972](https://github.com/michellemayes/nootle/commit/0d86972b8de2059b7d120d8a551573e219f029aa))

## [0.1.6] - 2026-09-30

### CI

- **publish:** Make publishing much faster (#132) ([714194e](https://github.com/michellemayes/nootle/commit/714194e0c8b012bb539a6162a43e988f5b3a060e))

## [0.1.5] - 2026-09-30

### CI

- **publish:** Include changelog in automated releases (#131) ([18254dc](https://github.com/michellemayes/nootle/commit/18254dcfacbc63f7c82465bacf79b3238e3d55bc))
- **publish:** Debounce bursts of merges into a single release (#129) ([6333652](https://github.com/michellemayes/nootle/commit/6333652d9fd84b870a9fd8e7291528e477c1e844))

### Features

- **agents:** Manage automations from nootle-cli and the MCP server (#130) ([88e2bb3](https://github.com/michellemayes/nootle/commit/88e2bb31443678a834613f159bdce8390621a1b6))

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
- Add draggable region to main content top bar (#85) ([0d13d96](https://github.com/michellemayes/nootle/commit/0d13d962144348bef182273c0b038347775c53ba))
- Remove extra padding above help card content (#80) ([d43e234](https://github.com/michellemayes/nootle/commit/d43e23439a8f37056cad7ea44831630143884edc))
- Hide Ask Nootle button when chat panel is open and extend panel to top bar (#79) ([e877f09](https://github.com/michellemayes/nootle/commit/e877f09553401e5c6df3c029306cfa9eef09d805))
- Clear old analytics before reinserting to prevent duplicate speakers (#77) ([1b84f4e](https://github.com/michellemayes/nootle/commit/1b84f4e8164946c2d26082f1088274a8241a191a))
- Use PascalCase for titleBarStyle in Tauri v2 config (#73) ([61f0684](https://github.com/michellemayes/nootle/commit/61f0684c1a90e58980c32e3ae69cc7294bb41cfc))
- Enable scrolling in tabs and scroll areas with proper flex constraints (#71) ([92fea32](https://github.com/michellemayes/nootle/commit/92fea3284a3bd73f2315e15bccafe9f0009ef174))
- Correct layout spacing and scrolling in meeting detail and templates (#70) ([afc0026](https://github.com/michellemayes/nootle/commit/afc00268e19cf0baff2055b1a6f24974aa337309))
- Make meeting detail content scrollable with sticky player (#67) ([2520a21](https://github.com/michellemayes/nootle/commit/2520a21c52f65cec2fcdbe4e258db73523428d6d))
- Add vertical padding to tab bar containers (#68) ([a2f302d](https://github.com/michellemayes/nootle/commit/a2f302dcd76372ac20aa1e041d402e8b3db83e9c))
- Restore Ask Nootle as side drawer instead of inline panel (#69) ([b924723](https://github.com/michellemayes/nootle/commit/b92472324307932971a315904d1311905eee0dd0))
- Reset release-please manifest version to 0.0.0 (#66) ([9aef94a](https://github.com/michellemayes/nootle/commit/9aef94a1f8f47513c516ecdbffcb0ce9ffa110d8))
- Reduce excessive padding on help page cards (#61) ([8c386cf](https://github.com/michellemayes/nootle/commit/8c386cf7c1f9489b7debabd33992ca841ec02e7b))
- Polish UI for native macOS feel (#62) ([25a8183](https://github.com/michellemayes/nootle/commit/25a818331cecdefece7329bfd5df9c0065f59ad9))
- Unify legacy PM settings into integrations tab (#60) ([29e1055](https://github.com/michellemayes/nootle/commit/29e105509f6cb387bbfda79cfe8868915454e1b9))
- Position color picker popover relative to its trigger button (#59) ([1fed49e](https://github.com/michellemayes/nootle/commit/1fed49e97c57e0c7e316e0c8575de00957e743f6))
- Enable scrolling and use grid layout on templates page (#58) ([986b88f](https://github.com/michellemayes/nootle/commit/986b88f93904ffcb1c5738d35d3450e521a582c7))
- Resolve cargo fmt and clippy warnings (#57) ([c416ba5](https://github.com/michellemayes/nootle/commit/c416ba5926d9bfbfcf3f579a195e17cc5c70f652))
- Remove keychain dependency, add inline tag editing, fix chat input (#53) ([e2d6f3d](https://github.com/michellemayes/nootle/commit/e2d6f3d09518326a3013a3259dd6bfe00403e52f))
- Set default-run to nootle-app for tauri dev ([e296cb3](https://github.com/michellemayes/nootle/commit/e296cb3cd101e1b2186467742655d1ff55a60132))
- Comprehensive security hardening (#49) ([336369a](https://github.com/michellemayes/nootle/commit/336369a23f844918bc83461a2b37060919be7df9))
- Resolve 31 bugs across frontend, backend, and marketing site (#50) ([db129c5](https://github.com/michellemayes/nootle/commit/db129c5251dc17e34e17f6cef448b52242562a9b))
- Align connecting line through circle centers in how-it-works section (#47) ([4e110cf](https://github.com/michellemayes/nootle/commit/4e110cf02eff28a104f5dcffc375688c2f0a89c4))
- Remove duplicate headings from help pages and fix Rust formatting (#44) ([9884142](https://github.com/michellemayes/nootle/commit/9884142baff0fa59e26d30f27b992bbaad09ed89))
- Resolve CI workflow failures (#43) ([bf29cd1](https://github.com/michellemayes/nootle/commit/bf29cd1574c66460f640415620fed6a5868a9b7b))
- Wire audio capture into recording session (#19) ([4004932](https://github.com/michellemayes/nootle/commit/40049325a33ac246a5c97142860a73cf556b864b))
- Enable scrolling on Settings page by constraining flex item height (#11) ([e30e1bb](https://github.com/michellemayes/nootle/commit/e30e1bb6d4927e5d936e18f2a785512ab2d48fef))
- Add table styling to markdown component (#12) ([8ba0338](https://github.com/michellemayes/nootle/commit/8ba0338f45483fb7a01cb978baabbd2db4fa5e0c))
- Move Linear API key storage to database (#14) ([c21cd9a](https://github.com/michellemayes/nootle/commit/c21cd9abc7df45eca5cccf165356234d670f7b95))
- Use PNG logo instead of SVG in README (#4) ([1624b12](https://github.com/michellemayes/nootle/commit/1624b12d08d22075d583a9199db5fb744dd1aa5a))

### Documentation

- Add README freshness check to pre-PR checklist (#105) ([a4f1090](https://github.com/michellemayes/nootle/commit/a4f1090cda1d8c75e97317a1df32b15bb388db4f))
- Refresh README and marketing site to match current features (#102) ([0565880](https://github.com/michellemayes/nootle/commit/05658808510dd682c0e3aadbf5d1d96320a3d558))
- Add CLAUDE.md with pre-PR simplify reminder (#75) ([ca76a71](https://github.com/michellemayes/nootle/commit/ca76a71bb179f5bfb59225af9c38ea218877452b))
- Clarify difference between prompts and templates (#13) ([4102fce](https://github.com/michellemayes/nootle/commit/4102fce45b76bceb2de2a690ffb434961d93a122))

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
- Widen compact threshold and add sidebar collapse toggle (#83) ([96be546](https://github.com/michellemayes/nootle/commit/96be546283b2d2578f3a1556be18bd6043ba9204))
- Add compact note mode for narrow window use (#82) ([09b279a](https://github.com/michellemayes/nootle/commit/09b279ad330bc3cc26e1f6d2d5a1585252641bad))
- Update landing page AppMockup to match actual app styling (#78) ([a719034](https://github.com/michellemayes/nootle/commit/a7190340504d5335bb9016613a580d95e28dcfbc))
- Make Ask Nootle chat sidebar resizable (#74) ([82d2918](https://github.com/michellemayes/nootle/commit/82d2918cb473e965d26d82395cd3fd4caae7ab80))
- Make macOS title bar transparent to match app background (#72) ([807856c](https://github.com/michellemayes/nootle/commit/807856cc53ff4300b610fb173907ca03d4bc1aae))
- Consolidate tags and categories into unified labels (#65) ([8378982](https://github.com/michellemayes/nootle/commit/83789827c91e187d1c5197e992b2e0b7767d1a47))
- Add integrations, app demo auto-tour, and Ask Nootle panel (#63) ([74dc460](https://github.com/michellemayes/nootle/commit/74dc460debbabb7575c3391a03bdf279a8b01d9d))
- Post-meeting workflows (#56) ([e0d1b5c](https://github.com/michellemayes/nootle/commit/e0d1b5c5eee666cbe291d36e4f7e33337976013a))
- Add Granola-parity features (templates, recipes, tags, scratch pad) (#51) ([403bc27](https://github.com/michellemayes/nootle/commit/403bc273ad1a033a6fdf235c76747dfe9a798dab))
- Switch lander feature icons to lucide-react (#48) ([765a8e9](https://github.com/michellemayes/nootle/commit/765a8e9f9dcbafa5487fae240d761f22ef3141da))
- Redesign lander app preview with interactive views (#46) ([f34baa9](https://github.com/michellemayes/nootle/commit/f34baa9ab828549332e172ba7111edd54715b1e1))
- Add git-cliff for continuous changelog generation ([3f63cf9](https://github.com/michellemayes/nootle/commit/3f63cf94e759944ca7c55ef59eb72a8dff17fccf))
- Automate versioning with release-please, commitlint, and husky ([f4de3e0](https://github.com/michellemayes/nootle/commit/f4de3e03c96b889b603859982b4407dcee5434b1))
- Add global chat with transcript search via RAG embeddings (#28) ([fd1a831](https://github.com/michellemayes/nootle/commit/fd1a8311ca68db8510c106ee5764298b795dd989))
- Meeting intelligence — auto-extracted insights (#24) ([e8d9f2b](https://github.com/michellemayes/nootle/commit/e8d9f2b0f962bfb88fa2e60d5252be5d187b9b12))
- Add ability to edit prompts and templates (#22) ([6cfd3e7](https://github.com/michellemayes/nootle/commit/6cfd3e742a202bdd005901f228043c62f6061d83))
- Add customizable accent color picker to Settings (#21) ([cc29072](https://github.com/michellemayes/nootle/commit/cc290729f2f682cadf9d3374fd6585dd7c008c71))
- Upgrade transcription model from Parakeet TDT v2 to v3 (#18) ([3624d9f](https://github.com/michellemayes/nootle/commit/3624d9fb22ac96770cc9a0af9ce42aca63189ee1))
- Add Nootle marketing landing page (#20) ([321d1f1](https://github.com/michellemayes/nootle/commit/321d1f1b16306da91a74c158c9ca93b30d8d21ca))
- Upgrade speaker embedding to WeSpeaker-LM for better diarization accuracy (#16) ([a1718f5](https://github.com/michellemayes/nootle/commit/a1718f516e77d2ed3ac3c9e6190afedb86760548))
- Add Linear integration for ticket creation (#8) ([5c48947](https://github.com/michellemayes/nootle/commit/5c48947e74e1fc06832409469467082b532f85d3))
- Add in-app Help page with documentation (#7) ([1d525fb](https://github.com/michellemayes/nootle/commit/1d525fbf2326dfa5355d9eabf278dc13e39a9f45))
- Add local model download system for Parakeet and diarization (#6) ([e87a82d](https://github.com/michellemayes/nootle/commit/e87a82d91d4c3f1c124de96458614ebd67896dae))
- Add CI/CD pipelines, auto-updater, and README (#3) ([6f1d820](https://github.com/michellemayes/nootle/commit/6f1d820a07959fae0bcd60d01abf3ce138c1c8dd))

### Refactoring

- Verify features, fix bugs, deduplicate code (#55) ([a47e3a3](https://github.com/michellemayes/nootle/commit/a47e3a33cfd2922f5eaa39980bc9ef921371c1a9))
- Merge prompts into templates for simplified UX (#54) ([33e3bde](https://github.com/michellemayes/nootle/commit/33e3bdea687e9c84bffa52bf90aa5de6c1c444f7))

### Testing

- Add e2e user journey tests for all major product flows (#81) ([ff559c2](https://github.com/michellemayes/nootle/commit/ff559c210b77b7a97374c463a5840ef0492e2104))

