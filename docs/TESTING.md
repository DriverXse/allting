# Testing

## Automated server checks

`npm test` bundles the service/auth entrypoints and runs Node's built-in test
runner. The supplied suite covers domain rules, own authentication, Firebase
transports, consent, IDOR, roles, CSRF, concurrency, encrypted sessions and image
validation. Tests use in-memory SQLite databases with the real migrations.
Reserved addresses and generated credentials are fictional fixtures, never live
users or included database exports. No external account is needed for this suite.

`npm run check:migrations` applies SQL through Wrangler's parser and SQLite with
foreign keys enabled. The guards migration must retain LF endings. Verify local
Wrangler migrations separately with `npm run db:migrate:local`.

## Browser test scripts

Browser scripts are local-only development tools; they create fictional data in
the local installation. They never use an existing production account.
Install Playwright browser engines if needed:

```sh
npx playwright install chromium webkit
```

Some retained scripts default to the locally installed Microsoft Edge channel.
The full trade script supports `--chromium`, `--webkit` and `--dark`; `--flow-only`
skips unrelated discovery checks. Other scripts support WebKit with `--webkit`.

1. Run `npm run setup:local`, local migrations and the dev mailbox/server.
2. For the full fixture flow, explicitly generate local fixtures with
   `npm run seed:local` and set `ADMIN_EMAIL=local_seedy@example.test` in `.dev.vars`
   if the moderation test is required. Restart the dev server after configuration.
3. Run `npm run test:browser` or
   `node scripts/browser-qa.mjs --webkit --dark`.
4. For independent signup/origin checks, use
   `node scripts/browser-auth-qa.mjs --webkit`.
5. Password-mode browser scripts require the Firebase emulator described in AUTH.md;
   they do not send real verification mail.

Run mutating browser suites sequentially, not against the same local database at
the same time. QA output belongs to ignored `.sites-runtime/qa`; never put its
cookies, screenshots, email links or database copies in source archives.
The full consent QA has a documented Windows WebKit SameSite reporting exception;
it must not be misrepresented as a production relaxation of SameSite=Lax.

## Production smoke testing

Use the operator's own disposable accounts and controlled inboxes. Verify real
email delivery, actual bindings/storage and the published URL separately from
unit tests. Follow RELEASE.md. Do not run seeding scripts or loopback QA transports
against production. Record real device checks separately from responsive emulation.
