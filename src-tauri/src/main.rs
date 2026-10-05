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

/// MCP clients talk to their servers over a pipe or socket on stdin, while
/// Finder, the Dock, login items, and a terminal give the app /dev/null or a
/// TTY. Serving MCP whenever stdin is a pipe means a client that drops or
/// never passed `--mcp` gets a server instead of a new app window it would
/// wait on forever.
fn stdin_is_pipe() -> bool {
    use std::os::fd::AsFd;
    use std::os::unix::fs::FileTypeExt;

    std::io::stdin()
        .as_fd()
        .try_clone_to_owned()
        .map(std::fs::File::from)
        .and_then(|stdin| stdin.metadata())
        .is_ok_and(|m| m.file_type().is_fifo() || m.file_type().is_socket())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    nootle_app_lib::sandbox_migration::migrate();

    if args.contains(&"--mcp".to_string()) || stdin_is_pipe() {
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
