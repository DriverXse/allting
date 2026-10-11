import { z } from "zod/v3";
import {
  area,
  CATEGORIES,
  CONDITIONS,
  CITIES,
  REASONS,
  barterText,
  distance,
} from "./catalog";
import { matchItem, textMatches, type MatchItem } from "./matching";
import type { Listing, Profile, Offer } from "./types";
import { DEFAULT_THEME, THEME_PREFERENCES } from "./appearance";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Identity = {
  userId: string;
  email: string;
  fullName?: string | null;
  emailVerified?: boolean;
};
type Row = Record<string, unknown>;
type User = Profile & {
  lat: number;
  lng: number;
  suspended: number;
  role: string;
};
type RawListing = Listing & { lat: number; lng: number };
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const short = z.string().trim().min(1).max(100);
const barter = z
  .string()
  .trim()
  .max(4000)
  .refine(
    barterText,
    "Här föreslår vi bara byte av saker. Ta bort belopp och önskemål om pengar.",
  );
const cityInput = z.enum(CITIES.map((x) => x[0]) as [string, ...string[]], {
  errorMap: () => ({ message: "Välj en ort i listan." }),
});
const radius = z.union([z.literal(5), z.literal(15), z.literal(50)]);
const terms = z
  .array(
    z.string().trim().min(2).max(50).refine(barterText, "Ange saker du söker."),
  )
  .max(12);
const listingInput = z
  .object({
    title: barter.pipe(z.string().min(3).max(100)),
    description: barter.pipe(z.string().min(10)),
    category_id: z.enum(CATEGORIES.map((x) => x[0]) as [string, ...string[]]),
    condition: z.enum(CONDITIONS.map((x) => x[0]) as [string, ...string[]]),
    city: cityInput,
    wanted: terms,
    open_to_suggestions: z.boolean(),
    images: z.array(z.string().max(200)).min(1).max(6),
  })
  .strict()
  .refine(
    (v) => v.open_to_suggestions || v.wanted.length > 0,
    "Ange vad du söker eller välj Öppen för förslag.",
  );
const proposalInput = z
  .object({
    initiator_items: z.array(short).min(1).max(12),
    recipient_items: z.array(short).min(1).max(12),
    message: barter.pipe(z.string().max(1000)).default(""),
  })
  .strict();
const listingSelect = `SELECT l.*,u.display_name AS owner_name,
  COALESCE((SELECT json_group_array(image_url) FROM (SELECT image_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order)),'[]') AS images_json,
  COALESCE((SELECT json_group_array(term) FROM wanted_terms WHERE listing_id=l.id),'[]') AS wanted_json,
  (SELECT count(*) FROM trade_offer_items ti JOIN trade_offers o ON o.id=ti.trade_offer_id WHERE ti.listing_id=l.id AND o.status='pending') AS proposal_count
  FROM listings l JOIN users u ON u.id=l.owner_id`;
export class Service {
  constructor(
    public db: D1Database,
    public identity: Identity | null,
    public adminId?: string,
    public adminEmail?: string,
    public statisticsConsent = false,
  ) {}
  stmt(sql: string, ...args: unknown[]) {
    return this.db.prepare(sql).bind(...args);
  }
  async rows<T = Row>(sql: string, ...args: unknown[]): Promise<T[]> {
    return (await this.stmt(sql, ...args).all()).results as T[];
  }
  async first<T = Row>(sql: string, ...args: unknown[]): Promise<T | null> {
    return this.stmt(sql, ...args).first() as Promise<T | null>;
  }
  fail(status: number, message: string): never {
    throw new AppError(status, message);
  }
  async actor(verified = false): Promise<User> {
    if (!this.identity) this.fail(401, "Logga in för att fortsätta.");
    const u = await this.first<User>(
      "SELECT *,latitude_approx AS lat,longitude_approx AS lng FROM users WHERE id=?",
      this.identity.userId,
    );
    if (!u) this.fail(409, "Välj namn och ort för att komma igång.");
    if (u.suspended)
      this.fail(
        403,
        "Ditt konto är avstängt. Kontakta AllTing om du vill få beslutet omprövat.",
      );
    if (verified && (!u.email_verified || !this.identity.emailVerified))
      this.fail(403, "Verifiera din e-post innan du fortsätter.");
    return u;
  }
  async limit(u: string, action: string, max = 40, seconds = 60) {
    const bucket = Math.floor(Date.now() / 1000 / seconds),
      key = `${u}:${action}:${bucket}`;
    const r = await this.first<{ count: number }>(
      `INSERT INTO rate_limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
      key,
      (bucket + 2) * seconds,
    );
    if (r && r.count > max)
      this.fail(429, "Det gick lite fort. Vänta en stund och försök igen.");
    await this.stmt(
      "DELETE FROM rate_limits WHERE expires<?",
      Math.floor(Date.now() / 1000),
    ).run();
  }
  async event(
    u: string,
    type: string,
    r: number | null = null,
    n: number | null = null,
  ) {
    if (!this.statisticsConsent) return;
    await this.stmt(
      "INSERT INTO analytics_events(id,user_id,type,radius_km,item_count) VALUES (?,?,?,?,?)",
      id(),
      u,
      type,
      r,
      n,
    ).run();
  }
  notice(
    u: string,
    type: string,
    body: string,
    href: string,
    dedupe: string | null = null,
  ) {
    return this.stmt(
      "INSERT OR IGNORE INTO notifications(id,user_id,type,body,href,dedupe) VALUES (?,?,?,?,?,?)",
      id(),
      u,
      type,
      body,
      href,
      dedupe,
    );
  }
  async blocked(a: string, b: string) {
    return !!(await this.first(
      "SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)",
      a,
      b,
      b,
      a,
    ));
  }
  async profile(uid: string, privateFields = false): Promise<Profile> {
    const moderator =
      !!this.identity &&
      (this.adminId === this.identity.userId ||
        this.adminEmail?.toLowerCase() === this.identity.email.toLowerCase() ||
        !!(await this.first(
          "SELECT 1 FROM users WHERE id=? AND role='admin' AND suspended=0",
          this.identity.userId,
        )));
    const p = await this.first<Profile>(
      `SELECT id,display_name,avatar_url,bio,city,default_search_radius_km,email_verified,onboarded,created_at,
    (SELECT count(*) FROM listings WHERE owner_id=users.id AND status='active' AND moderated_hidden=0) active_count,
    (SELECT count(*) FROM trade_offers WHERE status='completed' AND (initiator_id=users.id OR recipient_id=users.id)) completed_count,
    (SELECT avg(stars) FROM reviews WHERE reviewed_user_id=users.id) rating,(SELECT count(*) FROM reviews WHERE reviewed_user_id=users.id) rating_count
    ${privateFields ? ",email,role,suspended,theme_preference" : ""} FROM users WHERE id=? ${privateFields || moderator ? "" : "AND suspended=0"}`,
      uid,
    );
    if (!p) this.fail(404, "Profilen finns inte.");
    if (
      privateFields &&
      this.identity?.userId === uid &&
      this.adminEmail?.toLowerCase() === this.identity.email.toLowerCase()
    )
      p.role = "admin";
    p.wanted = (
      await this.rows<{ term: string }>(
        "SELECT term FROM wanted_terms WHERE user_id=? AND category_id IS NULL",
        uid,
      )
    ).map((x) => x.term);
    p.interests = (
      await this.rows<{ category_id: string }>(
        "SELECT category_id FROM wanted_terms WHERE user_id=? AND category_id IS NOT NULL",
        uid,
      )
    ).map((x) => x.category_id);
    return p;
  }
  async me() {
    if (!this.identity) return { identity: null, user: null };
    const u = await this.first(
      "SELECT id FROM users WHERE id=?",
      this.identity.userId,
    );
    return {
      identity: {
        name: this.identity.fullName || "",
        email: this.identity.email,
      },
      user: u ? await this.profile(this.identity.userId, true) : null,
    };
  }
  async preference(input: unknown) {
    const u = await this.actor();
    const v = z
      .object({
        radius: radius.optional(),
        theme_preference: z.enum(THEME_PREFERENCES).optional(),
      })
      .strict()
      .refine((v) => v.radius !== undefined || v.theme_preference !== undefined)
      .parse(input);
    await this.limit(u.id, "preference", 20);
    await this.stmt(
      "UPDATE users SET default_search_radius_km=COALESCE(?,default_search_radius_km),theme_preference=COALESCE(?,theme_preference),updated_at=? WHERE id=?",
      v.radius ?? null,
      v.theme_preference ?? null,
      now(),
      u.id,
    ).run();
    if (v.radius !== undefined && u.default_search_radius_km !== v.radius)
      await this.event(u.id, "radius_changed", v.radius);
    return { ok: true };
  }
  async saveProfile(input: unknown) {
    if (!this.identity) this.fail(401, "Logga in för att skapa profil.");
    if (!this.identity.emailVerified)
      this.fail(403, "Verifiera din e-post innan du fortsätter.");
    const v = z
        .object({
          display_name: z.string().trim().min(2).max(50),
          bio: barter.pipe(z.string().max(400)).default(""),
          city: cityInput,
          default_search_radius_km: radius.default(15),
          wanted: terms.default([]),
          interests: z
            .array(z.enum(CATEGORIES.map((x) => x[0]) as [string, ...string[]]))
            .max(10)
            .default([]),
          avatar_url: z.string().max(200).nullable().optional(),
        })
        .strict()
        .parse(input),
      loc = area(v.city);
    await this.limit(this.identity.userId, "profile", 12);
    const old = await this.first<User>(
      "SELECT * FROM users WHERE id=?",
      this.identity.userId,
    );
    if (old?.suspended) this.fail(403, "Ditt konto är avstängt.");
    if (v.avatar_url)
      await this.validateImages([v.avatar_url], this.identity.userId);
    const role =
      this.adminId === this.identity.userId ||
      this.adminEmail?.toLowerCase() === this.identity.email.toLowerCase()
        ? "admin"
        : old?.role || "user";
    await this.db.batch([
      ...CATEGORIES.map((c) =>
        this.stmt(
          "INSERT OR IGNORE INTO categories(id,name) VALUES (?,?)",
          c[0],
          c[1],
        ),
      ),
      this.stmt(
        `INSERT INTO users(id,email,display_name,bio,city,latitude_approx,longitude_approx,default_search_radius_km,email_verified,onboarded,role,avatar_url,theme_preference) VALUES (?,?,?,?,?,?,?,?,1,1,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,city=excluded.city,latitude_approx=excluded.latitude_approx,longitude_approx=excluded.longitude_approx,default_search_radius_km=excluded.default_search_radius_km,email_verified=1,onboarded=1,avatar_url=excluded.avatar_url,updated_at=?`,
        this.identity.userId,
        this.identity.email,
        v.display_name,
        v.bio,
        loc.city,
        loc.lat,
        loc.lng,
        v.default_search_radius_km,
        role,
        v.avatar_url ?? null,
        DEFAULT_THEME,
        now(),
      ),
      this.stmt(
        "DELETE FROM wanted_terms WHERE user_id=?",
        this.identity.userId,
      ),
      ...v.wanted.map((t) =>
        this.stmt(
          "INSERT INTO wanted_terms(id,user_id,term) VALUES (?,?,?)",
          id(),
          this.identity!.userId,
          t,
        ),
      ),
      ...[...new Set(v.interests)].map((category) =>
        this.stmt(
          "INSERT INTO wanted_terms(id,user_id,term,category_id) VALUES (?,?,?,?)",
          id(),
          this.identity!.userId,
          CATEGORIES.find((c) => c[0] === category)![1],
          category,
        ),
      ),
    ]);
    await this.event(
      this.identity.userId,
      old ? "profile_updated" : "account_created",
      v.default_search_radius_km,
    );
    if (old && old.default_search_radius_km !== v.default_search_radius_km)
      await this.event(old.id, "radius_changed", v.default_search_radius_km);
    return this.profile(this.identity.userId, true);
  }
  raw(row: Row): RawListing {
    return {
      ...row,
      lat: row.latitude_approx,
      lng: row.longitude_approx,
      images: JSON.parse(String(row.images_json || "[]")),
      wanted: JSON.parse(String(row.wanted_json || "[]")),
    } as RawListing;
  }
  publicListing(
    l: RawListing,
    origin?: { lat: number; lng: number },
    favorite = false,
  ): Listing {
    return {
      id: l.id,
      owner_id: l.owner_id,
      title: l.title,
      description: l.description,
      category_id: l.category_id,
      condition: l.condition,
      city: l.city,
      status: l.status,
      open_to_suggestions: l.open_to_suggestions,
      created_at: l.created_at,
      images: l.images,
      wanted: l.wanted,
      owner_name: l.owner_name,
      distance: origin ? Math.round(distance(origin, l)) : null,
      favorite,
      proposal_count: l.proposal_count,
      ...(l.match ? { match: l.match } : {}),
    };
  }
  async inventory(uid: string, all = false) {
    return (
      await this.rows(
        `${listingSelect} WHERE l.owner_id=? AND l.status ${all ? "!='deleted'" : "='active' AND l.moderated_hidden=0"} ORDER BY l.created_at DESC`,
        uid,
      )
    ).map((x) => this.raw(x));
  }
  async discover(params: URLSearchParams) {
    const v = z
      .object({
        q: z.string().max(100).default(""),
        category: z.string().max(30).default(""),
        condition: z.string().max(20).default(""),
        city: cityInput.default("Norrtälje"),
        radius: z.coerce
          .number()
          .refine((n) => [5, 15, 50].includes(n))
          .default(15),
        matches: z.enum(["0", "1"]).default("0"),
        sort: z.enum(["near", "recent", "match"]).default("near"),
        page: z.coerce.number().int().min(1).max(100).default(1),
      })
      .strict()
      .parse(Object.fromEntries(params));
    const origin = area(v.city),
      uid = this.identity?.userId || "",
      own = uid ? await this.inventory(uid) : [],
      wanted = uid
        ? (
            await this.rows<{ term: string }>(
              "SELECT term FROM wanted_terms WHERE user_id=?",
              uid,
            )
          ).map((x) => x.term)
        : [];
    const fav = new Set(
      (
        await this.rows<{ listing_id: string }>(
          "SELECT listing_id FROM favorites WHERE user_id=?",
          uid,
        )
      ).map((x) => x.listing_id),
    );
    const latSpan = v.radius / 110,
      lngSpan = v.radius / (110 * Math.cos((origin.lat * Math.PI) / 180));
    const rows = await this.rows(
      `${listingSelect} WHERE l.status='active' AND l.moderated_hidden=0 AND u.suspended=0 AND l.owner_id!=? AND l.latitude_approx BETWEEN ? AND ? AND l.longitude_approx BETWEEN ? AND ? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=l.owner_id) OR (b.blocked_id=? AND b.blocker_id=l.owner_id)) ORDER BY l.created_at DESC`,
      uid,
      origin.lat - latSpan,
      origin.lat + latSpan,
      origin.lng - lngSpan,
      origin.lng + lngSpan,
      uid,
      uid,
    );
    const result = rows
      .map((x) => this.raw(x))
      .filter(
        (l) =>
          distance(origin, l) <= v.radius &&
          (!v.category || l.category_id === v.category) &&
          (!v.condition || l.condition === v.condition) &&
          (!v.q ||
            textMatches(v.q, {
              ...l,
              description: `${l.description} ${l.wanted.join(" ")}`,
            })),
      )
      .map((l) => ({
        l,
        m: matchItem(l as MatchItem, own as MatchItem[], wanted, origin),
      }))
      .filter((x) => v.matches === "0" || x.m)
      .sort((a, b) =>
        v.sort === "match"
          ? (b.m?.rank || 0) - (a.m?.rank || 0)
          : v.sort === "recent"
            ? b.l.created_at.localeCompare(a.l.created_at)
            : distance(origin, a.l) - distance(origin, b.l),
      );
    const page = result.slice((v.page - 1) * 24, v.page * 24).map(({ l, m }) =>
      this.publicListing(
        {
          ...l,
          ...(m
            ? {
                match: {
                  kind: m.kind as "mutual" | "open" | "wanted",
                  reason: m.reason,
                  alternatives: m.alternatives,
                },
              }
            : {}),
        },
        origin,
        fav.has(l.id),
      ),
    );
    if (uid && (await this.first("SELECT id FROM users WHERE id=?", uid))) {
      await this.event(uid, "search", v.radius);
      const displayed = page.filter((x) => x.match).length;
      if (displayed)
        await this.event(uid, "matches_viewed", v.radius, displayed);
    }
    return {
      items: page,
      total: result.length,
      page: v.page,
      hasMore: result.length > v.page * 24,
    };
  }
  async listing(lid: string) {
    const r = await this.first(`${listingSelect} WHERE l.id=?`, lid);
    if (!r) this.fail(404, "Saken finns inte.");
    const l = this.raw(r),
      uid = this.identity?.userId;
    const admin =
      uid &&
      (this.adminId === uid ||
        !!(await this.first(
          "SELECT 1 FROM users WHERE id=? AND role='admin' AND suspended=0",
          uid,
        )));
    const participant =
      uid &&
      (await this.first(
        "SELECT 1 FROM trade_offer_items ti JOIN trade_offers o ON o.id=ti.trade_offer_id WHERE ti.listing_id=? AND (o.initiator_id=? OR o.recipient_id=?)",
        lid,
        uid,
        uid,
      ));
    const unavailable =
      l.status !== "active" ||
      r.moderated_hidden ||
      (await this.first(
        "SELECT 1 FROM users WHERE id=? AND suspended=1",
        l.owner_id,
      ));
    if (
      (unavailable && !participant && uid !== l.owner_id && !admin) ||
      (uid &&
        (await this.blocked(uid, l.owner_id)) &&
        uid !== l.owner_id &&
        !participant &&
        !admin)
    )
      this.fail(404, "Saken är inte tillgänglig.");
    const me = uid
      ? await this.first<{ lat: number; lng: number }>(
          "SELECT latitude_approx lat,longitude_approx lng FROM users WHERE id=?",
          uid,
        )
      : null;
    return this.publicListing(
      l,
      me || undefined,
      uid
        ? !!(await this.first(
            "SELECT 1 FROM favorites WHERE user_id=? AND listing_id=?",
            uid,
            lid,
          ))
        : false,
    );
  }
  async validateImages(images: string[], uid: string) {
    for (const image of images) {
      if (
        !/^\/api\/images\/[a-zA-Z0-9-]+\.webp$/.test(image) ||
        !(await this.first(
          "SELECT 1 FROM uploads WHERE owner_id=? AND object_key=?",
          uid,
          image.slice("/api/images/".length),
        ))
      )
        this.fail(400, "Välj bilder som du själv har laddat upp.");
    }
  }
  async saveListing(input: unknown, lid?: string) {
    const u = await this.actor(true);
    await this.limit(u.id, "listing", 10);
    const v = listingInput.parse(input),
      loc = area(v.city);
    await this.validateImages(v.images, u.id);
    if (lid) {
      const old = await this.first(
        "SELECT * FROM listings WHERE id=? AND owner_id=?",
        lid,
        u.id,
      );
      if (!old) this.fail(404, "Saken finns inte.");
      if (
        !["active", "paused"].includes(String(old.status)) ||
        old.moderated_hidden
      )
        this.fail(409, "Saken kan inte redigeras just nu.");
    }
    lid = lid || id();
    const statements = [
      this.stmt(
        `INSERT INTO listings(id,owner_id,title,description,category_id,condition,city,latitude_approx,longitude_approx,open_to_suggestions) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category_id=excluded.category_id,condition=excluded.condition,city=excluded.city,latitude_approx=excluded.latitude_approx,longitude_approx=excluded.longitude_approx,open_to_suggestions=excluded.open_to_suggestions,updated_at=?`,
        lid,
        u.id,
        v.title,
        v.description,
        v.category_id,
        v.condition,
        loc.city,
        loc.lat,
        loc.lng,
        Number(v.open_to_suggestions),
        now(),
      ),
      this.stmt("DELETE FROM listing_images WHERE listing_id=?", lid),
      this.stmt("DELETE FROM wanted_terms WHERE listing_id=?", lid),
      ...v.images.map((x, i) =>
        this.stmt(
          "INSERT INTO listing_images(id,listing_id,image_url,sort_order) VALUES (?,?,?,?)",
          id(),
          lid,
          x,
          i,
        ),
      ),
      ...v.wanted.map((t) =>
        this.stmt(
          "INSERT INTO wanted_terms(id,listing_id,term) VALUES (?,?,?)",
          id(),
          lid,
          t,
        ),
      ),
    ];
    await this.db.batch(statements);
    await this.alerts(lid);
    return this.listing(lid);
  }
  async listingStatus(lid: string, input: unknown) {
    const u = await this.actor();
    await this.limit(u.id, "listing_status", 30);
    const v = z
      .object({ status: z.enum(["active", "paused", "traded", "deleted"]) })
      .strict()
      .parse(input);
    const old = await this.first(
      "SELECT * FROM listings WHERE id=? AND owner_id=?",
      lid,
      u.id,
    );
    if (!old) this.fail(404, "Saken finns inte.");
    if (
      !["active", "paused"].includes(String(old.status)) ||
      old.moderated_hidden
    )
      this.fail(409, "Saken ingår i ett byte eller är inte tillgänglig.");
    await this.stmt(
      "UPDATE listings SET status=?,updated_at=? WHERE id=? AND owner_id=? AND status IN ('active','paused')",
      v.status,
      now(),
      lid,
      u.id,
    ).run();
    return { ok: true };
  }
  async alerts(lid: string) {
    const row = await this.first(`${listingSelect} WHERE l.id=?`, lid);
    if (!row) return;
    const l = this.raw(row);
    const watches = await this.rows(
      "SELECT s.*,s.latitude_approx watch_lat,s.longitude_approx watch_lng FROM saved_searches s JOIN users u ON u.id=s.user_id WHERE u.suspended=0 AND s.user_id!=?",
      l.owner_id,
    );
    const stmts: D1PreparedStatement[] = [];
    for (const w of watches) {
      if (
        distance(l, { lat: Number(w.watch_lat), lng: Number(w.watch_lng) }) >
          Number(w.radius_km) ||
        (w.category_id && w.category_id !== l.category_id) ||
        (w.query && !textMatches(String(w.query), l)) ||
        (await this.blocked(String(w.user_id), l.owner_id))
      )
        continue;
      stmts.push(
        this.notice(
          String(w.user_id),
          "alert",
          `Ny träff på din bevakning: ${l.title}`,
          `/saker/${lid}`,
          `watch:${w.id}:${lid}`,
        ),
      );
    }
    const candidates = await this.rows(
      "SELECT id,latitude_approx lat,longitude_approx lng,default_search_radius_km radius FROM users WHERE suspended=0 AND id!=?",
      l.owner_id,
    );
    for (const p of candidates) {
      if (
        distance(l, { lat: Number(p.lat), lng: Number(p.lng) }) >
          Number(p.radius) ||
        (await this.blocked(String(p.id), l.owner_id))
      )
        continue;
      const own = await this.inventory(String(p.id)),
        wanted = (
          await this.rows<{ term: string }>(
            "SELECT term FROM wanted_terms WHERE user_id=?",
            p.id,
          )
        ).map((x) => x.term),
        m = matchItem(l as MatchItem, own as MatchItem[], wanted, {
          lat: Number(p.lat),
          lng: Number(p.lng),
        });
      if (m && m.kind !== "wanted")
        stmts.push(
          this.notice(
            String(p.id),
            "match",
            `${l.title}: ${m.reason}`,
            `/saker/${lid}`,
            `match:${p.id}:${lid}`,
          ),
        );
    }
    if (stmts.length) await this.db.batch(stmts);
  }
  async favorite(lid: string, on: boolean) {
    const u = await this.actor();
    await this.limit(u.id, "favorite", 60);
    await this.listing(lid);
    if (on)
      await this.stmt(
        "INSERT OR IGNORE INTO favorites(user_id,listing_id) VALUES (?,?)",
        u.id,
        lid,
      ).run();
    else
      await this.stmt(
        "DELETE FROM favorites WHERE user_id=? AND listing_id=?",
        u.id,
        lid,
      ).run();
    return { ok: true };
  }
  async favorites() {
    const u = await this.actor();
    const rows = await this.rows(
      `${listingSelect} JOIN favorites f ON f.listing_id=l.id WHERE f.user_id=? AND l.status='active' AND l.moderated_hidden=0 AND u.suspended=0 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=l.owner_id) OR (b.blocked_id=? AND b.blocker_id=l.owner_id)) ORDER BY f.created_at DESC`,
      u.id,
      u.id,
      u.id,
    );
    return rows.map((x) => this.publicListing(this.raw(x), u, true));
  }
  async current(oid: string) {
    const u = await this.actor();
    const o = await this.first<Offer>(
      `SELECT o.*,a.display_name initiator_name,b.display_name recipient_name FROM trade_offers o JOIN users a ON a.id=o.initiator_id JOIN users b ON b.id=o.recipient_id WHERE o.id=? AND (o.initiator_id=? OR o.recipient_id=?) AND o.status!='draft'`,
      oid,
      u.id,
      u.id,
    );
    if (!o) this.fail(404, "Bytesförslaget finns inte.");
    return { u, o };
  }
  async offerItems(o: Offer) {
    const r = await this.rows(
      `${listingSelect.replace("SELECT l.*", "SELECT ti.side,l.*")} JOIN trade_offer_items ti ON ti.listing_id=l.id WHERE ti.trade_offer_id=? ORDER BY ti.side,l.title`,
      o.id,
    );
    o.items = r.map((x) => ({
      ...this.publicListing(this.raw(x)),
      side: String(x.side),
    }));
    return o;
  }
  async propose(input: unknown, target: string, parentId?: string) {
    const u = await this.actor(true);
    await this.limit(u.id, "offer", 12);
    const v = proposalInput.parse(input),
      oid = id();
    let initiator = u.id,
      recipient = "",
      root = oid,
      old: Offer | undefined;
    if (parentId) {
      const c = await this.current(parentId);
      old = c.o;
      if (old.status !== "pending" || old.proposer_id === u.id)
        this.fail(409, "Det är inte din tur att svara på förslaget.");
      initiator = old.initiator_id;
      recipient = old.recipient_id;
      target = v.recipient_items[0];
      root = old.root_offer_id;
    } else {
      const l = await this.listing(target);
      if (l.status !== "active" || l.owner_id === u.id)
        this.fail(409, "Välj en aktiv sak från en annan person.");
      recipient = l.owner_id;
    }
    if (await this.blocked(initiator, recipient))
      this.fail(403, "Ni kan inte skicka bytesförslag till varandra.");
    if (!v.recipient_items.includes(target))
      this.fail(400, "Saken du vill byta till dig måste ingå.");
    const counterpart = u.id === initiator ? recipient : initiator;
    const stmts = [
      this.stmt(
        "INSERT INTO trade_offers(id,initiator_id,recipient_id,target_listing_id,parent_offer_id,root_offer_id,proposer_id,message) VALUES (?,?,?,?,?,?,?,?)",
        oid,
        initiator,
        recipient,
        target,
        parentId || null,
        root,
        u.id,
        v.message,
      ),
      ...v.initiator_items.map((l) =>
        this.stmt(
          "INSERT INTO trade_offer_items(id,trade_offer_id,listing_id,side) VALUES (?,?,?,'initiator')",
          id(),
          oid,
          l,
        ),
      ),
      ...v.recipient_items.map((l) =>
        this.stmt(
          "INSERT INTO trade_offer_items(id,trade_offer_id,listing_id,side) VALUES (?,?,?,'recipient')",
          id(),
          oid,
          l,
        ),
      ),
    ];
    if (old)
      stmts.push(
        this.stmt(
          "UPDATE trade_offers SET status='countered',updated_at=? WHERE id=? AND status='pending'",
          now(),
          old.id,
        ),
      );
    stmts.push(
      this.stmt(
        "UPDATE trade_offers SET status='pending',updated_at=? WHERE id=?",
        now(),
        oid,
      ),
    );
    if (!old)
      stmts.push(
        this.stmt(
          "INSERT INTO conversations(id,trade_offer_id,current_offer_id) VALUES (?,?,?)",
          root,
          root,
          oid,
        ),
      );
    else
      stmts.push(
        this.stmt(
          "UPDATE conversations SET current_offer_id=? WHERE id=?",
          oid,
          root,
        ),
      );
    stmts.push(
      this.stmt(
        "INSERT INTO messages(id,conversation_id,type,body) VALUES (?,?,'system',?)",
        id(),
        root,
        `${u.display_name} ${old ? "skickade ett motbud." : "föreslog ett byte."}`,
      ),
      this.notice(
        counterpart,
        old ? "counteroffer" : "offer",
        `${u.display_name} ${old ? "skickade ett motbud" : "föreslog ett byte"}.`,
        `/byten/${root}`,
      ),
    );
    await this.db.batch(stmts);
    await this.event(
      u.id,
      "offer_sent",
      u.default_search_radius_km,
      v.initiator_items.length + v.recipient_items.length,
    );
    return { id: root, offer_id: oid };
  }
  async offerAction(oid: string, input: unknown) {
    const { u, o } = await this.current(oid);
    await this.limit(u.id, "offer_action", 20);
    const v = z
      .object({ action: z.enum(["accept", "decline", "cancel", "complete"]) })
      .strict()
      .parse(input);
    if (
      ["accept", "decline"].includes(v.action) &&
      (o.status !== "pending" || o.proposer_id === u.id)
    )
      this.fail(409, "Förslaget går inte att besvara nu.");
    if (
      v.action === "accept" &&
      (await this.blocked(o.initiator_id, o.recipient_id))
    )
      this.fail(403, "Ni kan inte komma överens om nya byten.");
    if (v.action === "cancel" && !["pending", "accepted"].includes(o.status))
      this.fail(409, "Bytet går inte att avbryta.");
    if (v.action === "complete" && o.status !== "accepted")
      this.fail(409, "Ni behöver först komma överens om bytet.");
    const other = u.id === o.initiator_id ? o.recipient_id : o.initiator_id;
    if (v.action === "complete")
      await this.db.batch([
        this.stmt(
          `UPDATE trade_offers SET ${u.id === o.initiator_id ? "initiator_confirmed" : "recipient_confirmed"}=1,updated_at=? WHERE id=? AND status='accepted'`,
          now(),
          oid,
        ),
        this.notice(
          other,
          "completion",
          `${u.display_name} har markerat bytet som genomfört.`,
          `/byten/${o.root_offer_id}`,
          `confirmation:${oid}:${u.id}`,
        ),
      ]);
    else {
      const status = {
        accept: "accepted",
        decline: "declined",
        cancel: "cancelled",
      }[v.action];
      await this.db.batch([
        this.stmt(
          "UPDATE trade_offers SET status=?,accepted_at=CASE WHEN ?='accepted' THEN ? ELSE accepted_at END,updated_at=? WHERE id=?",
          status,
          status,
          now(),
          now(),
          oid,
        ),
        this.notice(
          other,
          status,
          `${u.display_name} ${v.action === "accept" ? "accepterade förslaget" : v.action === "decline" ? "avböjde förslaget" : "avbröt bytet"}.`,
          `/byten/${o.root_offer_id}`,
        ),
      ]);
    }
    return { ok: true };
  }
  async conversation(root: string, before?: string) {
    const { u, o } = await this.current(root);
    const c = await this.first<{ current_offer_id: string }>(
      "SELECT current_offer_id FROM conversations WHERE id=?",
      o.root_offer_id,
    );
    if (!c) this.fail(404, "Samtalet finns inte.");
    const history = await this.rows<Offer>(
      `SELECT o.*,a.display_name initiator_name,b.display_name recipient_name FROM trade_offers o JOIN users a ON a.id=o.initiator_id JOIN users b ON b.id=o.recipient_id WHERE root_offer_id=? AND status!='draft' ORDER BY created_at`,
      o.root_offer_id,
    );
    for (const offer of history) await this.offerItems(offer);
    const cursor = before ? z.string().max(160).parse(before).split("|") : null;
    if (
      cursor &&
      (cursor.length !== 2 || !/^\d{4}-\d{2}-\d{2}T/.test(cursor[0]))
    )
      this.fail(400, "Sidan med meddelanden kunde inte hittas.");
    const msgs = await this.rows(
      `SELECT id,sender_id,type,body,created_at,read_at FROM messages WHERE conversation_id=? ${cursor ? "AND (created_at<? OR (created_at=? AND id<?))" : ""} ORDER BY created_at DESC,id DESC LIMIT 51`,
      o.root_offer_id,
      ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []),
    );
    const page = msgs.slice(0, 50).reverse();
    return {
      offer: history.find((x) => x.id === c.current_offer_id),
      history,
      messages: page,
      hasMoreMessages: msgs.length > 50,
      oldestCursor: page.length ? `${page[0].created_at}|${page[0].id}` : null,
      blocked: await this.blocked(o.initiator_id, o.recipient_id),
      review: await this.first(
        "SELECT stars,comment FROM reviews WHERE trade_offer_id=? AND reviewer_id=?",
        c.current_offer_id,
        u.id,
      ),
    };
  }
  async conversations() {
    const u = await this.actor();
    return this.rows(
      `SELECT c.id,o.status,o.message,o.created_at,o.initiator_id,o.recipient_id,CASE WHEN o.initiator_id=? THEN b.display_name ELSE a.display_name END counterpart,l.title,
  (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) last_message,
  (SELECT count(*) FROM messages WHERE conversation_id=c.id AND type='user' AND sender_id!=? AND read_at IS NULL) unread
  FROM conversations c JOIN trade_offers o ON o.id=c.current_offer_id JOIN users a ON a.id=o.initiator_id JOIN users b ON b.id=o.recipient_id JOIN listings l ON l.id=o.target_listing_id WHERE o.initiator_id=? OR o.recipient_id=? ORDER BY COALESCE((SELECT max(created_at) FROM messages WHERE conversation_id=c.id),o.created_at) DESC`,
      u.id,
      u.id,
      u.id,
      u.id,
    );
  }
  async message(root: string, input: unknown) {
    const { u, o } = await this.current(root);
    await this.limit(u.id, "message", 30);
    if (await this.blocked(o.initiator_id, o.recipient_id))
      this.fail(403, "Ni kan inte skicka meddelanden till varandra.");
    const v = z
      .object({ body: barter.pipe(z.string().min(1).max(2000)) })
      .strict()
      .parse(input);
    const other = u.id === o.initiator_id ? o.recipient_id : o.initiator_id;
    await this.db.batch([
      this.stmt(
        "INSERT INTO messages(id,conversation_id,sender_id,type,body) VALUES (?,?,?,'user',?)",
        id(),
        o.root_offer_id,
        u.id,
        v.body,
      ),
      this.notice(
        other,
        "message",
        `${u.display_name} skickade ett meddelande.`,
        `/byten/${o.root_offer_id}`,
      ),
    ]);
    return { ok: true };
  }
  async readConversation(root: string) {
    const { u, o } = await this.current(root);
    await this.stmt(
      "UPDATE messages SET read_at=? WHERE conversation_id=? AND sender_id!=? AND read_at IS NULL",
      now(),
      o.root_offer_id,
      u.id,
    ).run();
    return { ok: true };
  }
  async review(oid: string, input: unknown) {
    const { u, o } = await this.current(oid);
    const v = z
      .object({
        stars: z.number().int().min(1).max(5),
        comment: barter.pipe(z.string().max(400)).default(""),
      })
      .strict()
      .parse(input);
    if (o.status !== "completed")
      this.fail(409, "Betyg kan lämnas när båda har bekräftat bytet.");
    await this.stmt(
      "INSERT INTO reviews(id,trade_offer_id,reviewer_id,reviewed_user_id,stars,comment) VALUES (?,?,?,?,?,?)",
      id(),
      oid,
      u.id,
      u.id === o.initiator_id ? o.recipient_id : o.initiator_id,
      v.stars,
      v.comment,
    ).run();
    return { ok: true };
  }
  async report(input: unknown) {
    const u = await this.actor();
    await this.limit(u.id, "report", 5, 3600);
    const v = z
      .object({
        target_type: z.enum(["listing", "user", "message"]),
        target_id: short,
        reason: z.enum(REASONS),
        details: z.string().trim().max(1000).default(""),
      })
      .strict()
      .parse(input);
    if (v.target_type === "listing") await this.listing(v.target_id);
    if (v.target_type === "user") await this.profile(v.target_id);
    if (v.target_type === "message") {
      const m = await this.first<{ conversation_id: string }>(
        "SELECT conversation_id FROM messages WHERE id=?",
        v.target_id,
      );
      if (!m) this.fail(404, "Meddelandet finns inte.");
      await this.current(m.conversation_id);
    }
    await this.stmt(
      "INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details) VALUES (?,?,?,?,?,?)",
      id(),
      u.id,
      v.target_type,
      v.target_id,
      v.reason,
      v.details,
    ).run();
    return { ok: true };
  }
  async block(uid: string, on: boolean) {
    const u = await this.actor();
    await this.limit(u.id, "block", 15, 3600);
    if (uid === u.id) this.fail(400, "Du kan inte blockera dig själv.");
    if (!(await this.first("SELECT id FROM users WHERE id=?", uid)))
      this.fail(404, "Profilen finns inte.");
    if (on)
      await this.stmt(
        "INSERT OR IGNORE INTO blocks(blocker_id,blocked_id) VALUES (?,?)",
        u.id,
        uid,
      ).run();
    else
      await this.stmt(
        "DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?",
        u.id,
        uid,
      ).run();
    return { ok: true };
  }
  async searches(input?: unknown, deleteId?: string) {
    const u = await this.actor();
    if (deleteId)
      await this.stmt(
        "DELETE FROM saved_searches WHERE id=? AND user_id=?",
        deleteId,
        u.id,
      ).run();
    if (input) {
      await this.limit(u.id, "search_save", 10);
      const v = z
          .object({
            query: barter.pipe(z.string().max(100)).default(""),
            category_id: z.string().max(30).nullable().default(null),
            city: cityInput,
            radius_km: radius.default(15),
          })
          .strict()
          .parse(input),
        loc = area(v.city);
      if (v.category_id && !CATEGORIES.some((c) => c[0] === v.category_id))
        this.fail(400, "Välj kategori.");
      await this.stmt(
        "INSERT INTO saved_searches(id,user_id,query,category_id,city,radius_km,latitude_approx,longitude_approx) VALUES (?,?,?,?,?,?,?,?)",
        id(),
        u.id,
        v.query,
        v.category_id,
        loc.city,
        v.radius_km,
        loc.lat,
        loc.lng,
      ).run();
    }
    return this.rows(
      "SELECT id,query,category_id,city,radius_km,created_at FROM saved_searches WHERE user_id=? ORDER BY created_at DESC",
      u.id,
    );
  }
  async admin() {
    const u = await this.actor();
    if (
      u.role !== "admin" &&
      this.adminId !== u.id &&
      this.adminEmail?.toLowerCase() !== this.identity?.email.toLowerCase()
    )
      this.fail(403, "Du har inte tillgång till den här sidan.");
    return u;
  }
  async moderation(input?: unknown) {
    const u = await this.admin();
    if (input) await this.limit(u.id, "moderation", 30);
    if (input) {
      const v = z
        .object({
          action: z.enum(["hide", "show", "suspend", "reactivate", "resolve"]),
          id: short,
        })
        .strict()
        .parse(input);
      if (v.id === u.id && v.action === "suspend")
        this.fail(400, "Du kan inte stänga av ditt eget konto.");
      const statements = [
        this.stmt(
          "INSERT INTO audit_log(id,actor_id,action,target_id) VALUES (?,?,?,?)",
          id(),
          u.id,
          v.action,
          v.id,
        ),
      ];
      if (["hide", "show"].includes(v.action))
        statements.push(
          this.stmt(
            "UPDATE listings SET moderated_hidden=? WHERE id=?",
            Number(v.action === "hide"),
            v.id,
          ),
        );
      else if (v.action === "resolve")
        statements.push(
          this.stmt("UPDATE reports SET status='resolved' WHERE id=?", v.id),
        );
      else
        statements.push(
          this.stmt(
            "UPDATE users SET suspended=? WHERE id=?",
            Number(v.action === "suspend"),
            v.id,
          ),
        );
      await this.db.batch(statements);
    }
    return {
      reports: await this.rows(
        `SELECT r.*,p.display_name reporter_name,CASE r.target_type WHEN 'listing' THEN (SELECT title FROM listings WHERE id=r.target_id) WHEN 'user' THEN (SELECT display_name FROM users WHERE id=r.target_id) ELSE (SELECT body FROM messages WHERE id=r.target_id) END target_text FROM reports r JOIN users p ON p.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 100`,
      ),
      users: await this.rows(
        "SELECT id,display_name,city,suspended FROM users ORDER BY suspended DESC,created_at DESC LIMIT 100",
      ),
      audit: await this.rows(
        "SELECT a.*,u.display_name actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100",
      ),
      metrics: await this.metrics(),
    };
  }
  async metrics() {
    return {
      totals: await this.first(
        `SELECT (SELECT count(*) FROM listings WHERE status='active' AND moderated_hidden=0) active_listings,(SELECT count(*) FROM trade_offers WHERE status!='draft') offers,(SELECT count(*) FROM trade_offers WHERE accepted_at IS NOT NULL) accepted,(SELECT count(*) FROM trade_offers WHERE status='completed') completed,(SELECT count(*) FROM listings WHERE EXISTS(SELECT 1 FROM trade_offer_items WHERE listing_id=listings.id)) listings_with_offers,(SELECT count(*) FROM trade_offers o WHERE (SELECT count(*) FROM trade_offer_items WHERE trade_offer_id=o.id)>2) multi_item_offers`,
      ),
      radii: await this.rows(
        "SELECT default_search_radius_km radius,count(*) users FROM users GROUP BY default_search_radius_km",
      ),
      events: await this.rows(
        "SELECT type,radius_km,count(*) count,sum(item_count) items FROM analytics_events GROUP BY type,radius_km",
      ),
      perUser: await this.rows(
        "SELECT u.id,u.display_name,count(l.id) active_listings FROM users u LEFT JOIN listings l ON l.owner_id=u.id AND l.status='active' GROUP BY u.id",
      ),
      timings: await this.rows(
        `SELECT u.id,(SELECT (julianday(min(created_at))-julianday(u.created_at))*24*60 FROM analytics_events WHERE user_id=u.id AND type='matches_viewed' AND item_count>0) first_match_minutes,(SELECT (julianday(min(created_at))-julianday(u.created_at))*24*60 FROM notifications WHERE user_id=u.id AND type='offer') first_offer_minutes FROM users u`,
      ),
      returningUsers: await this.first(
        "SELECT count(*) count FROM (SELECT user_id FROM analytics_events WHERE type='session' GROUP BY user_id HAVING count(DISTINCT substr(created_at,1,10))>1)",
      ),
    };
  }
}
