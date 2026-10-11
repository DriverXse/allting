# Deploy directly to Cloudflare

This route uses your own Cloudflare account and does not require Sites or ChatGPT.
The tested project uses the pinned Wrangler-based Workers integration. Do not
replace it with a newer Vinext initializer without testing a deliberate migration.

## 1. Install and prepare

Extract the source, install Node.js 22.13+ and run:

```sh
npm ci
npm run setup:local
npx wrangler login
```

Login opens the official Cloudflare account authorization flow. Confirm which
account you are using before creating resources. `wrangler.json` is your ignored
installation configuration; never upload it with private runtime settings.

## 2. Create fresh storage

```sh
npx wrangler d1 create allting
npx wrangler r2 bucket create allting-uploads
```

Copy the returned database ID into `wrangler.json` under `d1_databases[0]`.
Keep the binding name `DB` and database name `allting`. Keep the R2 binding
`BUCKET` and set the actual bucket name. Use an empty database and private bucket;
do not import anyone else's users, sessions or photos. A host may require account
activation for R2; that is an operator setup requirement, not an app feature.

## 3. Choose the origin and authentication

Choose a Worker name in `wrangler.json`. Find your workers.dev subdomain in the
Cloudflare dashboard. Set `vars.ALLTING_ORIGIN` to the actual complete origin,
for example `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev` (replace both parts).
Do not add a path, query or trailing slash. An owned domain is optional.

Follow [AUTH.md](AUTH.md) to create your own Firebase project. In `wrangler.json`,
set `ALLTING_AUTH_METHOD=password` and your `FIREBASE_PROJECT_ID`.
Add the exact production hostname to Firebase Authorized domains.

## 4. Store new secrets

Generate a fresh cryptographic secret in a password manager or locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep the output private and paste it into the interactive prompt:

```sh
npx wrangler secret put BETTER_AUTH_SECRET --config wrangler.json
npx wrangler secret put FIREBASE_API_KEY --config wrangler.json
npx wrangler secret put ADMIN_EMAIL --config wrangler.json
```

`ADMIN_EMAIL` is optional and must be the verified address of the account you
intend to authorize. It is one address, not a comma-separated list. Secret values
must not go in command arguments, Git, source files, screenshots or issues.
For magic-link mode, use the Resend settings in AUTH.md instead of Firebase.
Wrangler may offer to create the Worker while adding its first secret; verify
the exact Worker name and account before accepting. Preserve these secrets on
subsequent deployments. `.dev.vars` is never a production credential source.

## 5. Validate, migrate, build and publish

```sh
npm run check:deploy
npm run typecheck
npm run lint
npm test
npm run check:migrations
npm run db:migrate:remote
npm run deploy
```

Review Wrangler's migration confirmation carefully. The remote command modifies
your production database. The first installation applies all six migrations;
later installations apply only pending migrations. Never edit an applied file.
`npm run deploy` builds the Worker and deploys `dist/server/wrangler.json`,
including generated assets. Do not deploy the raw TypeScript entrypoint instead.
The deployment command publishes real production traffic; it is not a preview.
The build's final cleanup removes any copied local environment files. Do not
bypass it: production secrets are supplied by Cloudflare, not by `.dev.vars`.

## 6. Verify

Open the returned HTTPS address in a signed-out browser. Follow the full checklist
in [RELEASE.md](RELEASE.md), including real email verification, image upload,
two separate accounts and a third unauthorized account. Check **Profil →
Moderering** only with the authorized staff account.

For a custom domain, attach it to this Worker, update `ALLTING_ORIGIN`, add its
hostname to Firebase and redeploy. Re-test verification and password-reset links.

## Maintenance

Back up D1 and R2 in private operator storage; do not put backups in source ZIPs.
Test restores. Monitor provider quotas, email delivery and moderation reports.
Before an upgrade, back up data, test migrations locally, and deploy the same
verified source/build. Restore code and data deliberately; reverting a Worker
does not automatically roll back applied SQL or restore uploaded objects.

References: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/),
[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[R2 bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/).
