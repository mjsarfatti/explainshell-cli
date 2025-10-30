#!/usr/bin/env tsx

import fs from "fs";
import { execSync } from "child_process";
import crypto from "crypto";
import readline from "readline";

function exec(command: string, options: Record<string, any> = {}): void {
  console.log(`\n→ ${command}`);
  execSync(command, { stdio: "inherit", ...options });
}

function getOutput(command: string): string {
  return execSync(command, { encoding: "utf-8" }).toString().trim();
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptMultiline(message: string): Promise<string> {
  console.log(message);
  console.log("(Enter a blank line to finish)\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const lines: string[] = [];
    rl.on("line", (line) => {
      if (line === "" && lines.length > 0) {
        rl.close();
        resolve(lines.join("\n"));
      } else if (line !== "") {
        lines.push(line);
      }
    });
  });
}

async function release(): Promise<void> {
  try {
    // Get current version
    const pkgContent = fs.readFileSync("./package.json", "utf-8");
    const pkg = JSON.parse(pkgContent);
    const version = pkg.version as string;
    const tarballName = `explainshell-cli-v${version}.tar.gz`;
    const githubRepo = "mjsarfatti/explainshell-cli";

    console.log(`\n📦 Releasing version ${version}\n`);

    // 0. Get release notes
    console.log("0️⃣ Release Notes");
    const releaseNotes = await promptMultiline(
      "Enter release notes for this version:"
    );

    if (!releaseNotes.trim()) {
      console.log("\n⚠️  No release notes provided. Aborting release.");
      process.exit(1);
    }

    console.log("\n✓ Release notes saved");

    // Save release notes to file
    const releaseNotesFile = `RELEASE_NOTES.md`;
    let releaseNotesContent = "";
    if (fs.existsSync(releaseNotesFile)) {
      releaseNotesContent = fs.readFileSync(releaseNotesFile, "utf-8");
    }

    const newEntry = `## v${version} (${
      new Date().toISOString().split("T")[0]
    })\n\n${releaseNotes}\n\n---\n\n`;
    fs.writeFileSync(releaseNotesFile, newEntry + releaseNotesContent);

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

    // 6. Review changes
    console.log("\n6️⃣ Review changes...");
    exec("git diff package.json explainshell-cli.rb RELEASE_NOTES.md");

    const confirm = await prompt("\nProceed with commit and push? (y/N): ");
    if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
      console.log("\n⚠️  Release aborted by user.");
      process.exit(0);
    }

    // 7. Commit changes
    console.log("\n7️⃣ Committing changes...");
    exec(
      "git add package.json package-lock.json explainshell-cli.rb RELEASE_NOTES.md"
    );
    exec(`git commit -m "Release v${version}\n\n${releaseNotes}"`);

    // 8. Create git tag
    console.log("\n8️⃣ Creating git tag...");
    exec(`git tag -a v${version} -m "Release v${version}\n\n${releaseNotes}"`);

    // 9. Push to GitHub
    console.log("\n9️⃣ Pushing to GitHub...");
    exec("git push origin main");
    exec("git push origin --tags");

    // 10. Create GitHub release
    console.log("\n🔟 Creating GitHub release...");

    // Check if gh CLI is available
    try {
      getOutput("which gh");

      // Save release notes to a temp file for gh
      const tempNotesFile = ".release-notes-temp.md";
      fs.writeFileSync(tempNotesFile, releaseNotes);

      exec(
        `gh release create v${version} ${tarballName} --title "v${version}" --notes-file ${tempNotesFile}`
      );

      // Clean up temp file
      fs.unlinkSync(tempNotesFile);

      console.log("   ✓ GitHub release created");
    } catch (error) {
      console.log(
        "\n⚠️  GitHub CLI (gh) not found. Please create the release manually:"
      );
      console.log(`   1. Go to https://github.com/${githubRepo}/releases/new`);
      console.log(`   2. Tag: v${version}`);
      console.log(`   3. Upload ${tarballName}`);
      console.log(`   4. Release notes:\n`);
      console.log(releaseNotes);
      console.log(`\n   5. Publish release`);
      console.log(
        "\nℹ️  For next time, you can install the GitHub CLI with `brew install gh`"
      );
    }

    console.log("\n✅ Release complete!");
    console.log(`\nVersion: ${version}`);
    console.log(`Tarball: ${tarballName}`);
    console.log(`SHA256: ${sha256}`);
    console.log(
      `\nView release: https://github.com/${githubRepo}/releases/tag/v${version}`
    );
  } catch (error) {
    console.error("\n❌ Release failed:", (error as Error).message);
    process.exit(1);
  }
}

release();
