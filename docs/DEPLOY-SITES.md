# Deploy a new installation on Sites

This distribution is local-only and has no Sites project ID. It must be registered
as a **new Site owned by the person deploying it**. Never reuse a project ID,
source repository, audience policy, secret or bearer token from another installation.
The deployed marketplace uses its own email accounts; visitors do not need ChatGPT.
The operator needs access to a Sites-capable Codex/ChatGPT environment for deployment.

## Operator steps

1. Extract `allting`, open the directory in your coding environment, and provide
   `AI-AGENT.md` and `README.md` to your assistant.
2. Ask it to create a **new Sites installation from this source**. Confirm the
   destination/ownership and public audience. Public browsing is intentional;
   private actions remain protected by AllTing authentication.
3. Create your own Firebase project and enable Email/Password as explained in
   [AUTH.md](AUTH.md). Keep the project ID and web API key available privately.
4. When Sites returns the new HTTPS origin, add its hostname to Firebase Authorized
   domains. No owned domain or email-sending domain is needed for Firebase mode.
5. In the new Site's server environment configure `ALLTING_ORIGIN`,
   `ALLTING_AUTH_METHOD=password`, `FIREBASE_PROJECT_ID`, secret `FIREBASE_API_KEY`,
   and a newly generated secret `BETTER_AUTH_SECRET`. Optionally authorize your
   verified staff account through private `ADMIN_EMAIL`.
6. Let the assistant run checks, package the matching build, save a version and
   publish it. Sites applies the included database migrations and binds D1/R2.
7. Test the published origin while signed out and with separate AllTing accounts.
   Follow [RELEASE.md](RELEASE.md). Confirm real verification/reset mail delivery.

Do not paste credentials into public chat exports, GitHub issues or repository
files. Use host secret entry/connector fields when available. If the required
Sites tools or account access are missing, stop at a local verified build and
state the missing access; do not invent a Site URL or call a different host equivalent.

## Instructions for a Sites-aware assistant

- Read the installed Sites skill and follow its **current supported workflow**.
  Tool names and helper locations are environment-dependent. Do not hardcode
  a previous operator's filesystem path, repository credential or project ID.
- Run `npm ci`, `npm run setup:local` and the checks from README. Local mailbox
  credentials are not production credentials. Do not upload `.dev.vars`.
- The source `.openai/hosting.example.json` declares `DB` and `BUCKET` only.
  Copy it to `.openai/hosting.json` if needed. Persist the exact project ID returned
  by new-site registration using the supported helper; never fabricate one.
- The public repository ignores the per-installation manifest. In a separate
  private Sites deployment checkout, follow the skill's requirement to track its
  own manifest (adjust that ignore entry if needed). Never push that identity
  back to this public source distribution.
- Keep `sites()` in `vite.config.ts`: its build hook writes `dist/.openai/hosting.json`
  and the immutable migration directory used by Sites. The Worker and assets
  are generated in `dist/server` and `dist/client`.
- Keep the complete `npm run build` command, including `clean-build.mjs`. Check
  the packaged output contains no `.dev.vars` or `.env` files. Runtime secrets
  belong in the new Site's environment, not in its source or ZIP.
- Configure D1/R2 through the logical manifest bindings. The placeholder local
  database UUID is not a hosted database identity. Sites provisions hosted storage.
- Store runtime settings via the Sites environment API. Keep source credentials
  in memory and pass them through the source helper's hidden stdin.
- Use the current source workflow to commit/push the exact sanitized source state,
  run the build and package output. Save the archive against that exact commit,
  then deploy the returned saved version. Never package `.git` or runtime state.
- Use native access controls to make the new Site public only when the operator
  authorizes this intended marketplace audience. Do not turn on ChatGPT sign-in
  as AllTing's normal account flow.
- Publish once, retain version/deployment IDs and inspect status until terminal.
  A failed publication may already have applied migrations: inspect before retrying.
- Environment-variable changes require another deployment to take effect. Keep
  stable session secrets; do not rotate or replace existing staff privileges during
  unrelated changes.

For an existing installation, open its correct source using the skill's source
helper before editing and preserve its project identity and access configuration.
This public source package itself must remain free of that installation's identity.
