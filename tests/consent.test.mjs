import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./d1.mjs";
import {
  Service,
  parseConsent,
  consentFromCookie,
  encodeConsent,
  CONSENT_MAX_AGE,
} from "../.sites-runtime/test-service.mjs";

test("consent validates version, purposes, time, expiry and duplicate cookies", () => {
  const now = Date.now();
  for (const preferences of [false, true])
    for (const statistics of [false, true]) {
      const c = { preferences, statistics, savedAt: now };
      assert.deepEqual(parseConsent(encodeConsent(c), now), c);
      assert.deepEqual(
        consentFromCookie(
          `other=abc; allting-consent=${encodeConsent(c)}`,
          now,
        ),
        c,
      );
    }
  for (const value of [
    undefined,
    "",
    "yes",
    `2.${now}.1.1`,
    `1.${now}.true.1`,
    `1.${now}.2.1`,
    `1.${now + 600000}.1.1`,
    `1.${now - CONSENT_MAX_AGE * 1000}.1.1`,
  ])
    assert.equal(parseConsent(value, now), null);
  assert.equal(
    consentFromCookie(
      `allting-consent=1.${now}.1.1; allting-consent=1.${now}.0.0`,
    ),
    null,
  );
  assert.equal(consentFromCookie(`fake-allting-consent=1.${now}.1.1`), null);
});

test("statistics fail closed without consent, revocation stops events and profile remains usable", async () => {
  const db = database();
  const identity = {
    userId: "consent-test",
    email: "consent@example.test",
    emailVerified: true,
  };
  const declined = new Service(db, identity);
  await declined.saveProfile({ display_name: "Testare", city: "Norrtälje" });
  await declined.event(identity.userId, "session");
  assert.equal(
    db.sqlite.prepare("SELECT count(*) n FROM analytics_events").get().n,
    0,
  );
  assert.equal((await declined.me()).user.theme_preference, "light");
  const accepted = new Service(db, identity, undefined, undefined, true);
  await accepted.event(identity.userId, "search", 15);
  assert.equal(
    db.sqlite.prepare("SELECT count(*) n FROM analytics_events").get().n,
    1,
  );
  await declined.preference({ radius: 50, theme_preference: "dark" });
  await declined.saveProfile({ display_name: "Testare", city: "Stockholm" });
  assert.equal(
    db.sqlite.prepare("SELECT count(*) n FROM analytics_events").get().n,
    1,
  );
  assert.equal((await declined.me()).user.theme_preference, "dark");
  assert(
    !(
      "theme_preference" in
      (await new Service(db, null).profile(identity.userId))
    ),
  );
});
