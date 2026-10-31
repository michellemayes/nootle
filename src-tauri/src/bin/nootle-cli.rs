//! `nootle-cli` is a thin launcher: the CLI lives in the `nootle-app` binary
//! beside it, so Nootle.app ships the app's code once instead of twice.

use std::os::unix::process::CommandExt;
use std::process::Command;

fn main() {
    let app = std::env::current_exe()
        .and_then(|exe| exe.canonicalize())
        .map(|exe| exe.with_file_name("nootle-app"))
        .unwrap_or_else(|e| fail(&format!("Couldn't find nootle-cli's own path: {e}")));
    let err = Command::new(&app)
        .arg0("nootle-cli")
        .args(std::env::args_os().skip(1))
        .exec();
    fail(&format!("Couldn't start {}: {err}", app.display()));
}

fn fail(message: &str) -> ! {
    eprintln!("nootle-cli: {message}");
    std::process::exit(1);
}
