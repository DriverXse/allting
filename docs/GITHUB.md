# Publish the source on GitHub

Suggested repository name: **allting**

Suggested description:

> Mobile-first Swedish barter marketplace with verified email accounts, item matching, multi-item trade proposals and private messaging. Built with React, TypeScript and Cloudflare Workers. MIT licensed.

Suggested topics:

`barter`, `swapping`, `marketplace`, `swedish`, `mobile-first`, `typescript`,
`react`, `cloudflare-workers`, `cloudflare-d1`, `firebase-auth`, `pwa`

## Before uploading

1. Use this sanitized source directory or a freshly extracted source ZIP.
2. Run `npm run scan:release`. Include the English guides, LICENSE, lockfile,
   schema/migrations, source, tests, public brand assets and `.github` workflow.
3. Exclude `.git`, `node_modules`, `dist`, `.dev.vars`, `.env`, `wrangler.json`,
   `.wrangler`, `.sites-runtime`, account exports, photos, logs and screenshots.
4. Keep the blank templates, `AGENTS.md` and `AI-AGENT.md`. Example test addresses
   use reserved domains and do not identify real people.

## Create a new repository

On GitHub, create a new repository under your own account with your chosen
visibility. For public open source, choose Public. If using the Git commands below,
create it empty: this source already includes README and LICENSE.

In a **clean extracted source directory**, run:

```sh
git init
git add .
git diff --cached --stat
git diff --cached
git commit -m "Initial open-source release"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USER/allting.git
git push -u origin main
```

Replace `YOUR_GITHUB_USER` with your actual account/organization; the example URL
is not a configured remote. Review staged content before committing and never
reuse a private deployment repository's history. Prefer a fresh extraction before
`git add .` so no later runtime data is accidentally included.

After publication, add the description/topics, enable private vulnerability
reporting and review the CI run. The included CI installs/checks/builds only; it
does not deploy, grant admin rights or access production secrets.

You may attach the source ZIP to a versioned GitHub release with the archive's
SHA-256 checksum. Do not attach a working installation, database backup or build
containing deployment secrets. Add your public repository URL to package metadata
after it exists; this export intentionally contains no owner's GitHub identity.
