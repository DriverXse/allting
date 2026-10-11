import { randomBytes } from "node:crypto";
import { existsSync, copyFileSync, writeFileSync, mkdirSync } from "node:fs";

function copyIfMissing(source, target) {
  if (!existsSync(target)) copyFileSync(source, target);
}
mkdirSync(".openai", { recursive: true });
copyIfMissing(".openai/hosting.example.json", ".openai/hosting.json");
copyIfMissing("wrangler.example.json", "wrangler.json");
if (!existsSync(".dev.vars")) {
  writeFileSync(".dev.vars", [
    "# Local development only. Do not commit, share or deploy this file.",
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
    "ALLTING_AUTH_METHOD=magic-link",
    "ALLTING_ORIGIN=http://127.0.0.1:5173",
    "ADMIN_EMAIL=",
    "",
  ].join("\n"), { flag: "wx", mode: 0o600 });
}
console.log("Local configuration is ready. Existing files were preserved. No credentials were printed.");
console.log("Next: npm run db:migrate:local; then start npm run mail:local and npm run dev in separate terminals.");
