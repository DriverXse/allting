import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join, relative } from "node:path";

const strict = process.argv.includes("--strict");
const root = process.cwd();
const ignoredDirectories = new Set(["node_modules", "dist", ".next", ".vinext", ".wrangler", ".sites-runtime", ".git", "coverage", "test-results", "playwright-report"]);
const findings = [];
let checked = 0;
const forbiddenPath = /(?:^|\/)(?:test-user\.txt|wrangler\.json|\.dev\.vars[^/]*|\.env(?!\.example$)[^/]*|[^/]+\.(?:sqlite(?:-wal|-shm)?|db|pem|key|log|zip))$/i;
const textExtensions = /\.(?:ts|tsx|mts|mjs|js|json|jsonc|md|sql|css|html|svg|yml|yaml|txt|webmanifest|LICENSE)$/i;
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}\b/],
  ["provider token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|re_[A-Za-z0-9]{25,})\b/],
  ["deployment identity", /\bappg(?:prj|ver|dep)_[a-f0-9]{20,}\b/],
  ["personal absolute path", /\b[A-Z]:[\\/](?:Users|Projects)[\\/][^\s"']+/i],
];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const full = join(directory, name), path = relative(root, full).replaceAll("\\", "/"), stat = lstatSync(full);
    if (stat.isSymbolicLink()) { findings.push({path, reason:"symbolic link requires review"}); continue; }
    if (stat.isDirectory()) {
      if (ignoredDirectories.has(name)) {
        if (strict) findings.push({path, reason:"runtime/history/dependency directory in source archive"});
      } else walk(full);
      continue;
    }
    if (forbiddenPath.test(path)) {
      if (strict) findings.push({path, reason:"private/runtime file in source archive"});
      continue;
    }
    checked++;
    if (!(textExtensions.test(name) || !name.includes(".") || name.startsWith("."))) continue;
    const content = readFileSync(full, "utf8");
    for (const [reason, regex] of patterns) if (regex.test(content)) findings.push({path, reason});
    for (const address of content.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []) {
      const domain = address.split("@").at(-1).toLowerCase();
      if (!(domain === "example.com" || domain.endsWith(".test") || domain.endsWith(".invalid"))) {
        findings.push({path, reason:"non-example email address requires private review"});
        break;
      }
    }
  }
}
walk(root);
if (findings.length) {
  // Report categories/paths only; never print a matched credential or address.
  console.error(JSON.stringify({checked, findings}, null, 2));
  process.exitCode = 1;
} else console.log(`Release scan passed: ${checked} files; no matched credentials, deployment IDs or non-example emails. ${strict ? "Strict archive mode." : "Runtime files were excluded; use --strict on a fresh source-only extraction."}`);
