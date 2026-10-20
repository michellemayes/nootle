# Homebrew cask for Nootle. This repository doubles as a tap:
#
#   brew tap michellemayes/nootle https://github.com/michellemayes/nootle
#   brew install --cask nootle
#
# The release workflow bumps version and sha256 on every release.
cask "nootle" do
  version "0.17.1"
  sha256 "51f941a106c4e16126d7325b4b236f54fd737f8e4ad9eb4dc005e746f4e6345b"

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
