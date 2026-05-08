// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Embed Info.plist into the Mach-O __TEXT,__info_plist section so macOS TCC
// can read usage strings (NSMicrophoneUsageDescription, etc.) when running
// the unbundled binary in `pnpm tauri dev`. The .app bundle gets a separate
// merged Info.plist via Tauri's bundler.
#[cfg(target_os = "macos")]
const INFO_PLIST_BYTES: &[u8] = include_bytes!("../Info.plist");

#[cfg(target_os = "macos")]
#[used]
#[link_section = "__TEXT,__info_plist"]
static EMBEDDED_INFO_PLIST: [u8; INFO_PLIST_BYTES.len()] = *include_bytes!("../Info.plist");

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.contains(&"--mcp".to_string()) {
        // Run as MCP server (stdio mode, no GUI)
        use rmcp::{transport::stdio, ServiceExt};

        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let app_dir = dirs::data_dir()
                .expect("Could not determine data directory")
                .join("Nootle");
            std::fs::create_dir_all(&app_dir).unwrap();
            let db_path = app_dir.join("nootle.db");
            let db = std::sync::Arc::new(
                nootle_app_lib::db::Database::new(db_path.to_str().unwrap()).unwrap(),
            );

            let server = nootle_app_lib::mcp::NootleMcpServer::new(db);
            let service = server.serve(stdio()).await.unwrap();
            service.waiting().await.unwrap();
        });
    } else {
        nootle_app_lib::run();
    }
}
