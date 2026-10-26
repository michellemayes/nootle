# Homebrew cask for Nootle. This repository doubles as a tap:
#
#   brew tap michellemayes/nootle https://github.com/michellemayes/nootle
#   brew install --cask nootle
#
# The release workflow bumps version and sha256 on every release.
cask "nootle" do
  version "0.24.1"
  sha256 "39fb95687e0f8cc1e6216656a63a4484e97ee23e6574b08fffaefe0eed9a9d28"

  url "https://github.com/michellemayes/nootle/releases/download/v#{version}/Nootle_#{version}_aarch64.dmg"
  name "Nootle"
  desc "Local-first AI meeting recorder with private transcription and summaries"
  homepage "https://github.com/michellemayes/nootle"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on arch: :arm64
  depends_on macos: ">= :sonoma"

  app "Nootle.app"

  zap trash: [
    "~/Library/Application Support/Nootle",
    "~/Library/Caches/com.nootle.desktop",
    "~/Library/Logs/Nootle",
    "~/Library/Preferences/com.nootle.desktop.plist",
    "~/Library/Saved Application State/com.nootle.desktop.savedState",
    "~/Library/WebKit/com.nootle.desktop",
  ]
end
