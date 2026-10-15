import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const USERNAME = "tacxou";
const START = "<!-- profile-stats:scope:start -->";
const END = "<!-- profile-stats:scope:end -->";

export function cardOptions(locale, mode, kind) {
  const accent = mode === "dark" ? "66e0cb" : "087f6d";
  return {
    username: USERNAME,
    locale,
    role: "OWNER,ORGANIZATION_MEMBER,COLLABORATOR",
    hide_border: "true",
    border_radius: "12",
    disable_animations: "true",
    theme: mode === "dark" ? "github_dark" : "default",
    title_color: accent,
    ...(kind === "stats"
      ? {
          show_icons: "true",
          icon_color: accent,
          include_all_commits: "true",
          contribs_include_own_repos: "true",
          number_format: "long",
          card_width: "520",
          text_bold: "false",
        }
      : { layout: "compact", langs_count: "8", card_width: "350" }),
  };
}

function validateCard(result) {
  // Never propagate upstream errors: they may contain API responses or repo names.
  if (result?.status !== "success" || typeof result.content !== "string") {
    throw new Error("Card generation failed; existing cards were kept. Check token access or retry later.");
  }
  const svg = result.content;
  if (
    svg.length > 1_000_000 ||
    !/^\s*<svg\b/.test(svg) ||
    !svg.includes('xmlns="http://www.w3.org/2000/svg"') ||
    /<script\b|<foreignObject\b|<!ENTITY|<!DOCTYPE|\bon\w+\s*=/i.test(svg)
  ) {
    throw new Error("Invalid card output; existing cards were kept.");
  }
  return svg;
}

function scopeNote(locale, privateAccess) {
  if (locale === "fr") {
    return privateAccess
      ? "Activité personnelle et en organisation, y compris les dépôts privés accessibles. Seuls des chiffres agrégés sont affichés ; les langages reflètent le volume de code des dépôts."
      : "Activité publique personnelle et en organisation. Les dépôts privés ne sont pas inclus ; les langages reflètent le volume de code des dépôts.";
  }
  return privateAccess
    ? "Personal and organization activity, including accessible private repositories. Only aggregate statistics are shown; languages reflect repository code volume."
    : "Public activity across personal and organization repositories. Private repositories are not included; languages reflect repository code volume.";
}

export async function refreshProfile({ root, token, privateAccess, statsApi, languageApi }) {
  const updates = [];
  for (const locale of ["en", "fr"]) {
    for (const mode of ["dark", "light"]) {
      for (const [kind, handler] of [["stats", statsApi], ["languages", languageApi]]) {
        let result;
        try {
          result = await handler(cardOptions(locale, mode, kind), token);
        } catch {
          throw new Error("GitHub data could not be fetched; existing cards were kept.");
        }
        updates.push({
          file: path.join(root, "assets", "stats", `${kind}-${locale}-${mode}.svg`),
          content: validateCard(result),
        });
      }
    }
    const file = path.join(root, locale === "en" ? "README.md" : "README.fr.md");
    const readme = await readFile(file, "utf8");
    const start = readme.indexOf(START);
    const end = readme.indexOf(END);
    if (start < 0 || end < start) throw new Error("README statistics markers are missing.");
    updates.push({
      file,
      content: readme.slice(0, start) + START +
        `\n<p align="center"><sub>${scopeNote(locale, privateAccess)}</sub></p>\n` +
        readme.slice(end),
    });
  }
  // Fetch and validate all eight cards before changing any published file.
  // The workflow commits this complete set only if every step succeeds.
  await mkdir(path.join(root, "assets", "stats"), { recursive: true });
  for (const { file, content } of updates) await writeFile(file, content);
}

async function main() {
  const privateToken = process.env.PROFILE_STATS_TOKEN?.trim();
  const token = privateToken || process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("A GitHub token is required. Run this through GitHub Actions.");

  if (privateToken) {
    // Reject a token belonging to a different account, without logging its identity.
    const response = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("PROFILE_STATS_TOKEN was rejected. Check its validity and permissions.");
    const account = await response.json();
    if (account.login?.toLowerCase() !== USERNAME) {
      throw new Error("PROFILE_STATS_TOKEN must belong to the profile owner.");
    }
  }

  const core = await import("@stats-organization/github-readme-stats-core");
  // Upstream debug logs can contain API responses: keep those out of public logs.
  core.logger.log = () => {};
  core.logger.error = () => {};
  await refreshProfile({
    root: ROOT,
    token,
    privateAccess: Boolean(privateToken),
    statsApi: core.api,
    languageApi: core.topLangs,
  });

  const message = privateToken
    ? "Updated 8 cards using the dedicated token. Coverage is limited to repositories it can access."
    : "Updated 8 public-data cards. Add PROFILE_STATS_TOKEN to include accessible private repositories.";
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, message + "\n");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Only our own fixed messages may reach the public workflow log.
    const message = error instanceof Error && /^(Card generation|Invalid card|GitHub data|README statistics|A GitHub token|PROFILE_STATS_TOKEN)/.test(error.message)
      ? error.message
      : "Statistics update failed; existing cards were kept. Check access or retry later.";
    console.error(message);
    process.exitCode = 1;
  });
}
