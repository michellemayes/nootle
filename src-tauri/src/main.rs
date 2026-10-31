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

mod cli;

/// MCP clients connect over a pipe or socket on stdin, while GUI launches and
/// terminals give /dev/null or a TTY, so serve MCP on a pipe even without `--mcp`.
fn stdin_is_pipe() -> bool {
    use std::os::unix::fs::FileTypeExt;

    std::fs::metadata("/dev/stdin").is_ok_and(|m| {
        let t = m.file_type();
        t.is_fifo() || t.is_socket()
    })
}

fn main() {
    // The `nootle-cli` launcher runs this binary under that name, so the CLI
    // and the app share one copy of the code in Nootle.app.
    let arg0 = std::env::args_os().next();
    if arg0.is_some_and(|a| std::path::Path::new(&a).file_name() == Some("nootle-cli".as_ref())) {
        return cli::main();
    }
    nootle_app_lib::sandbox_migration::migrate();

    let mcp_flag = std::env::args().any(|a| a == "--mcp");
    if mcp_flag || stdin_is_pipe() {
        if !mcp_flag {
            eprintln!("Nootle: stdin is a pipe, serving MCP (pass --mcp to make this explicit)");
        }
        let db_path = cli::default_db_path();
        if let Some(app_dir) = std::path::Path::new(&db_path).parent() {
            std::fs::create_dir_all(app_dir).unwrap();
        }
        let db = nootle_app_lib::db::Database::new(&db_path).unwrap();
        let read_only = std::env::args().any(|a| a == "--read-only");
        if let Err(e) = nootle_app_lib::mcp::serve_stdio(db, read_only) {
            eprintln!("Nootle MCP server stopped: {e}");
            std::process::exit(1);
        }
    } else {
        nootle_app_lib::run();
    }
}
