# explainshell-cli.rb
class ExplainshellCli < Formula
  desc "Explain shell commands using explainshell.com"
  homepage "https://github.com/mjsarfatti/explainshell-cli"
  url "https://github.com/mjsarfatti/explainshell-cli/archive/v0.1.0.tar.gz"
  sha256 "CHECKSUM_OF_THE_TARBALL"
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