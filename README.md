# AllTing

A mobile-first Swedish marketplace for exchanging things with other people.
Offer one or several items, find reciprocal matches, send a proposal, negotiate
a counteroffer, agree in a private conversation, and confirm the completed swap.
There are no prices, payments or monetary valuations.

**License:** MIT. **Interface:** Swedish. **Documentation:** English.
This source distribution contains no operator accounts, existing users, uploaded
photos, databases, real credentials, Git history or preconfigured live services.
You create and control your own installation.

## What is included

- Public browsing, listings with 1–6 photos, inventory, search and filters.
- Verified email accounts, short onboarding and private profile settings.
- Fixed 5/15/50 km search radii, with 15 km as the default.
- Reciprocal matching, multi-item proposals, counteroffers and trade history.
- Atomic reservations, private messaging, completion by both parties and ratings.
- Private favorites, saved searches, in-app alerts, reporting and blocking.
- Protected moderation, suspension/reactivation and an audit log.
- Light/dark/system appearance, optional cookie consent and a generic offline page.

## Hosting requirements

The current implementation runs on **Cloudflare Workers with D1 and R2**.
Sites provisions these services for a Sites installation. You can alternatively
deploy directly to your own Cloudflare account without Sites or a ChatGPT account.
Firebase Authentication supplies verified email/password accounts in the default
production setup. An alternative Resend magic-link setup is also implemented.

This is a server application, not a static ZIP that can be uploaded by FTP.
GitHub Pages and PHP-only/shared static hosting cannot run it as-is. A different
runtime requires the adapters described in [Other hosts](docs/OTHER-HOSTS.md).
The pinned Vinext and Cloudflare integration is retained; do not run a framework
initializer over the project or silently upgrade its deployment stack.

## Start locally in five steps

Install **Node.js 22.13 or newer** and npm. Unzip the archive, open a terminal in
the `allting` directory and run:

```sh
npm ci
npm run setup:local
npm run db:migrate:local
```

Leave this command running in a second terminal:

```sh
npm run mail:local
```

In the first terminal, start the app:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. Use this exact address, rather than `localhost`,
because origin checks deliberately use the exact local origin.

The local default is a passwordless development mailbox. Enter a fictional
address such as `tester@example.test` in the app. Open
`http://127.0.0.1:8025/mail?email=tester%40example.test`, copy the returned `url`,
open it in the same browser and confirm sign-in. No real email is sent.
The mailbox binds only to loopback and is never included in the Worker build.
Do not expose the development server or mailbox to the Internet.

`setup:local` generates a new random local session secret and preserves existing
configuration. The database starts empty. The optional `npm run seed:local`
command generates fictional development records and placeholder images only in
local storage. It is never a production setup step.

## Publish your own installation

1. [Set up your own Firebase project](docs/AUTH.md).
2. Choose [Sites](docs/DEPLOY-SITES.md) or [direct Cloudflare](docs/DEPLOY-CLOUDFLARE.md).
3. Configure the exact production origin, new session secret and authentication
   settings in that host. Never copy `.dev.vars` into production.
4. Apply the included migrations to your new empty database.
5. Run the [release checks](docs/RELEASE.md) and verify real email delivery.

An owned domain is optional: the host's generated HTTPS address is sufficient.
End users create AllTing accounts with their own email; ChatGPT login is not the
end-user authentication method.

## Required production settings

| Setting | Purpose |
| --- | --- |
| `DB` binding | Your D1 relational database. |
| `BUCKET` binding | Your private R2 image bucket. |
| `ALLTING_ORIGIN` | Exact HTTPS origin, with no path; use your host's actual URL. |
| `ALLTING_AUTH_METHOD` | `password` for Firebase; `magic-link` for Resend. |
| `BETTER_AUTH_SECRET` | New cryptographically random secret, at least 32 bytes; keep stable. |
| `FIREBASE_PROJECT_ID` | Your own Firebase project ID for password mode. |
| `FIREBASE_API_KEY` | Your own Firebase web API key, stored in host secrets. |
| `ADMIN_EMAIL` | Optional verified address you explicitly authorize for moderation. |

For magic links, replace Firebase settings with `RESEND_API_KEY` and
`AUTH_EMAIL_FROM` on your own verified sending domain. See [Authentication](docs/AUTH.md).
No real value is provided by this repository. Blank example values are intentional.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run check:migrations
npm run build
npm run scan:release
```

Domain/auth tests use isolated in-memory databases and mocked transports. Their
reserved `example.test` addresses and generated credentials are fictional fixtures.
Optional browser scripts are documented in [Testing](docs/TESTING.md).
No CI job deploys or requires production credentials.

## Project map

| Path | Responsibility |
| --- | --- |
| `app/`, `components/allting.tsx` | Routes and mobile-first Swedish UI. |
| `lib/service.ts` | Authorization and barter domain operations. |
| `lib/auth*.ts`, `lib/firebase*.ts` | Email identity, sessions and mail flows. |
| `db/`, `drizzle/` | Schema and immutable SQL migrations. |
| `build/`, `vite.config.ts` | Worker entrypoint, security headers and build integration. |
| `public/` | Brand icons, PWA manifest and generic offline fallback. |
| `scripts/`, `tests/` | Setup, migration checks and automated tests. |
| `AI-AGENT.md` | Architecture and step-by-step instructions for an AI helper. |
| `PRODUCT-SPEC.md` | Product rules and version 1 boundaries. |

## Open source and GitHub

See [GitHub publication](docs/GITHUB.md), [Contributing](CONTRIBUTING.md),
[Security](SECURITY.md) and [third-party notices](THIRD-PARTY-NOTICES.md).
`READE.md` is an identical copy of this guide, retained under the requested filename.
The `private` flag in package.json prevents accidental npm publication; it does
not prevent a public GitHub repository or MIT-licensed use.

## Current limits

The city catalog is finite, messaging and notifications poll, and saved-search
alerts are in-app. Push, delivery booking, business accounts, multi-person chains,
premium subscriptions and currency-like credits are outside version 1.
Moderation requires a human operator. There is no role-management UI.
Each new operator must review the privacy/cookie text and host behavior before
launch; the code does not create a complete legal or operational policy for them.
