# Security policy

Do not post credentials, email links, session cookies, private messages, personal
data or exploit details in public GitHub issues. Use the repository owner's private
security reporting channel (GitHub's **Report a vulnerability** when enabled).
The new maintainer must enable a private reporting route before inviting users.
No original operator contact address is included in this distribution.

Version 1 enforces server-side identity, owner/participant authorization, strict
input validation, exact-origin CSRF checks, rate limits, bounded image requests,
private/no-store responses, encrypted Firebase refresh credentials and database
constraints/triggers. Public data projections omit email and precise coordinates.
Staff see only explicitly reported messages, not arbitrary conversations.

Configure fresh host secrets. Never commit `.env`, `.dev.vars`, `wrangler.json`,
runtime state, backups, test-user credentials or production identifiers. Rotate
exposed credentials at their provider and invalidate affected sessions; deleting
a secret from the latest Git commit does not remove it from history.
Scan source/archive contents before public publication. The automated scanner is
a useful safeguard, not a guarantee against every type of sensitive information.

Review dependency alerts and the pinned framework's advisories before a general
launch. Test upgrades and database migrations in an isolated installation.
This repository does not promise a staffed security response or a support SLA.
