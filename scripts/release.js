#!/usr/bin/env node

const fs = require("fs");
const { execSync } = require("child_process");
const crypto = require("crypto");

function exec(command, options = {}) {
  console.log(`\n→ ${command}`);
  return execSync(command, { stdio: "inherit", ...options });
}

function getOutput(command) {
  return execSync(command, { encoding: "utf-8" }).trim();
}

async function release() {
  try {
    // Get current version
    const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
    const version = pkg.version;
    const tarballName = `explainshell-cli-v${version}.tar.gz`;
    const githubRepo = "mjsarfatti/explainshell-cli";

    console.log(`\n📦 Releasing version ${version}`);

    // 1. Run tests
    console.log("\n1️⃣ Running tests...");
    exec("npm test");

    // 2. Build
    console.log("\n2️⃣ Building...");
    exec("npm run build");

    // 3. Create tarball
    console.log("\n3️⃣ Creating tarball...");
    exec(
      `tar -czf ${tarballName} --exclude=node_modules --exclude=.git --exclude=tests --exclude='*.tar.gz' --exclude='.DS_Store' .`
    );

    // 4. Calculate SHA256
    console.log("\n4️⃣ Calculating SHA256...");
    const fileBuffer = fs.readFileSync(tarballName);
    const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    console.log(`   SHA256: ${sha256}`);

    // 5. Update Homebrew formula
    console.log("\n5️⃣ Updating Homebrew formula...");
    let formula = fs.readFileSync("explainshell-cli.rb", "utf-8");
    formula = formula.replace(
      /url\s+"[^"]+"/,
      `url "https://github.com/${githubRepo}/releases/download/v${version}/${tarballName}"`
    );
    formula = formula.replace(/sha256\s+"[^"]+"/, `sha256 "${sha256}"`);
    fs.writeFileSync("explainshell-cli.rb", formula);
    console.log("   ✓ Updated explainshell-cli.rb");

    // 6. Commit changes
    console.log("\n6️⃣ Committing changes...");
    exec("git add package.json package-lock.json explainshell-cli.rb");
    exec(`git commit -m "Release v${version}"`);

    // 7. Create git tag
    console.log("\n7️⃣ Creating git tag...");
    exec(`git tag -a v${version} -m "Release v${version}"`);

    // 8. Push to GitHub
    console.log("\n8️⃣ Pushing to GitHub...");
    exec("git push origin main");
    exec("git push origin --tags");

    // 9. Create GitHub release
    console.log("\n9️⃣ Creating GitHub release...");

    // Check if gh CLI is available
    try {
      getOutput("which gh");
      exec(
        `gh release create v${version} ${tarballName} --title "v${version}" --notes "Release v${version}"`
      );
      console.log("   ✓ GitHub release created");
    } catch (error) {
      console.log(
        "\n⚠️  GitHub CLI (gh) not found. Please create the release manually:"
      );
      console.log(`   1. Go to https://github.com/${githubRepo}/releases/new`);
      console.log(`   2. Tag: v${version}`);
      console.log(`   3. Upload ${tarballName}`);
      console.log(`   4. Publish release`);
      console.log(
        "\nℹ️  For next time, you can install the GitHub CLI with `brew install gh`"
      );
    }

    console.log("\n✅ Release complete!");
    console.log(`\nVersion: ${version}`);
    console.log(`Tarball: ${tarballName}`);
    console.log(`SHA256: ${sha256}`);
  } catch (error) {
    console.error("\n❌ Release failed:", error.message);
    process.exit(1);
  }
}

release();
