# explainshell-cli.rb
class ExplainshellCli < Formula
  desc "Explain shell commands using explainshell.com"
  homepage "https://github.com/mjsarfatti/explainshell-cli"
  url "https://github.com/mjsarfatti/explainshell-cli/releases/download/v0.0.5/explainshell-cli-v0.0.5.tar.gz"
  sha256 "6c87bf30563c37df80925801e68542e40ddc9507803e492a6b15d368f286ed86"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    # Add a basic test here
    assert_match "Attempting to explain command: ls -la", shell_output("#{bin}/explain ls -la")
  end
end