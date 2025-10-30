# explainshell-cli.rb
class ExplainshellCli < Formula
  desc "Explain shell commands using explainshell.com"
  homepage "https://github.com/mjsarfatti/explainshell-cli"
  url "https://github.com/mjsarfatti/explainshell-cli/releases/download/v0.0.4/explainshell-cli-v0.0.4.tar.gz"
  sha256 "3a5a67a5504a286cbd4be97f1ca4fb842bf439a0aa8f39e137d5534b54e28294"
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