# Contributing

Read PRODUCT-SPEC.md and AI-AGENT.md first. Keep AllTing barter-only, mobile-first
and Swedish in its interface. Write maintenance documentation in English.
Use Node 22.13+, `npm ci`, fresh local configuration and local-only test data.

Changes should solve a concrete problem within version 1. Preserve authorization,
privacy, two-party completion and atomic reservations. New migrations append to
the existing history. Never ship real users, photos, secrets or production IDs.

Before proposing a change, run typecheck, lint, tests, migration validation,
production build and release scan. Test affected mobile flows at 360/390/430 px
and verify third-user access denial for private operations. Explain what changed,
why, how it was tested and any unverified limitations.

Report ordinary bugs with reproducible steps and sanitized information. Follow
SECURITY.md for vulnerabilities. By submitting a contribution, you agree that
your contribution is provided under the repository's MIT license; retain
third-party license notices for any reused code.
