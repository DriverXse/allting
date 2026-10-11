# Other hosting providers

## Supported without a runtime port

- Sites, with its provisioned Cloudflare Worker, D1 and R2 bindings.
- Your own Cloudflare account, using the included Wrangler configuration.

Both routes use the same server implementation. A generated HTTPS hosting domain
is sufficient. You may point a domain from any registrar at a supported deployment.

## What a conventional host needs

The current source imports `cloudflare:workers` in the API, auth runtime and
database access. Merely running `next start`, `vinext start`, a Docker container,
or copying `dist/client` does not replace those bindings. A static host cannot
execute the API or store shared account data.

Before porting to a VPS, Node/serverless host, PostgreSQL or S3 provider, confirm:

1. A server runtime for React server rendering and request handlers.
2. A real relational database and an adapter for `D1Database.prepare`, bound
   statements, `first`, `all`, `run` and atomic `batch` operations.
3. An object-storage adapter for the R2 operations actually used by
   `app/api/[...path]/route.ts`, including object metadata and private reads.
4. A replacement for `cloudflare:workers` environment access that reads only
   server-side configuration and never includes secrets in browser bundles.
5. A compatible Better Auth database adapter, equivalent session tables,
   encrypted refresh-credential storage and server-side provider verification.
6. Migrations that preserve constraints, indexes, triggers, reservations,
   two-party completion, blocked-user enforcement and concurrent acceptance.
7. HTTPS, exact-origin CSRF checks, streaming request size limits, security
   headers and the same authorization at every API boundary.

`tests/d1.mjs` is an isolated test shim, not a production storage adapter. Its
in-memory SQLite and serialized test queue must not be promoted to production.
The database's trigger syntax and atomic semantics must be ported deliberately;
switching SQLite to PostgreSQL is not a connection-string edit.

## Safe AI-assisted porting process

Ask the operator for the actual provider/runtime/database/object store only when
these choices block the implementation. Inspect that provider's official current
documentation, implement adapters in a separate branch, and run all domain and
auth tests against the real target adapter. Add concurrent-reservation and IDOR
tests where needed. Then verify image ownership and a complete two-person trade
with a third unauthorized account. Keep the Swedish mobile UI and product rules.

Do not describe another host as supported until its production build, migrations
and full smoke flow have actually passed. This release includes **no completed
generic Node/PostgreSQL/S3 adapter**. If the operator wants immediate deployment,
use one of the two supported routes above instead of silently weakening security
or replacing the backend with browser-local storage.
