import { env } from "cloudflare:workers";
import { getAllTingUser, authConfig } from "@/lib/auth-runtime";
import { authRequest } from "@/lib/auth-http";
import { AppError, Service } from "@/lib/service";
import { ZodError } from "zod/v3";
import { sanitizeWebp } from "@/lib/uploads";
import { consentFromCookie } from "@/lib/consent";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    },
  });
async function run(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: p } = await ctx.params,
      url = new URL(request.url),
      method = request.method;
    if (method !== "GET") {
      const origin = request.headers.get("origin");
      if (
        !origin ||
        origin !== url.origin ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        throw new AppError(403, "Begäran måste komma från AllTing.");
    }
    if (!env.DB)
      throw new AppError(
        503,
        "AllTing kan inte nå databasen just nu. Försök igen om en stund.",
      );
    if (p[0] === "auth") return authRequest(request, env.DB, authConfig());
    const identity = await getAllTingUser(request),
      s = new Service(
        env.DB,
        identity,
        (env as unknown as { ADMIN_USER_ID?: string }).ADMIN_USER_ID,
        (env as unknown as { ADMIN_EMAIL?: string }).ADMIN_EMAIL,
        consentFromCookie(request.headers.get("cookie"))?.statistics === true,
      );
    if (p[0] === "images") {
      if (method === "POST") {
        const u = await s.actor(true);
        await s.limit(u.id, "upload", 24, 3600);
        if (Number(request.headers.get("content-length") || 0) > 5_000_000)
          throw new AppError(413, "Bilden är för stor.");
        if (
          !request.headers
            .get("content-type")
            ?.startsWith("multipart/form-data;")
        )
          throw new AppError(415, "Välj en bildfil.");
        const bytesIn = await boundedBody(request, 4_000_000);
        const data = await new Response(bytesIn, {
            headers: {
              "Content-Type": request.headers.get("content-type") || "",
            },
          }).formData(),
          file = data.get("image"),
          thumb = data.get("thumbnail");
        if (!(file instanceof File) || !(thumb instanceof File))
          throw new AppError(400, "Välj en bild.");
        const bytes = await validWebp(file, 3_000_000, 1600),
          tiny = await validWebp(thumb, 500_000, 480),
          key = `${crypto.randomUUID()}.webp`;
        if (!env.BUCKET)
          throw new AppError(503, "Bildlagringen är inte tillgänglig.");
        await env.BUCKET.put(key, bytes, {
          httpMetadata: { contentType: "image/webp" },
        });
        await env.BUCKET.put(`thumb-${key}`, tiny, {
          httpMetadata: { contentType: "image/webp" },
        });
        await s
          .stmt(
            "INSERT INTO uploads(id,owner_id,object_key) VALUES (?,?,?)",
            crypto.randomUUID(),
            u.id,
            key,
          )
          .run();
        return response({ url: `/api/images/${key}` }, 201);
      }
      if (method === "GET" && p[1]) {
        if (!/^[a-zA-Z0-9-]+\.webp$/.test(p[1]))
          throw new AppError(404, "Bilden finns inte.");
        const uid = identity?.userId || "",
          image = `/api/images/${p[1]}`;
        let allowed = await s.first(
          `SELECT 1 FROM uploads WHERE object_key=? AND owner_id=? UNION SELECT 1 FROM listing_images i JOIN listings l ON l.id=i.listing_id JOIN users u ON u.id=l.owner_id WHERE i.image_url=? AND ((l.status='active' AND l.moderated_hidden=0 AND u.suspended=0) OR l.owner_id=? OR EXISTS(SELECT 1 FROM trade_offer_items ti JOIN trade_offers o ON o.id=ti.trade_offer_id WHERE ti.listing_id=l.id AND (o.initiator_id=? OR o.recipient_id=?))) UNION SELECT 1 FROM users WHERE avatar_url=? AND suspended=0`,
          p[1],
          uid,
          image,
          uid,
          uid,
          uid,
          image,
        );
        if (!allowed && identity) {
          try {
            await s.admin();
            allowed = { admin: true };
          } catch {}
        }
        if (!allowed) throw new AppError(404, "Bilden finns inte.");
        const obj = await env.BUCKET?.get(
          `${url.searchParams.get("thumb") === "1" ? "thumb-" : ""}${p[1]}`,
        );
        if (!obj) throw new AppError(404, "Bilden finns inte.");
        return new Response(obj.body, {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "private, max-age=120",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    let data: unknown;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      if (!request.headers.get("content-type")?.includes("application/json"))
        throw new AppError(415, "Fel format på begäran.");
      const text = new TextDecoder().decode(await boundedBody(request, 24000));
      try {
        data = JSON.parse(text);
      } catch {
        throw new AppError(400, "Begäran kunde inte läsas.");
      }
    }
    if (method === "GET") {
      if (p[0] === "me") return response(await s.me());
      if (p[0] === "listings")
        return response(
          p[1] ? await s.listing(p[1]) : await s.discover(url.searchParams),
        );
      if (p[0] === "inventory") {
        const u = await s.actor();
        return response(
          (await s.inventory(u.id, true)).map((l) => s.publicListing(l, u)),
        );
      }
      if (p[0] === "profiles" && p[1]) {
        const profile = await s.profile(p[1]);
        return response({
          profile,
          items: (await s.inventory(p[1])).map((l) => s.publicListing(l)),
          reviews: await s.rows(
            "SELECT r.stars,r.comment,r.created_at,u.display_name reviewer_name FROM reviews r JOIN users u ON u.id=r.reviewer_id WHERE r.reviewed_user_id=? ORDER BY r.created_at DESC LIMIT 50",
            p[1],
          ),
        });
      }
      if (p[0] === "favorites") return response(await s.favorites());
      if (p[0] === "trades")
        return response(
          p[1]
            ? await s.conversation(
                p[1],
                url.searchParams.get("before") || undefined,
              )
            : await s.conversations(),
        );
      if (p[0] === "searches") return response(await s.searches());
      if (p[0] === "notifications") {
        const u = await s.actor();
        return response(
          await s.rows(
            "SELECT id,type,body,href,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
            u.id,
          ),
        );
      }
      if (p[0] === "blocks") {
        const u = await s.actor();
        return response(
          await s.rows(
            "SELECT b.blocked_id id,u.display_name FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=?",
            u.id,
          ),
        );
      }
      if (p[0] === "admin") return response(await s.moderation());
    }
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      if (p[0] === "profile") return response(await s.saveProfile(data));
      if (p[0] === "preferences") return response(await s.preference(data));
      if (p[0] === "listings")
        return response(
          p[2] === "status"
            ? await s.listingStatus(p[1], data)
            : await s.saveListing(data, p[1]),
        );
      if (p[0] === "favorites" && p[1])
        return response(await s.favorite(p[1], true));
      if (p[0] === "trades") {
        if (!p[1]) {
          const v = data as Record<string, unknown>;
          if (!v || typeof v.target !== "string")
            throw new AppError(400, "Välj en sak.");
          const { target, ...proposal } = v;
          return response(await s.propose(proposal, target));
        }
        if (p[2] === "counter")
          return response(await s.propose(data, "", p[1]));
        if (p[2] === "action") return response(await s.offerAction(p[1], data));
        if (p[2] === "messages") return response(await s.message(p[1], data));
        if (p[2] === "read") return response(await s.readConversation(p[1]));
        if (p[2] === "review") return response(await s.review(p[1], data));
      }
      if (p[0] === "reports") return response(await s.report(data));
      if (p[0] === "blocks" && p[1]) return response(await s.block(p[1], true));
      if (p[0] === "searches") return response(await s.searches(data));
      if (p[0] === "notifications") {
        const u = await s.actor();
        if (p[1])
          await s
            .stmt(
              "UPDATE notifications SET read_at=? WHERE id=? AND user_id=?",
              new Date().toISOString(),
              p[1],
              u.id,
            )
            .run();
        else
          await s
            .stmt(
              "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
              new Date().toISOString(),
              u.id,
            )
            .run();
        return response({ ok: true });
      }
      if (p[0] === "admin") return response(await s.moderation(data));
      if (p[0] === "session") {
        const u = await s.actor();
        if (!s.statisticsConsent) return response({ ok: true });
        await s.limit(u.id, "session", 1, 1800);
        await s.event(u.id, "session", u.default_search_radius_km);
        return response({ ok: true });
      }
    }
    if (method === "DELETE") {
      if (p[0] === "favorites" && p[1])
        return response(await s.favorite(p[1], false));
      if (p[0] === "searches" && p[1])
        return response(await s.searches(undefined, p[1]));
      if (p[0] === "blocks" && p[1])
        return response(await s.block(p[1], false));
    }
    throw new AppError(404, "Sidan finns inte.");
  } catch (error) {
    if (error instanceof AppError)
      return response({ error: error.message }, error.status);
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const message =
        issue?.code === "custom"
          ? issue.message
          : issue?.code === "unrecognized_keys"
            ? "Begäran innehåller fält som inte stöds."
            : issue?.message === "Välj en ort i listan."
              ? issue.message
              : "Kontrollera att alla obligatoriska uppgifter är ifyllda och har rätt format.";
      return response({ error: message }, 400);
    }
    if (
      error instanceof Error &&
      /constraint|UNIQUE|trade_|listing_|offer_|review_|blocked|reserved|participants|inactive/i.test(
        error.message,
      )
    )
      return response(
        {
          error:
            "Uppgifterna har ändrats eller sakerna är inte längre tillgängliga. Uppdatera sidan och försök igen.",
        },
        409,
      );
    console.error(
      "AllTing request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return response({ error: "Något gick fel. Försök igen om en stund." }, 500);
  }
}
async function validWebp(file: File, max: number, maxDimension: number) {
  if (file.type !== "image/webp" || file.size < 30 || file.size > max)
    throw new AppError(400, "Bilden behöver vara en WebP-bild i rätt storlek.");
  try {
    return sanitizeWebp(await file.arrayBuffer(), maxDimension);
  } catch (error) {
    throw new AppError(400, (error as Error).message);
  }
}

async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new AppError(413, "Filen eller texten är för stor.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AppError(413, "Filen eller texten är för stor.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
export { run as GET, run as POST, run as PUT, run as PATCH, run as DELETE };
