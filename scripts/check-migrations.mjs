import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { unstable_splitSqlQuery } from "wrangler";
// Hosted D1's trigger splitter is stricter than SQLite/Wrangler's local parser.
const guards = readFileSync("drizzle/0001_domain_guards.sql");
if (guards.includes(13))
  throw new Error("Trigger migrations must use LF, not CRLF.");
if (/\bCASE\b/i.test(guards.toString("utf8")))
  throw new Error("Use SELECT RAISE(...) WHERE guards in hosted triggers.");
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
let count = 0;
for (const file of readdirSync("drizzle")
  .filter((x) => x.endsWith(".sql"))
  .sort())
  for (const sql of unstable_splitSqlQuery(
    readFileSync(`drizzle/${file}`, "utf8"),
  )) {
    db.exec(sql);
    count++;
  }
console.log(
  `${count} migration statements passed the Wrangler parser and SQLite execution.`,
);
db.close();
