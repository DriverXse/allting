import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";

// The Cloudflare build plugin copies .dev.vars for local preview. Production
// artifacts must use host-managed secrets, never a developer's local files.
const root = resolve("dist");
let removed = 0;
function clean(directory) {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name);
    const inside = relative(root, file);
    if (inside.startsWith("..") || isAbsolute(inside))
      throw new Error("Refusing to clean outside the build directory.");
    const stat = lstatSync(file);
    if (stat.isSymbolicLink())
      throw new Error("Unexpected symbolic link in the build directory.");
    if (/^\.dev\.vars(?:\.|$)/.test(name) || /^\.env(?:\.|$)/.test(name)
      || (stat.isDirectory() && name === ".wrangler")) {
      rmSync(file, { recursive: stat.isDirectory(), force: false });
      removed++;
    } else if (stat.isDirectory()) clean(file);
  }
}
if (!existsSync(root)) throw new Error("Build output is missing. Run the build first.");
clean(root);
console.log(`Production artifact cleanup passed (${removed} local environment/runtime entries removed).`);
