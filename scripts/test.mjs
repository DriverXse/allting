import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
mkdirSync(".sites-runtime", { recursive: true });
await build({
  stdin: {
    contents:
      "export {Service} from './lib/service'; export {barterText} from './lib/catalog'; export {sanitizeWebp} from './lib/uploads'; export {createAuth,ownIdentity} from './lib/auth'; export {authRequest} from './lib/auth-http'; export {safeReturnPath} from './lib/auth-navigation'; export {parseConsent,consentFromCookie,encodeConsent,CONSENT_MAX_AGE} from './lib/consent';",
    resolveDir: process.cwd(),
  },
  outfile: ".sites-runtime/test-service.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "tests/domain.test.mjs",
    "tests/auth.test.mjs",
    "tests/firebase-auth.test.mjs",
    "tests/consent.test.mjs",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
