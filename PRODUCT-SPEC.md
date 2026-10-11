# AllTing version 1: product rules and release contract

This English specification preserves the original project's version 1 requirements
and later explicit decisions: own verified-email accounts, Light as default,
user-selectable appearance, consent-controlled optional storage/statistics, and
a responsive footer. Deployment identities and original operator data are excluded.
The name is **AllTing** throughout titles, navigation, onboarding, PWA and mail.
The Swedish tagline is: **AllTing — byt det du har mot det du vill ha.**

## Purpose and absolute rules

Help two private individuals discover that they have things the other wants and
agree on a pure item-for-item swap. Support one-to-one, many-to-one, one-to-many
and many-to-many item combinations between those two people.

Never introduce buying, selling, prices, cash offers/differences, payment providers,
checkout, card/Swish flows, invoices, paid shipping, financial bidding, transaction
commissions, currency, estimated market values, AI valuations or hidden monetary
scoring. Listings and offers have no monetary columns or fields. Do not invent
points/tokens/credits that function as money. Only users decide whether a swap
is interesting; matching is a recommendation, not a fairness or value judgement.

## Accounts and onboarding

Anyone can browse active listings, listing details and approximate location without
logging in. Creating/managing inventory, favorites, alerts, proposals, counteroffers,
messaging, ratings, reports and blocks requires an AllTing account.
Use the user's own email; never require ChatGPT accounts for marketplace users.
Use reliable email magic links if appropriate; otherwise verified email/password.
Email must be verified before publishing or proposing. Return users to the intended
listing/action after authentication when practical.

Onboarding asks only for display name, city/area, a default radius of 5, 15 or
50 km (15 preselected), and optional category interests; then encourages the first
item. Do not require biography, phone, exact address or unnecessary personal data.
Profiles may include optional avatar/bio, active-item count, inventory, completed
trade count, average rating, membership date and verified-email indicator.
Email, staff role, home address and exact coordinates are never public.

## Listings, inventory and discovery

The mobile listing flow accepts 1–6 images, title, category, condition, description,
city, several wanted terms and/or **Öppen för förslag**. Keep it short.
Inventory (**Mina saker**) supports editing, pausing, marking traded and deleting.
Store optimized images/thumbnails in private object storage, validate size/MIME/
dimensions/container server-side, strip location metadata, and never store base64
images in relational columns.

Use the ten categories and five conditions in `lib/catalog.ts`:
home/furniture, tools, garden, electronics, sport/leisure, children, clothing/
accessories, vehicle accessories, hobby/collectibles and other; new/unused,
excellent, good, used and worn-but-working. Keep their natural Swedish UI labels.

Discovery provides nearby, strong matches and recent items. Search covers title,
description, category and wanted terms with practical Swedish normalization.
Filters include text, category, condition, city, distance and matching the visitor's
wishes. Exactly **5, 15 and 50 km**; 15 km default and persisted account preference.
No arbitrary kilometer field, distance slider, nationwide option or price filter.
Use city/area centers and approximate distance text; never expose exact GPS or
home addresses in public APIs. Favorites are private and never alert the owner.

Cards prioritize image/title, condition, area/approximate distance and what the
owner seeks. Sparse meaningful match badges only. Detail views prioritize images,
description, wanted terms and trust signals; **Föreslå byte** is the main action.
Owners see management controls instead of proposing to themselves.

## Matching

Prioritize reciprocal matches: A wants what B offers, and B wants what A offers.
Rank an interested item from a person open to suggestions below a direct reciprocal
match. Suggest several relevant inventory items and let users combine them;
version 1 does not need an optimization solver.
Use term similarity, reciprocity, approximate distance, category, condition,
openness and recency. Explain the actual reason in a short Swedish sentence.
Internal relevance scores may sort results but must not appear as percentages or
fake precision, and must never reflect financial value.

## Offers, negotiation and completion

From a listing, let the visitor choose one or several active own items, optionally
write a short message and send. Avoid unnecessary summary/confirmation steps.
The recipient may accept, decline or counter. Counteroffers may add/remove own
items or request different items from the other side, with clear immutable history
and exactly one current actionable offer version.

| State | Required behavior |
| --- | --- |
| Active listing | Available for new proposals. |
| Proposal received | Still active and unreserved. |
| Accepted agreement | Atomically reserve every item and cancel competing offers. |
| Cancelled agreement | Release reserved items while still incomplete. |
| Completed trade | Both people have confirmed; hide traded items from active discovery. |

Lock accepted item sets, show both parties and acceptance time, and discuss meeting
arrangements in the private trade chat. Each participant may leave 1–5 stars and
an optional comment once per completed trade. No ratings before actual completion.

## Communication and alerts

Conversations belong to an offer/agreement; no unrestricted standalone DM system.
Support user/system messages, timestamps, read/unread state, offer-change events,
reporting and blocking. Only participants can read their conversation/history.
Saved searches combine words, category and area/radius. New matching listings
produce deduplicated in-app alerts. Activity includes offers, counters, messages,
accepted/declined offers, completion, relevant matches and saved-search hits.
Favorites do not create activity. Email alerts are optional future work; in-app
notifications are the current delivered behavior.

## Trust, safety and administration

Reports target an item, user or message. Central report reasons are suspected stolen
goods, fraud, prohibited item, inaccurate description, harassment, spam and other.
Central prohibited items include illegal/stolen goods, weapons/ammunition, drugs,
prescription medicine, dangerous chemicals and counterfeit goods.

Blocking stops new proposals and new/continued messaging in both directions.
Suspension stops private account actions. A protected staff view provides report
review, reported listing/profile access, hide/restore, suspend/reactivate, resolution,
basic product metrics and an audit trail. Version 1 has a single staff privilege
level and no role-management UI or advanced CMS. Moderators may access specifically
reported messages, not all private chats.

## Security and data integrity

Use a relational database. This implementation retains D1/SQLite, Drizzle, Better
Auth and Firebase rather than rewriting to an initially suggested alternative.
Enforce owner/participant/staff rights server-side on reads and writes; protect
against IDOR, forged identity/roles, CSRF, excessive requests and oversized input.
Strictly validate requests. Accept offers and reserve all items atomically with
concurrency protection. Preserve foreign keys, uniqueness and domain triggers.
Use secure sessions, no secret client bundles or private debug logs, and explicit
public DTO fields. Sensitive content is rendered as text, not injected HTML.

## Mobile design, accessibility and performance

The UI is Swedish, practical and mobile-first. Use Light by default, dark text,
one restrained accent, system fonts, small radii, clear dividers and usable spacing.
Offer **Ljust**, **Mörkt** and **Följ enheten** in profile settings; preserve explicit
choices. Use **Cookies** and **Cookieinställningar** in the Swedish UI.
No oversized gradient heroes, glass effects, generic illustrations, decorative
badges, gratuitous animations or machine-sounding slogans. Prefer **byta** to
shopping language. Search placeholder: **Sök efter byten**.

Mobile bottom navigation: Home, Search, Add item, Messages, Profile, using the
Swedish labels in the app. Align footer text/links on desktop and stack them
left-aligned on mobile, clear of the fixed navigation and device safe area.
Aim for WCAG 2.1 AA: contrast, labels, meaningful alt text, keyboard navigation,
visible focus, roughly 44×44px important targets and errors beyond color alone.
Optimize images, lazy loading, initial load and Core Web Vitals. Paginate long lists.
Loading states and empty/error states must be useful and concise.

## Consent, metrics and PWA

Necessary sessions/security and the consent choice work independently of optional
purposes. Optional browser appearance storage and usage statistics start disabled.
Visitors may reject, accept or customize with equally clear controls and reopen
settings later. Purpose choices expire after 180 days; revocation stops new optional
collection and removes optional local preference storage. Private account
appearance works with necessary cookies only.

Record lightweight product measures with consent where required: active items per
user, matches, offers, accepted/completed proportions, item combinations, fixed
radius usage/changes, first relevant match/offer timing and returning users.
No message bodies, exact meeting places or email in analytics. Operational trade
records remain available for service operation. Do not add advertising trackers.

The PWA has an installable manifest/icons, theme color and a generic offline
fallback. It is a web app first. Offline caches must never contain private data.

## Excluded from version 1

All monetary features; paid shipping/labels; three-or-more-person barter chains;
business accounts; premium plans; sponsored ads/ad platforms; advanced gamification;
crypto/tokens/credits; semantic AI matching; automatic image categorization;
push; phone verification; stronger identity verification; advanced moderation.
The architecture may allow later additions, but do not expose unfinished features.

## Release acceptance

Registration, verified login, logout and recovery; full listing/image lifecycle;
real database discovery/search/filtering/favorites; reciprocal explanations;
multi-item proposals/counters/accept/decline; private messages/unread state; atomic
reservation, two-party completion and ratings; reports, blocks and staff access
must work end to end. No price/value fields or monetary behavior anywhere.
Use AllTing consistently, 15 km default, only 5/15/50 km, approximate location,
open-to-suggestions and natural Swedish copy.

Run typecheck, lint, tests, migrations and production build. Test 360/390/430 px,
iPhone Safari, Android Chrome and desktop Chrome/Edge; distinguish emulation from
physical devices. No normal-view horizontal overflow. Verify owner and third-user
boundaries, errors/empty states, buttons, real mail and absence of leaked secrets,
demo records or debug data. See `docs/RELEASE.md` for the operator checklist.
