// Adapted from @openai/sites-vite-plugin 0.2.0; MIT license retained alongside.
// AllTing uses its own authentication; this plugin only packages Sites metadata.
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function sites(): Plugin {
  let root = process.cwd();
  let command = "serve";
  return {
    name: "allting-sites-metadata",
    configResolved(config) {
      root = config.root;
      command = config.command;
    },
    async closeBundle() {
      if (command !== "build") return;
      const destination = resolve(root, "dist", ".openai");
      await mkdir(destination, { recursive: true });
      await cp(resolve(root, ".openai/hosting.json"), resolve(destination, "hosting.json"));
      await cp(resolve(root, "drizzle"), resolve(destination, "drizzle"), { recursive: true });
    },
  };
}
