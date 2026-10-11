# Release checklist for each new installation

Source ZIP verification does not replace testing the operator's own deployment.
Record what passed, the exact source/build, pending limits and whether browsers
were emulated or physical devices. Do not publish a partial application simply
because the host accepts the archive.

## Build and data

- [ ] `npm ci` from the committed lockfile.
- [ ] `npm run typecheck` and `npm run lint`.
- [ ] `npm test` and `npm run check:migrations`.
- [ ] `npm run build` and `npm run scan:release`.
- [ ] Build cleanup completed; no `.dev.vars`/`.env` or local runtime state in
      the deployment artifact. Host secrets are configured separately.
- [ ] Six SQL migrations applied to a fresh local database, then the correct new
      production database; no users/uploads/sessions seeded in production.
- [ ] Exact host origin, private session/provider secrets and correct DB/R2 bindings.
- [ ] No emulator, local mailbox, fixture keys or copied operator accounts in production.

## Accounts and public access

- [ ] Signed-out visitor browses the home page, search and listing details.
- [ ] Interaction requires AllTing login, not a ChatGPT account.
- [ ] Real email registration, verification, login, logout and password recovery.
- [ ] Unverified email cannot publish or propose.
- [ ] Short onboarding with display name, city, radius 15 default, optional interests.
- [ ] A visitor's intended listing/action survives registration when practical.
- [ ] Public profiles/responses omit email, staff role, private preferences and coordinates.

## Items, search and matching

- [ ] Create, view, edit, pause, delete and mark items traded; 1–6 prepared images.
- [ ] Owner-only editing/deletion/uploads, MIME/size/metadata checks.
- [ ] Text/category/condition/city/matching filters; exactly 5/15/50 km.
- [ ] Reciprocal matches explain the real reason, no displayed scores or valuations.
- [ ] Favorites and saved searches are private; deduplicated alerts reach the owner.

## Two-party trade and third-user checks

- [ ] Two different verified accounts create listings and a multi-item proposal.
- [ ] Counteroffer changes the current item set while preserving history.
- [ ] Decline/cancel works; stale offers cannot be accepted.
- [ ] Accept reserves all items atomically; simultaneous competing acceptance fails.
- [ ] Third account cannot view/modify either private offer or chat, send into it,
      accept/counter/complete it or rate its participants.
- [ ] Chat, read/unread state and system events work for both participants.
- [ ] One completion confirmation is insufficient; both confirmations finish the trade.
- [ ] Traded items leave discovery; each party can rate once afterward.
- [ ] Block stops proposals/messages both ways and releases incomplete agreements.

## Moderation and security

- [ ] Reports work for listings, users and individual messages.
- [ ] Only explicitly authorized staff can open `/admin` or perform its API actions.
- [ ] Hide/show, suspend/reactivate, resolve and audit actions work.
- [ ] Staff cannot freely read unreported private conversations.
- [ ] Forged role/owner/verification fields, forged Sites headers and wrong Origin fail.
- [ ] Rate limiting, bounded inputs, private/no-store API responses and security headers.
- [ ] No prices, amounts, value estimates, payments or financial ranking in UI/API/schema.

## Mobile, appearance and consent

- [ ] 360, 390 and 430 px; mobile Safari/WebKit and Chrome/Chromium; desktop.
- [ ] No horizontal overflow; visible focus, labels, contrast and usable touch targets.
- [ ] Footer aligns on desktop, stacks on mobile and clears the fixed bottom menu.
- [ ] Light defaults, explicit Dark/System saves, reload and cross-tab behavior.
- [ ] Optional purposes off initially; reject/accept/customize and reopen all work.
- [ ] Rejecting does not break login/trades; revocation removes optional browser storage
      and stops new optional analytics events server-side.
- [ ] No private data in the generic offline cache.
- [ ] Swedish text is short and natural; no placeholders or machine-sounding copy.

## Operator responsibilities

- [ ] Verify actual mail text and delivery in an inbox you control.
- [ ] Review host-specific cookies and publish accurate privacy/operator information.
- [ ] Provide a human moderation process and private incident-reporting channel.
- [ ] Back up and test restore of the operator's own D1/R2 data; keep backups private.
- [ ] Remove disposable accounts or rotate their credentials before general launch.
- [ ] Test the exact published HTTPS URL signed out and with separate accounts.
