# Homebrew cask for Nootle. This repository doubles as a tap:
#
#   brew tap michellemayes/nootle https://github.com/michellemayes/nootle
#   brew install --cask nootle
#
# The release workflow bumps version and sha256 on every release.
cask "nootle" do
  version "0.18.0"
  sha256 "4113aaeba910adfa99bf9d6d6aca9145e38209cc987ef76ac9a8e3e1167f680c"

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
