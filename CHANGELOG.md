# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Bug Fixes

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

- Add CLAUDE.md with pre-PR simplify reminder (#75) ([ca76a71](https://github.com/michellemayes/nootle/commit/ca76a71bb179f5bfb59225af9c38ea218877452b))
- Clarify difference between prompts and templates (#13) ([4102fce](https://github.com/michellemayes/nootle/commit/4102fce45b76bceb2de2a690ffb434961d93a122))

### Features

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


