# explainshell-cli.rb
class ExplainshellCli < Formula
  desc "Explain shell commands using explainshell.com"
  homepage "https://github.com/mjsarfatti/explainshell-cli" # Replace with your repo URL
  url "https://github.com/mjsarfatti/explainshell-cli/archive/v0.1.0.tar.gz" # URL to the release tarball
  sha256 "CHECKSUM_OF_THE_TARBALL" # Will be calculated after you create a release
  license "ISC" # Or your chosen license

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