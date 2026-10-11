# AllTing: instructions for an AI assistant

## Read first and establish scope

Read `README.md`, `PRODUCT-SPEC.md`, this file and the deployment guide for the
chosen target before changing or deploying anything. `AGENTS.md` points here for
assistants that discover that filename automatically. This is a sanitized,
independent source distribution; it contains no existing operator identity or data.
Use the actual checked-in code as implementation evidence. Do not treat example
addresses, fixture credentials, placeholder UUIDs or documentation as live access.

The latest explicit human request takes precedence over historical notes. Preserve
version 1's barter-only scope, private data boundaries and natural Swedish UI.
All maintenance/setup instructions and new documentation should be in English.
Do not translate the application's Swedish UI into English during installation.

## Actual stack and request flow

- React 19 and TypeScript, using Vinext's Next.js App Router-compatible surface.
- Vite and the pinned Cloudflare Vite plugin build a Worker and its static assets.
- `npm run build` also runs `scripts/clean-build.mjs` to remove copied local
  environment files/runtime state from `dist`. Never bypass this cleanup when
  packaging a deployment, and never include `.dev.vars` in an artifact.
- `build/sites-worker.ts` invokes `vinext/server/fetch-handler` and adds security
  headers. It has no ChatGPT identity or connector dependency.
- `app/[[...route]]/page.tsx` serves the shared marketplace client.
  `components/allting.tsx` selects UI views from the route and loads `/api` data.
- `app/api/[...path]/route.ts` is the server API boundary. It validates origin,
  parses bounded input, resolves verified identity, invokes `Service` and returns
  explicit private/no-store responses. It also authorizes object reads and writes.
- `lib/service.ts` owns domain authorization, listings, matching queries, favorites,
  offers, conversations, notifications, reviews, reporting, blocks and moderation.
  Hiding a button never substitutes for its server-side authorization.
- `lib/catalog.ts` is the central Swedish category/condition/city/policy catalog.
  City coordinates are area centers, not individual locations.
- `lib/matching.ts` handles term normalization and recommendation signals.
  Internal relevance values must not be displayed or treated as monetary value.
- `lib/document-navigation.tsx` intentionally uses native anchors and document
  navigation. Preserve it until a deliberate framework upgrade passes production
  navigation/history tests; do not casually replace it with `next/link` prefetch.

### Identity and sessions

`lib/auth-http.ts` implements the public AllTing auth endpoints.
`lib/auth-runtime.ts` reads server-only configuration and dev/prod boundaries.
`lib/auth.ts` uses Better Auth with the Drizzle D1 adapter.
`lib/firebase-auth.ts` and `lib/firebase-session.ts` verify Firebase identity and
renew/recheck provider sessions. `lib/session-seal.ts` encrypts refresh credentials
per AllTing session. Do not store passwords in AllTing or accept a browser's
assertion that email is verified. Do not use Firebase ownership, Sites service
bearers or `oai-authenticated-user-*` headers as AllTing identity.

Firebase password mode is the default production recommendation. Optional Resend
magic links already exist. The default local setup uses a loopback-only mailbox
with a freshly generated local secret. Production never uses that mailbox,
the emulator or development session keys.

### Database and object storage

`db/schema.ts` declares `users`, `categories`, `listings`, `uploads`,
`listing_images`, `wanted_terms`, `favorites`, `trade_offers`, `trade_offer_items`,
`conversations`, `messages`, `reviews`, `reports`, `blocks`, `saved_searches`,
`notifications`, `audit_log`, `analytics_events` and `rate_limits`.
`db/auth-schema.ts` declares separate `allting_auth_*` identity/session tables.
Public projections explicitly omit email, coordinates, roles and internal fields.

All six SQL migrations and Drizzle snapshots/journal are included under `drizzle/`.
Migrations contain schema and domain triggers, not copied user records. Applied
migrations are immutable. For a schema change, update the schema, generate a new
numbered migration, inspect it, and test it against existing-data fixtures.
Preserve LF endings in SQL, foreign keys and trigger behavior.
Never create migration-owned tables in request handlers or seed production.

D1 `DB` stores relational data; R2 `BUCKET` stores prepared image objects.
`lib/uploads.ts` validates and strips WebP metadata. Enforce MIME/container,
dimensions and size limits server-side, validate image ownership, and never store
photos as database base64. Public reads remain subject to listing visibility;
private/historical images require the owner's or trade participant's authorization.

### Appearance, consent and PWA

`lib/appearance.ts` bootstraps Light before first paint. Existing explicit Dark or
System choices persist privately. Browser preference caching is permitted only
after consent. `lib/consent.ts` validates the versioned, expiring purpose cookie;
`components/consent.tsx` owns the Swedish banner/settings/policy.
Both optional purposes start disabled. Reject and accept controls are equally
clear. Revocation removes optional appearance storage and stops future server
analytics. Account functionality works with necessary cookies only.

`public/sw.js` caches the generic offline page/icons only. Never cache private
API responses, account pages, messages or user images. Preserve mobile footer
alignment, 44px controls and bottom-navigation/safe-area clearance.

## Setup workflow

1. Inspect the current directory and installed toolchain. Use Node 22.13+ and
   `npm ci` with the committed lockfile; do not install unrelated global tools.
2. Run `npm run setup:local`. It creates ignored configuration and a random local
   secret without overwriting existing files. Do not print, share or commit secrets.
3. Apply `npm run db:migrate:local`; run the local mailbox and dev server in separate
   terminals. Use exactly `http://127.0.0.1:5173` for the development origin.
4. Test the empty app. Optional seed scripts generate fictional local records only.
5. Determine the operator's hosting target and exact ownership/account. Use
   `docs/DEPLOY-SITES.md` or `docs/DEPLOY-CLOUDFLARE.md`. If another provider is
   requested, read `docs/OTHER-HOSTS.md` and identify missing runtime adapters.
6. Guide the operator through their own Firebase project, verified account, allowed
   hostname, fresh secrets and host resources. Never reuse another installation.
7. Run typecheck, lint, all tests, migration validation and the production build.
   Preserve the working security/data model; do not bypass a failure to deploy.
8. Apply pending production migrations to the correct database, publish the exact
   verified build using the target's supported workflow, then execute RELEASE.md.
9. Report the real deployed URL and verification outcomes. Distinguish local tests,
   emulated mobile testing, actual device testing and real email delivery.

Before any external publication, permission change, account creation with terms,
or destructive database operation, obey the host environment's authorization
requirements. Human approval must name the account when granting staff rights.
Do independent reversible preparation first. Do not ask again for already granted
authorization. Stop only for genuinely missing access or contradictory requirements.

## Authorization and domain invariants

- Only an active, verified AllTing account may interact. Visitors can browse.
- Only owners edit/delete listings or use uploaded files they own.
- Only the two trade participants read offers, chat and read-state history.
- One or many items can be on either side, with no duplicate/foreign/unavailable
  items. Initial proposals do not reserve; acceptance reserves every item atomically.
- Counteroffers replace the current immutable offer version. Stale versions cannot
  be accepted. Competing proposals are cancelled when items become reserved.
- Completion requires both participants. Completed items leave active discovery;
  each participant can rate the other once per completed trade.
- Blocking prevents proposals/messages in both directions and cancels/releases
  active agreements. Suspended users cannot continue private operations.
- Favorites and saved searches are private. Favoriting does not notify the owner.
- Moderator access is server-checked; no general chat-reading exception exists.
  Explicit report content only is shown, and moderation writes are audited.
- Validate all input with strict schemas and bounded bodies; reject extra client
  role/owner/verification fields. Keep exact-origin CSRF protection and rate limits.

## Version 1 boundaries

Use `PRODUCT-SPEC.md` for detail. Absolutely no selling, buying, amounts, price
fields, estimated values, monetary scores, payments, cash adjustments, carts,
checkout, shipping purchases, cryptocurrency or currency-like points/credits.
Do not build multi-person chains, business accounts, subscriptions, advertising,
push, phone verification or advanced AI features during setup.
Exactly 5/15/50 km, 15 km default; Light default; brief optional onboarding interests;
no phone, home address or required biography; private email throughout.

## Source and GitHub hygiene

Run `npm run scan:release`. Never include `.git`, `.dev.vars`, `.env`,
`wrangler.json`, host identities, `.wrangler`, `.sites-runtime`, `node_modules`,
`dist`, account exports, uploaded photos, logs or local test credentials in a
public source archive. Keep only blank templates and reserved synthetic fixtures.
Preserve MIT and third-party copyright/license notices. No real GitHub remote
is supplied; ask the operator for their destination before pushing.
Do not claim that a ZIP has been uploaded, deployed or live-tested unless it has.
