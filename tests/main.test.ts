import { test, describe } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url"; // Added for ESM path resolution
import { getExplanation } from "../dist/main.js"; // Corrected path to compiled output

// ESM-compatible way to get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesDir = path.join(__dirname, "fixtures");

describe("explainshell-cli tests based on fixtures", async () => {
  try {
    const files = await fs.readdir(fixturesDir);
    const commandInputFiles = files.filter(
      (file) =>
        file.startsWith("command-") &&
        file.endsWith(".txt") &&
        !file.endsWith(".expected.txt")
    );

    if (commandInputFiles.length === 0) {
      console.log(
        "No command input files found in fixtures directory. Skipping tests."
      );
      return;
    }

    commandInputFiles.sort((a, b) => {
      const aNumber = parseInt(a.split("-")[1], 10);
      const bNumber = parseInt(b.split("-")[1], 10);
      return aNumber - bNumber;
    });

    for (const inputFile of commandInputFiles) {
      const testName = `Test for ${inputFile}`;
      const commandFilePath = path.join(fixturesDir, inputFile);
      const expectedOutputFilePath = path.join(
        fixturesDir,
        inputFile.replace(".txt", ".expected.txt")
      );

      test(testName, async (t) => {
        const command = (await fs.readFile(commandFilePath, "utf-8")).trim();
        let expectedOutput = "";
        try {
          expectedOutput = (
            await fs.readFile(expectedOutputFilePath, "utf-8")
          ).trim();
        } catch (error: any) {
          if (error.code === "ENOENT") {
            t.diagnostic(
              `Expected output file ${expectedOutputFilePath} not found. Skipping test.`
            );
            return; // Skip test if expected file doesn't exist
          }
          throw error; // Re-throw other errors
        }

        if (!expectedOutput) {
          t.diagnostic(
            `Expected output file ${expectedOutputFilePath} is empty. Skipping test.`
          );
          return; // Skip test if expected output is empty
        }

        try {
          const actualOutput = (await getExplanation(command)).trim();
          const actualOutputLines = actualOutput.split("\n");
          const expectedOutputLines = expectedOutput.split("\n");
          assert.strictEqual(
            actualOutputLines.length,
            expectedOutputLines.length,
            `Output for '${command}' does not match expected.`
          );
          for (let i = 0; i < actualOutputLines.length; i++) {
            assert.strictEqual(
              actualOutputLines[i].replace(/^\s+$/, ""),
              expectedOutputLines[i].replace(/^\s+$/, ""),
              `Line ${i + 1} for '${command}' does not match expected.`
            );
          }
        } catch (error: any) {
          // If getExplanation throws, and the expected output is an error message from our script
          if (
            expectedOutput.startsWith("An error occurred:") ||
            expectedOutput.startsWith("Failed to fetch explanation")
          ) {
            const actualErrorMessage =
              error instanceof Error ? error.message : String(error);
            // Normalize and compare error messages if needed, or check for specific error types/codes
            // For now, a simple substring check might suffice if errors are consistent
            // Or assert that actualOutput (which is the thrown error) contains the expected error string
            assert.ok(
              actualErrorMessage.includes(
                expectedOutput.substring(expectedOutput.indexOf(":") + 1).trim()
              ),
              `Error message for command '${command}' did not match. Expected to include: '${expectedOutput
                .substring(expectedOutput.indexOf(":") + 1)
                .trim()}', Got: '${actualErrorMessage}'`
            );
          } else {
            // If it's an unexpected error during the test for a non-error baseline
            throw error;
          }
        }
      });
    }
  } catch (err) {
    console.error("Error setting up tests:", err);
    // Optionally, make a top-level test fail if setup fails
    test("Fixture loading error", () => {
      assert.fail(err instanceof Error ? err.message : String(err));
    });
  }
});
