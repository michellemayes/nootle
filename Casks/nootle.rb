# Homebrew cask for Nootle. This repository doubles as a tap:
#
#   brew tap michellemayes/nootle https://github.com/michellemayes/nootle
#   brew install --cask nootle
#
# The release workflow bumps version and sha256 on every release.
cask "nootle" do
  version "0.15.0"
  sha256 "d4fa69f01e711ca9c9784085ee4a04ffb0dc9b9fb092d7e40bbd6b05cbd85cd7"

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
