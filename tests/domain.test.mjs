import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./d1.mjs";
import {
  Service,
  barterText,
  sanitizeWebp,
} from "../.sites-runtime/test-service.mjs";
import sharp from "sharp";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

test("private appearance preferences preserve radius and survive profile edits", async () => {
  const f = await fixture();
  assert.equal((await f.anna.me()).user.theme_preference, "light");
  await f.anna.preference({ theme_preference: "dark" });
  await f.anna.preference({ radius: 50 });
  assert.equal((await f.anna.me()).user.theme_preference, "dark");
  assert.equal((await f.anna.me()).user.default_search_radius_km, 50);
  assert.equal((await f.erik.me()).user.theme_preference, "light");
  assert(!("theme_preference" in (await f.erik.profile("anna"))));
  assert(
    !("theme_preference" in (await new Service(f.db, null).profile("anna"))),
  );
  await f.anna.saveProfile({ display_name: "Anna", city: "Stockholm" });
  assert.equal((await f.anna.me()).user.theme_preference, "dark");
  await f.anna.preference({ theme_preference: "light", radius: 5 });
  assert.equal((await f.anna.me()).user.theme_preference, "light");
  assert.equal((await f.anna.me()).user.default_search_radius_km, 5);
});

test("appearance writes require an active account and reject forged owners and invalid input", async () => {
  const f = await fixture();
  await assert.rejects(
    new Service(f.db, null).preference({ theme_preference: "dark" }),
    (e) => e.status === 401,
  );
  for (const input of [
    {},
    { theme_preference: "sepia" },
    { theme_preference: null },
    { theme_preference: "dark", user_id: "erik" },
    { theme_preference: "dark", role: "admin" },
  ])
    await assert.rejects(f.anna.preference(input));
  assert.throws(() =>
    f.db.sqlite
      .prepare("UPDATE users SET theme_preference='sepia' WHERE id='anna'")
      .run(),
  );
  f.db.sqlite.prepare("UPDATE users SET suspended=1 WHERE id='anna'").run();
  await assert.rejects(
    f.anna.preference({ theme_preference: "dark" }),
    (e) => e.status === 403,
  );
});

test("appearance migration preserves existing users, listings and domain guards", () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const files = readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files.filter((f) => !f.startsWith("0005_")))
    sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  sqlite.exec(
    "INSERT INTO users(id,email,display_name) VALUES ('existing','test@example.test','Test'); INSERT INTO categories(id,name) VALUES ('tools','Verktyg'); INSERT INTO listings(id,owner_id,title,description,category_id,condition,city,latitude_approx,longitude_approx) VALUES ('old-item','existing','Borrmaskin','Fungerar som den ska.','tools','good','Norrtälje',59.76,18.7)",
  );
  const guards = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name",
    )
    .all();
  sqlite.exec(
    readFileSync(`drizzle/${files.find((f) => f.startsWith("0005_"))}`, "utf8"),
  );
  assert.equal(
    sqlite
      .prepare("SELECT theme_preference FROM users WHERE id='existing'")
      .get().theme_preference,
    "system",
  );
  assert.equal(
    sqlite.prepare("SELECT owner_id FROM listings WHERE id='old-item'").get()
      .owner_id,
    "existing",
  );
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.deepEqual(
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name",
      )
      .all(),
    guards,
  );
  sqlite.close();
});
async function fixture() {
  const db = database(),
    services = {};
  for (const [uid, name] of [
    ["anna", "Anna"],
    ["erik", "Erik"],
    ["sofia", "Sofia"],
  ]) {
    const s = new Service(
      db,
      { userId: uid, email: `${uid}@example.test`, emailVerified: true },
      uid === "sofia" ? "sofia" : undefined,
      undefined,
      true,
    );
    await s.saveProfile({
      display_name: name,
      city: "Norrtälje",
      default_search_radius_km: 15,
      wanted: uid === "anna" ? ["cykel"] : ["verktyg"],
    });
    services[uid] = s;
  }
  async function item(uid, title, wanted, open = false, city = "Norrtälje") {
    const key = `${crypto.randomUUID()}.webp`;
    await db
      .prepare("INSERT INTO uploads(id,owner_id,object_key) VALUES (?,?,?)")
      .bind(key, uid, key)
      .run();
    return services[uid].saveListing({
      title,
      description: "Använd men fungerar som den ska. Alla delar följer med.",
      category_id: uid === "anna" ? "tools" : "sport",
      condition: "good",
      city,
      wanted,
      open_to_suggestions: open,
      images: [`/api/images/${key}`],
    });
  }
  const a = await item("anna", "Bosch borrmaskin", ["cykel"]),
    a2 = await item("anna", "Verktygslåda", ["cykel"]),
    b = await item("erik", "Crescent cykel", ["verktyg"]),
    b2 = await item("erik", "Cykelhjälm", ["borrmaskin"]),
    c = await item("sofia", "Herrcykel", [], true);
  return {
    db,
    ...services,
    a,
    a2,
    b,
    b2,
    c,
    item,
    anonymous: new Service(db, null),
  };
}
const proposal = (a, b, extra = {}) => ({
  initiator_items: [a.id],
  recipient_items: [b.id],
  message: "Vill du byta?",
  ...extra,
});
test("authentication and account fields cannot be forged", async () => {
  const f = await fixture();
  await assert.rejects(() => f.anonymous.saveProfile({}), /Logga in/);
  await assert.rejects(() =>
    f.anna.saveProfile({
      display_name: "Anna",
      city: "Norrtälje",
      role: "admin",
    }),
  );
  await assert.rejects(() => f.anna.admin(), /tillgång/);
  assert.equal((await f.sofia.admin()).role, "admin");
  assert.equal(
    (await f.anna.profile("anna", true)).default_search_radius_km,
    15,
  );
});
test("public DTOs omit email, coordinates, roles and moderation metadata", async () => {
  const f = await fixture();
  for (const dto of [
    await f.anonymous.listing(f.a.id),
    await f.anonymous.profile("anna"),
    ...(await f.anonymous.discover(new URLSearchParams())).items,
  ])
    for (const key of [
      "email",
      "role",
      "latitude_approx",
      "longitude_approx",
      "lat",
      "lng",
      "reserved_offer_id",
      "moderated_hidden",
    ])
      assert.equal(key in dto, false, key);
});
test("only owners can edit/delete and uploaded images belong to the writer", async () => {
  const f = await fixture();
  await assert.rejects(
    () => f.erik.listingStatus(f.a.id, { status: "deleted" }),
    /finns inte/,
  );
  await assert.rejects(() =>
    f.erik.saveListing(
      {
        title: "Ändrad borrmaskin",
        description: "Fungerar fortfarande bra.",
        category_id: "tools",
        condition: "good",
        city: "Norrtälje",
        wanted: [],
        open_to_suggestions: true,
        images: f.a.images,
      },
      f.a.id,
    ),
  );
  assert.equal((await f.anna.listing(f.a.id)).title, "Bosch borrmaskin");
});
test("schema and inputs contain no monetary fields, offers reject monetary text", async () => {
  const f = await fixture();
  for (const table of ["listings", "trade_offers", "trade_offer_items"]) {
    const cols = f.db.sqlite
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((x) => x.name);
    assert(!cols.some((c) => /price|value|currency|amount|payment/.test(c)));
  }
  await assert.rejects(() =>
    f.anna.propose({ ...proposal(f.a, f.b), price: 100 }, f.b.id),
  );
  await assert.rejects(() =>
    f.anna.propose(
      proposal(f.a, f.b, { message: "Jag lägger till 200 kr via Swish." }),
      f.b.id,
    ),
  );
  assert.equal(
    barterText("Jag erbjuder borrmaskinen och en verktygslåda."),
    true,
  );
});
test("mutual and open matching explains reasons without exposing scores", async () => {
  const f = await fixture();
  const d = await f.anna.discover(
    new URLSearchParams({ matches: "1", sort: "match" }),
  );
  assert.equal(d.items.find((x) => x.id === f.b.id).match.kind, "mutual");
  assert.equal(d.items.find((x) => x.id === f.c.id).match.kind, "open");
  assert(d.items.find((x) => x.id === f.b.id).match.alternatives.length === 2);
  assert(d.items[0].match.reason.includes("Du söker"));
  assert(!JSON.stringify(d).includes("rank"));
});
test("fixed radii, geography and filters", async () => {
  const f = await fixture();
  await f.item(
    "erik",
    "Barncykel i Roslagsbro",
    ["verktyg"],
    false,
    "Roslagsbro",
  );
  const small = await f.anna.discover(new URLSearchParams({ radius: "5" })),
    normal = await f.anna.discover(new URLSearchParams());
  assert(normal.total > small.total);
  await assert.rejects(() =>
    f.anna.discover(new URLSearchParams({ radius: "30" })),
  );
  const q = await f.anna.discover(
    new URLSearchParams({ q: "cykel", category: "sport", condition: "good" }),
  );
  assert(
    q.items.every((i) => i.category_id === "sport" && i.condition === "good"),
  );
});
test("proposals do not reserve; a third user cannot read, accept, counter, message or review", async () => {
  const f = await fixture();
  const o = await f.anna.propose(proposal(f.a, f.b), f.b.id);
  assert.equal((await f.anna.listing(f.a.id)).status, "active");
  assert.equal((await f.erik.listing(f.b.id)).status, "active");
  for (const action of [
    () => f.sofia.conversation(o.id),
    () => f.sofia.offerAction(o.id, { action: "accept" }),
    () => f.sofia.message(o.id, { body: "Hej" }),
    () => f.sofia.propose(proposal(f.a, f.b), "", o.id),
    () => f.sofia.review(o.id, { stars: 5 }),
  ])
    await assert.rejects(action, /finns inte/);
  await assert.rejects(
    () => f.anna.offerAction(o.id, { action: "accept" }),
    /besvara/,
  );
});
test("foreign items, duplicates and empty sides fail atomically", async () => {
  const f = await fixture();
  for (const input of [
    proposal(f.c, f.b),
    proposal(f.a, f.b, { initiator_items: [f.a.id, f.a.id] }),
    proposal(f.a, f.b, { recipient_items: [] }),
  ])
    await assert.rejects(() => f.anna.propose(input, f.b.id));
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM trade_offers").get().n,
    0,
  );
});
test("counteroffers support multiple items on both sides and replace immutable history", async () => {
  const f = await fixture();
  const first = await f.anna.propose(proposal(f.a, f.b), f.b.id);
  const second = await f.erik.propose(
    {
      initiator_items: [f.a.id, f.a2.id],
      recipient_items: [f.b.id, f.b2.id],
      message: "Kan hjälmen också följa med?",
    },
    "",
    first.offer_id,
  );
  assert.equal(second.id, first.id);
  const d = await f.anna.conversation(first.id);
  assert.equal(d.history.length, 2);
  assert.equal(d.history[0].status, "countered");
  assert.equal(d.offer.items.length, 4);
  assert.equal(d.offer.items.filter((i) => i.side === "initiator").length, 2);
  await assert.rejects(() =>
    f.erik.offerAction(first.offer_id, { action: "accept" }),
  );
  await f.anna.offerAction(second.offer_id, { action: "accept" });
  assert.equal((await f.anna.conversation(first.id)).offer.status, "accepted");
});
test("a counteroffer may replace the original requested item", async () => {
  const f = await fixture();
  const first = await f.anna.propose(proposal(f.a, f.b), f.b.id);
  const second = await f.erik.propose(proposal(f.a, f.b2), "", first.offer_id);
  assert.equal(
    (await f.anna.conversation(second.id)).offer.target_listing_id,
    f.b2.id,
  );
});
test("acceptance atomically reserves all items and cancels competing proposals", async () => {
  const f = await fixture();
  const o = await f.anna.propose(
      proposal(f.a, f.b, { initiator_items: [f.a.id, f.a2.id] }),
      f.b.id,
    ),
    competing = await f.anna.propose(proposal(f.a, f.c), f.c.id);
  await f.erik.offerAction(o.offer_id, { action: "accept" });
  assert.equal((await f.anna.listing(f.a.id)).status, "reserved");
  assert.equal((await f.anna.listing(f.a2.id)).status, "reserved");
  assert.equal(
    (await f.anna.conversation(competing.id)).offer.status,
    "cancelled",
  );
  await assert.rejects(() =>
    f.sofia.offerAction(competing.offer_id, { action: "accept" }),
  );
  await assert.rejects(() =>
    f.anna.listingStatus(f.a.id, { status: "deleted" }),
  );
  await assert.rejects(() =>
    f.db
      .prepare("UPDATE listings SET title=? WHERE id=?")
      .bind("Ändrad", f.a.id)
      .run(),
  );
  await f.anna.offerAction(o.offer_id, { action: "cancel" });
  assert.equal((await f.anna.listing(f.a.id)).status, "active");
});
test("concurrent acceptance attempts cannot reserve an item twice", async () => {
  const f = await fixture();
  const a = await f.anna.propose(proposal(f.a, f.b), f.b.id),
    b = await f.anna.propose(proposal(f.a, f.c), f.c.id);
  const r = await Promise.allSettled([
    f.erik.offerAction(a.offer_id, { action: "accept" }),
    f.sofia.offerAction(b.offer_id, { action: "accept" }),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    f.db.sqlite
      .prepare("SELECT count(*) n FROM trade_offers WHERE status='accepted'")
      .get().n,
    1,
  );
});
test("completion requires both parties, hides traded items and allows exactly one review each", async () => {
  const f = await fixture();
  const o = await f.anna.propose(proposal(f.a, f.b), f.b.id);
  await assert.rejects(() => f.anna.review(o.offer_id, { stars: 5 }));
  await f.erik.offerAction(o.offer_id, { action: "accept" });
  await f.anna.offerAction(o.offer_id, { action: "complete" });
  assert.equal((await f.anna.conversation(o.id)).offer.status, "accepted");
  await f.erik.offerAction(o.offer_id, { action: "complete" });
  assert.equal((await f.anna.conversation(o.id)).offer.status, "completed");
  assert(
    !(await f.anonymous.discover(new URLSearchParams())).items.some(
      (l) => l.id === f.b.id,
    ),
  );
  await f.anna.review(o.offer_id, {
    stars: 5,
    comment: "Lätt att komma överens. Tack för bytet!",
  });
  await f.erik.review(o.offer_id, { stars: 4 });
  await assert.rejects(() => f.anna.review(o.offer_id, { stars: 3 }));
  assert.equal((await f.anonymous.profile("erik")).rating, 5);
});
test("messages have read state; reporting another conversation message is forbidden", async () => {
  const f = await fixture();
  const o = await f.anna.propose(proposal(f.a, f.b), f.b.id);
  await f.anna.message(o.id, { body: "Kan vi ses vid biblioteket?" });
  let d = await f.erik.conversation(o.id),
    m = d.messages.find((x) => x.type === "user");
  assert.equal(m.read_at, null);
  await assert.rejects(() =>
    f.sofia.report({ target_type: "message", target_id: m.id, reason: "Spam" }),
  );
  await f.erik.readConversation(o.id);
  d = await f.anna.conversation(o.id);
  assert(d.messages.find((x) => x.id === m.id).read_at);
  await f.erik.report({
    target_type: "message",
    target_id: m.id,
    reason: "Spam",
  });
  assert.equal((await f.sofia.moderation()).reports.length, 1);
});
test("blocking is symmetric for messages and offers and releases accepted items", async () => {
  const f = await fixture();
  const o = await f.anna.propose(proposal(f.a, f.b), f.b.id);
  await f.erik.offerAction(o.offer_id, { action: "accept" });
  await f.anna.block("erik", true);
  assert.equal((await f.anna.conversation(o.id)).offer.status, "cancelled");
  assert.equal((await f.anna.listing(f.a.id)).status, "active");
  await assert.rejects(() => f.erik.message(o.id, { body: "Hej" }));
  await assert.rejects(() => f.anna.message(o.id, { body: "Hej" }));
  await assert.rejects(() => f.anna.propose(proposal(f.a, f.b), f.b.id));
  await f.anna.block("erik", false);
  await f.anna.propose(proposal(f.a, f.b), f.b.id);
});
test("favorites are private and generate no owner notifications", async () => {
  const f = await fixture();
  const before = f.db.sqlite
    .prepare("SELECT count(*) n FROM notifications")
    .get().n;
  await f.anna.favorite(f.b.id, true);
  assert.equal((await f.anna.favorites()).length, 1);
  assert.equal((await f.erik.favorites()).length, 0);
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM notifications").get().n,
    before,
  );
});
test("saved search notifications are deduplicated and searches owned by their creator", async () => {
  const f = await fixture();
  const w = await f.anna.searches({
    query: "cykel",
    category_id: "sport",
    city: "Norrtälje",
    radius_km: 15,
  });
  const l = await f.item("erik", "Ny herrcykel", ["verktyg"]);
  await f.erik.alerts(l.id);
  assert.equal(
    f.db.sqlite
      .prepare(
        "SELECT count(*) n FROM notifications WHERE user_id='anna' AND type='alert'",
      )
      .get().n,
    1,
  );
  await f.erik.searches(undefined, w[0].id);
  assert.equal((await f.anna.searches()).length, 1);
  await assert.rejects(() =>
    f.anna.searches({ query: "", city: "Norrtälje", radius_km: 100 }),
  );
});
test("moderation is server-authorized, audited, hides listings and revokes suspended access", async () => {
  const f = await fixture();
  await assert.rejects(() => f.anna.moderation({ action: "hide", id: f.b.id }));
  await f.anna.report({
    target_type: "listing",
    target_id: f.b.id,
    reason: "Felaktig beskrivning",
  });
  await f.sofia.moderation({ action: "hide", id: f.b.id });
  await assert.rejects(() => f.anonymous.listing(f.b.id));
  await f.sofia.moderation({ action: "suspend", id: "erik" });
  await assert.rejects(() => f.erik.favorites(), /avstängt/);
  assert.equal((await f.sofia.moderation()).audit.length, 2);
  await f.sofia.moderation({ action: "reactivate", id: "erik" });
  await f.erik.favorites();
});
test("rate limiting rejects excessive sensitive operations", async () => {
  const f = await fixture();
  await f.anna.limit("anna", "test", 1);
  await assert.rejects(() => f.anna.limit("anna", "test", 1), /fort/);
});
test("radius preferences persist, default to 15 and reject arbitrary distances", async () => {
  const f = await fixture();
  await f.anna.preference({ radius: 50 });
  assert.equal(
    (await f.anna.profile("anna", true)).default_search_radius_km,
    50,
  );
  await assert.rejects(() => f.anna.preference({ radius: 16 }));
  await assert.rejects(() => f.erik.preference({ radius: 5, user_id: "anna" }));
  assert.equal(
    (await f.erik.profile("erik", true)).default_search_radius_km,
    15,
  );
});
test("unverified identities cannot publish or propose", async () => {
  const f = await fixture();
  await f.db
    .prepare("UPDATE users SET email_verified=0 WHERE id=?")
    .bind("anna")
    .run();
  await assert.rejects(
    () => f.anna.propose(proposal(f.a, f.b), f.b.id),
    /Verifiera/,
  );
});
test("older messages paginate without exposing other conversations", async () => {
  const f = await fixture();
  const o = await f.anna.propose(proposal(f.a, f.b), f.b.id);
  for (let i = 0; i < 65; i++)
    await f.db
      .prepare(
        "INSERT INTO messages(id,conversation_id,sender_id,type,body,created_at) VALUES (?,?,?,'user',?,?)",
      )
      .bind(
        `msg-${String(i).padStart(3, "0")}`,
        o.id,
        "anna",
        `Meddelande ${i}`,
        new Date(Date.now() + i * 1000).toISOString(),
      )
      .run();
  const first = await f.erik.conversation(o.id);
  assert.equal(first.messages.length, 50);
  assert(first.hasMoreMessages);
  const earlier = await f.erik.conversation(o.id, first.oldestCursor);
  assert.equal(earlier.messages.length, 16);
  assert.equal(
    new Set([...first.messages, ...earlier.messages].map((m) => m.id)).size,
    66,
  );
  await assert.rejects(() => f.sofia.conversation(o.id, first.oldestCursor));
});
test("server strips WebP metadata and validates dimensions and container lengths", async () => {
  const original = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "green" },
  })
    .withExif({ IFD0: { Copyright: "PRIVATE_METADATA" } })
    .webp()
    .toBuffer();
  const array = original.buffer.slice(
    original.byteOffset,
    original.byteOffset + original.byteLength,
  );
  const clean = sanitizeWebp(array, 1600);
  assert(!Buffer.from(clean).includes(Buffer.from("EXIF")));
  assert(!Buffer.from(clean).includes(Buffer.from("PRIVATE_METADATA")));
  const meta = await sharp(clean).metadata();
  assert.equal(meta.width, 120);
  assert.equal(meta.height, 80);
  assert.throws(() => sanitizeWebp(array, 100));
  const corrupt = array.slice(0);
  new Uint8Array(corrupt)[0] = 0;
  assert.throws(() => sanitizeWebp(corrupt, 1600));
});
