#!/usr/bin/env node

import axios from "axios";
import * as cheerio from "cheerio";

interface CommandPart {
  text: string; // This will be the command segment with "..." for expansions
  helpref?: string;
  expansion?: {
    originalText: string; // The actual text of the command being expanded
    link: string;
  };
}

interface ParsedExplanation {
  commandParts: CommandPart[];
  helpTexts: Map<string, string>; // Map helpref ID to help text
}

async function fetchExplanationHTML(command: string): Promise<string> {
  const query = encodeURIComponent(command);
  const url = `https://explainshell.com/explain?cmd=${query}`;
  try {
    const { data } = await axios.get(url);
    return data;
  } catch (error) {
    let errorMessage = `Failed to fetch explanation from ${url}`;
    if (axios.isAxiosError(error)) {
      errorMessage += `: ${error.message}`;
    } else if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    } else {
      errorMessage += `: ${String(error)}`;
    }
    throw new Error(errorMessage); // Throw error instead of exiting
  }
}

function clean(text: string): string {
  return text
    .replace(/\(1\)/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHTML(html: string): ParsedExplanation {
  const $ = cheerio.load(html);
  const commandParts: CommandPart[] = [];
  const helpTexts = new Map<string, string>();

  // Extract help texts
  $("pre.help-box").each((_i, el) => {
    const id = $(el).attr("id");
    const text = $(el).text().trim();
    if (id) {
      helpTexts.set(id, text);
    }
  });

  // Extract command parts from div#command
  $("div#command [helpref]").each((_i, el) => {
    const element = $(el);
    let computedCommandText = ""; // This will become part.text, with "..." for expansions
    let identifiedExpansionForSegment: CommandPart["expansion"] | undefined =
      undefined;

    element.contents().each((_idx, node) => {
      if (node.type === "text") {
        computedCommandText += $(node).text();
      } else if (node.type === "tag") {
        const tagNode = $(node);
        if (tagNode.is("span") && tagNode.hasClass("expansion-substitution")) {
          const expansionLinkTag = tagNode.find("a");
          if (expansionLinkTag.length > 0) {
            const originalExpansionText = clean(expansionLinkTag.text());
            let href = expansionLinkTag.attr("href");
            if (href) {
              if (href.startsWith("/")) {
                href = `https://explainshell.com${href}`;
              }
              identifiedExpansionForSegment = {
                originalText: originalExpansionText,
                link: href,
              };
            }
            computedCommandText += originalExpansionText;
          }
        } else {
          computedCommandText += tagNode.text();
        }
      }
    });

    const part: CommandPart = {
      text: clean(computedCommandText),
      helpref: element.attr("helpref"),
    };

    // Priority to identifiedExpansionForSegment (from span.expansion-substitution)
    if (identifiedExpansionForSegment) {
      part.expansion = identifiedExpansionForSegment;
    }
    // Fallback: If no expansion-substitution, check for a direct <a> link on the element itself
    // This is for cases like <span helpref="foo"><a href="link">CommandName</a></span>
    else {
      const directLink = element.children("a").first(); // Check for a direct child <a>
      if (directLink.length > 0) {
        const originalText = clean(directLink.text());
        let href = directLink.attr("href");
        if (href) {
          if (href.startsWith("/")) {
            href = `https://explainshell.com${href}`;
          }
          part.expansion = { originalText: originalText, link: href };
        }
      }
    }
    // The old fallback for deepExpansionElement might be redundant or could be merged if needed,
    // but the two primary cases are direct expansion-substitutions or a direct link on the helpref element.

    if (part.text || (part.expansion && part.expansion.originalText)) {
      commandParts.push(part);
    }
  });

  return { commandParts, helpTexts };
}

interface HelpGroupData {
  commandTexts: string[];
  expansionLinks: Set<string>; // Use Set for unique links
  firstAppearanceIndex: number;
  helpId: string;
}

function formatOutput(parsedData: ParsedExplanation): string {
  const helpDataMap = new Map<string, HelpGroupData>();

  // 1. Group command parts by helpref and collect data
  parsedData.commandParts.forEach((part, index) => {
    if (!part.helpref) return; // Skip parts without helpref for grouping

    if (!helpDataMap.has(part.helpref)) {
      helpDataMap.set(part.helpref, {
        commandTexts: [],
        expansionLinks: new Set<string>(),
        firstAppearanceIndex: index,
        helpId: part.helpref,
      });
    }

    const group = helpDataMap.get(part.helpref)!;

    if (part.text && part.text.trim() !== "") {
      group.commandTexts.push(part.text.trim());
    }

    if (part.expansion && part.expansion.originalText && part.expansion.link) {
      const expansionString = `    [ ${part.expansion.originalText} -> ${part.expansion.link} ]`;
      group.expansionLinks.add(expansionString);
    }
  });

  // 2. Sort help groups by their first appearance index
  const sortedGroups = Array.from(helpDataMap.values()).sort(
    (a, b) => a.firstAppearanceIndex - b.firstAppearanceIndex
  );

  // 3. Format the output
  let output = "";
  sortedGroups.forEach((group) => {
    // Join command texts for this group
    if (group.commandTexts.length > 0) {
      output += group.commandTexts.join(" [...] ") + "\n\n";
    }

    // Add help text
    const helpText = parsedData.helpTexts.get(group.helpId);
    if (helpText) {
      const indentedHelp = helpText
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      output += indentedHelp + "\n\n";
    }

    // Add expansion links
    if (group.expansionLinks.size > 0) {
      group.expansionLinks.forEach((link) => {
        output += link + "\n";
      });
      output += "\n"; // Extra newline after all expansions for a group
    }
  });

  return output.trim();
}

export async function getExplanation(
  commandToExplain: string
): Promise<string> {
  const html = await fetchExplanationHTML(commandToExplain);
  // No specific !html check needed here as fetchExplanationHTML will throw on failure
  const parsedData = parseHTML(html);
  return formatOutput(parsedData);
}

async function mainCli() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: explainshell-cli <command_to_explain>");
    console.log('Example: explainshell-cli "ls -la | grep .ts"');
    process.exit(1);
  }
  const commandToExplain = args.join(" ");
  // console.log(`Fetching explanation for: \\"${commandToExplain}\\"...\\n`); // This was the original log line. Keep or remove as per preference.

  try {
    const output = await getExplanation(commandToExplain);
    console.log(output);
  } catch (error) {
    // Log the error message from the thrown error
    console.error(
      "An error occurred:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Conditionally run mainCli only if the script is executed directly
// (ESM way to check if module is main)
// Resolve paths to be robust
const scriptPath = new URL(import.meta.url).pathname;
const executedScriptPath = process.argv[1];

if (executedScriptPath === scriptPath) {
  mainCli();
}
