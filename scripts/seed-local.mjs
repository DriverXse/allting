// Deliberately no remote option: demo accounts and data must never be seeded in production.
import { Miniflare } from "miniflare";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { build } from "esbuild";
if (process.argv[2] !== "--local")
  throw new Error("Use --local. Production seeding is disabled.");
mkdirSync(".sites-runtime", { recursive: true });
await build({
  stdin: {
    contents:
      "export {Service} from './lib/service'; export {CATEGORIES,CITIES} from './lib/catalog';",
    resolveDir: process.cwd(),
  },
  outfile: ".sites-runtime/seed-service.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const { Service, CATEGORIES, CITIES } =
  await import("../.sites-runtime/seed-service.mjs");
const mf = new Miniflare({
  modules: true,
  script: 'export default {fetch(){return new Response("local")}}',
  compatibilityDate: "2026-05-15",
  d1Databases: { DB: "00000000-0000-4000-8000-000000000000" },
  d1Persist: resolve(".wrangler/state/v3/d1"),
  r2Buckets: { BUCKET: "allting-uploads" },
  r2Persist: resolve(".wrangler/state/v3/r2"),
});
try {
  const db = await mf.getD1Database("DB"),
    bucket = await mf.getR2Bucket("BUCKET");
  if (await db.prepare("SELECT id FROM users WHERE id='local_seedy'").first())
    throw new Error("Local demo already exists; not overwriting user data.");
  const names = [
    "Anna",
    "Erik",
    "Sofia",
    "Johan",
    "Lisa",
    "Anders",
    "Maria",
    "Oskar",
    "Karin",
    "Emil",
    "Sara",
    "Lars",
    "Elin",
    "Mikael",
    "Emma",
    "Fredrik",
    "Lina",
    "Daniel",
    "Ingrid",
    "Per",
  ];
  const ids = names.map((_, i) =>
    i === 0 ? "local_seedy" : `seed_${names[i].toLowerCase()}`,
  );
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  await db.batch(
    CATEGORIES.map((c) =>
      stmt("INSERT OR IGNORE INTO categories(id,name) VALUES (?,?)", ...c),
    ),
  );
  const locations = [
    ...Array(8).fill(CITIES[0]),
    CITIES[5],
    CITIES[6],
    CITIES[2],
    CITIES[1],
    CITIES[7],
    CITIES[8],
    CITIES[9],
    CITIES[10],
    CITIES[13],
    CITIES[14],
    CITIES[15],
    CITIES[16],
  ];
  await db.batch(
    names.map((name, i) =>
      stmt(
        "INSERT INTO users(id,email,display_name,city,latitude_approx,longitude_approx,email_verified,onboarded,role,bio) VALUES (?,?,?,?,?,?,1,1,?,?)",
        ids[i],
        `${ids[i]}@example.test`,
        name,
        ...locations[i],
        i === 0 ? "admin" : "user",
        i < 3 ? "Byter gärna sådant som inte kommer till användning." : "",
      ),
    ),
  );
  const things = [
    ["Bosch borrmaskin 18V", "tools", "cykel"],
    ["Crescent cykel", "sport", "verktyg"],
    ["Tält för två", "sport", "borrmaskin"],
    ["Ekstol", "home", "trädgårdsredskap"],
    ["Verktygslåda", "tools", "cykel"],
    ["Cykelhjälm", "sport", "verktyg"],
    ["Högtalare", "electronics", "verktyg"],
    ["Läslampa", "home", "böcker"],
    ["Spade och kratta", "garden", "verktyg"],
    ["Brio tågbana", "children", "pussel"],
    ["Vinterjacka", "clothes", "campingutrustning"],
    ["Takräcke", "vehicles", "verktyg"],
    ["Bokpaket", "hobby", "växter"],
    ["Kaffebryggare", "home", "böcker"],
    ["Ryggsäck 45 liter", "sport", "cykel"],
    ["Pussel 1000 bitar", "hobby", "böcker"],
    ["Barncykel 16 tum", "children", "verktyg"],
    ["Gräsklippare", "garden", "cykel"],
    ["Systemkamera", "electronics", "campingutrustning"],
    ["Keramikskålar", "home", "växter"],
  ];
  // Explicit local demo placeholders. No external photos, tracking or invented photo provenance.
  const pictures = {};
  for (const [cat, label] of CATEGORIES) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="720"><rect width="900" height="720" fill="#ece9df"/><rect x="210" y="160" width="480" height="310" rx="9" fill="#d6dbce"/><path d="M320 370L410 270L480 340L540 290L610 370" fill="none" stroke="#7f927b" stroke-width="8"/><circle cx="565" cy="235" r="22" fill="#9bac94"/><text x="450" y="550" font-family="Arial" font-size="30" fill="#465b43" text-anchor="middle">${label.replace("&", "&amp;")}</text><text x="450" y="595" font-family="Arial" font-size="20" fill="#6d7467" text-anchor="middle">Lokal demobild</text></svg>`;
    pictures[cat] = {
      large: await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer(),
      thumb: await sharp(Buffer.from(svg))
        .resize(480)
        .webp({ quality: 80 })
        .toBuffer(),
    };
  }
  const items = [];
  for (let i = 0; i < 80; i++) {
    const ownerIndex = i % 20,
      t = things[i % 20],
      city = locations[ownerIndex],
      lid = `seed-listing-${i + 1}`,
      key = `seed-image-${i + 1}.webp`,
      title =
        i < 20
          ? t[0]
          : `${t[0]}${i < 40 ? " med tillbehör" : i < 60 ? " i bra skick" : " som blivit över"}`;
    // Anna/Erik have additional alternatives to demonstrate combinations.
    const actual =
      i === 20
        ? ["Verktygslåda", "tools", "cykel"]
        : i === 21
          ? ["Cykelhjälm", "sport", "verktyg"]
          : t;
    await bucket.put(key, pictures[actual[1]].large, {
      httpMetadata: { contentType: "image/webp" },
    });
    await bucket.put(`thumb-${key}`, pictures[actual[1]].thumb, {
      httpMetadata: { contentType: "image/webp" },
    });
    await db.batch([
      stmt(
        "INSERT INTO uploads(id,owner_id,object_key) VALUES (?,?,?)",
        key,
        ids[ownerIndex],
        key,
      ),
      stmt(
        "INSERT INTO listings(id,owner_id,title,description,category_id,condition,city,latitude_approx,longitude_approx,open_to_suggestions) VALUES (?,?,?,?,?,?,?,?,?,?)",
        lid,
        ids[ownerIndex],
        i === 20 || i === 21 ? actual[0] : title,
        "Använd men fungerar som den ska. Alla delar följer med. Hämtas vid överenskommen mötesplats.",
        actual[1],
        i % 4 === 0 ? "excellent" : "good",
        ...city,
        Number(i % 7 === 2),
      ),
      stmt(
        "INSERT INTO listing_images(id,listing_id,image_url,sort_order) VALUES (?,?,?,0)",
        key,
        lid,
        `/api/images/${key}`,
      ),
      ...(i % 7 === 2
        ? []
        : [
            stmt(
              "INSERT INTO wanted_terms(id,listing_id,term) VALUES (?,?,?)",
              `${lid}-wanted`,
              lid,
              actual[2],
            ),
          ]),
    ]);
    items.push(lid);
  }
  await db.batch([
    stmt(
      "INSERT INTO wanted_terms(id,user_id,term) VALUES (?,?,?)",
      "anna-wants",
      ids[0],
      "cykel",
    ),
    stmt(
      "INSERT INTO wanted_terms(id,user_id,term) VALUES (?,?,?)",
      "erik-wants",
      ids[1],
      "verktyg",
    ),
  ]);
  const services = ids.map(
    (uid, i) =>
      new Service(
        db,
        { userId: uid, email: `${uid}@example.test`, emailVerified: true },
        i === 0 ? uid : undefined,
      ),
  );
  const offer = (a, b, extra = {}) => ({
    initiator_items: [items[a]],
    recipient_items: [items[b]],
    message: "Vill du byta? Jag kan ses i Norrtälje i helgen.",
    ...extra,
  });
  const incoming = await services[1].propose(offer(1, 0), items[0]);
  await services[1].message(incoming.id, {
    body: "Både lås och lampor följer med cykeln.",
  });
  const multi = await services[0].propose(
    offer(20, 21, { initiator_items: [items[0], items[20]] }),
    items[21],
  );
  await services[1].propose(
    offer(20, 21, {
      initiator_items: [items[20]],
      recipient_items: [items[21], items[41]],
      message: "Skulle de här sakerna passa bättre?",
    }),
    "",
    multi.offer_id,
  );
  const accepted = await services[3].propose(offer(3, 4), items[4]);
  await services[4].offerAction(accepted.offer_id, { action: "accept" });
  for (const [a, b] of [
    [5, 6],
    [7, 8],
    [9, 10],
  ]) {
    const o = await services[a].propose(offer(a, b), items[b]);
    await services[b].offerAction(o.offer_id, { action: "accept" });
    await services[a].offerAction(o.offer_id, { action: "complete" });
    await services[b].offerAction(o.offer_id, { action: "complete" });
    await services[a].review(o.offer_id, {
      stars: 5,
      comment: "Enkelt att komma överens. Saken var som beskriven.",
    });
    await services[b].review(o.offer_id, {
      stars: 4,
      comment: "Trevligt byte, allt gick bra.",
    });
  }
  await services[0].searches({
    query: "cykel",
    category_id: "sport",
    city: "Norrtälje",
    radius_km: 15,
  });
  await services[0].favorite(items[2], true);
  await services[0].report({
    target_type: "listing",
    target_id: items[11],
    reason: "Felaktig beskrivning",
    details: "Tillbehören på bilden verkar inte följa med.",
  });
  console.log(
    "Seeded 20 local users, 80 listings, proposals, counteroffer, agreement, completed trades, reviews and a report.",
  );
} finally {
  await mf.dispose();
}
