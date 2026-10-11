import { z } from "zod/v3";
import { createAuth, type AuthConfig, type LoginMail } from "./auth";
import { AppError, Service } from "./service";
import { safeReturnPath } from "./auth-navigation";
import { firebaseClient, type FirebaseTransport } from "./firebase-auth";

const emailSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((x) => x.toLowerCase()),
    return_to: z.string().max(1500).optional(),
  })
  .strict();
const verificationSchema = z
  .object({
    token: z.string().regex(/^[a-zA-Z0-9]{32,128}$/),
    return_to: z.string().max(1500).optional(),
  })
  .strict();
const passwordSchema = emailSchema.extend({
  password: z.string().min(1).max(128),
});
async function digest(value: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
function result(body: unknown, status = 200, authHeaders?: Headers) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  for (const cookie of authHeaders?.getSetCookie() || [])
    headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
export async function authRequest(
  request: Request,
  db: D1Database,
  config: AuthConfig,
  sender?: (mail: LoginMail) => Promise<void>,
  transport?: FirebaseTransport,
) {
  try {
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/config" && request.method === "GET")
      return result({ method: config.method || "magic-link" });
    const allowed =
      request.method === "POST" &&
      [
        "/api/auth/login",
        "/api/auth/verify",
        "/api/auth/sign-out",
        "/api/auth/password-login",
        "/api/auth/register",
        "/api/auth/resend-verification",
        "/api/auth/reset-password",
      ].includes(path);
    if (!allowed) return result({ error: "Sidan finns inte." }, 404);
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new AppError(403, "Begäran måste komma från AllTing.");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError(415, "Fel format på begäran.");
    if (!request.body) throw new AppError(400, "Fyll i din e-postadress.");
    const reader = request.body.getReader();
    let length = 0,
      text = "";
    const decoder = new TextDecoder();
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > 4096) {
        await reader.cancel();
        throw new AppError(413, "Begäran är för stor.");
      }
      text += decoder.decode(next.value, { stream: true });
    }
    let body: unknown;
    try {
      body = JSON.parse(text + decoder.decode());
    } catch {
      throw new AppError(400, "Begäran kunde inte läsas.");
    }
    if (
      path.endsWith("/login") &&
      !sender &&
      !config.testMailUrl &&
      (!config.resendKey || !config.emailFrom)
    )
      throw new AppError(
        503,
        "Inloggningen är inte tillgänglig just nu. Försök igen senare.",
      );
    const auth = createAuth(db, config, sender);
    const limits = new Service(db, null);
    const client = await digest(
      `${config.secret}:ip:${request.headers.get("cf-connecting-ip") || "unknown"}`,
    );
    if (
      [
        "/api/auth/password-login",
        "/api/auth/register",
        "/api/auth/resend-verification",
        "/api/auth/reset-password",
      ].includes(path)
    ) {
      if (config.method !== "password")
        throw new AppError(404, "Sidan finns inte.");
      const resetting = path.endsWith("/reset-password"),
        v = resetting ? emailSchema.parse(body) : passwordSchema.parse(body),
        emailKey = await digest(`${config.secret}:email:${v.email}`),
        sending = !path.endsWith("/password-login");
      await limits.limit(
        client,
        "password_auth_ip",
        config.development ? 200 : 30,
        600,
      );
      await limits.limit(
        emailKey,
        "password_auth_email",
        config.development ? 100 : 10,
        600,
      );
      if (sending) {
        await limits.limit(
          client,
          "auth_mail_ip",
          config.development ? 200 : 10,
          3600,
        );
        await limits.limit(
          emailKey,
          "auth_mail_email",
          config.development ? 100 : 3,
          600,
        );
      }
      const firebase = firebaseClient(
        config.firebase || {},
        config.origin,
        config.development,
        transport,
      );
      const password = resetting ? "" : passwordSchema.parse(body).password;
      if (path.endsWith("/register")) {
        if (password.length < 10)
          throw new AppError(400, "Använd minst 10 tecken i lösenordet.");
        await firebase.register(v.email, password, v.return_to);
        return result({ ok: true, needs_verification: true });
      }
      if (resetting) {
        await firebase.reset(v.email, v.return_to);
        return result({ ok: true });
      }
      if (path.endsWith("/resend-verification")) {
        await firebase.resend(v.email, password, v.return_to);
        return result({ ok: true, needs_verification: true });
      }
      const proven = await firebase.login(v.email, password);
      if (!proven) return result({ ok: true, needs_verification: true });
      const signedIn = await createAuth(
        db,
        config,
        sender,
        proven,
      ).api.completeFirebaseSignIn({
        body: {},
        headers: request.headers,
        asResponse: true,
      });
      if (!signedIn.ok)
        throw new AppError(
          401,
          "Inloggningen kunde inte slutföras. Försök igen.",
        );
      return result(
        { ok: true, return_to: safeReturnPath(v.return_to, "/profil") },
        200,
        signedIn.headers,
      );
    }
    if (config.method === "password" && !path.endsWith("/sign-out"))
      throw new AppError(404, "Sidan finns inte.");
    if (path.endsWith("/login")) {
      const v = emailSchema.parse(body);
      await limits.limit(
        client,
        "auth_login_ip",
        config.development ? 200 : 20,
        600,
      );
      await limits.limit(
        await digest(v.email),
        "auth_login_email",
        config.development ? 40 : 3,
        600,
      );
      await auth.api.signInMagicLink({
        body: {
          email: v.email,
          name: "",
          callbackURL: safeReturnPath(v.return_to),
        },
        headers: request.headers,
      });
      return result({ ok: true });
    }
    if (path.endsWith("/verify")) {
      const v = verificationSchema.parse(body);
      await limits.limit(client, "auth_verify", config.development ? 200 : 20);
      const verified = await auth.api.magicLinkVerify({
        query: { token: v.token },
        headers: request.headers,
        asResponse: true,
      });
      if (!verified.ok)
        throw new AppError(
          410,
          "Länken har gått ut eller redan använts. Be om en ny inloggningslänk.",
        );
      return result(
        { ok: true, return_to: safeReturnPath(v.return_to) },
        200,
        verified.headers,
      );
    }
    z.object({}).strict().parse(body);
    const signedOut = await auth.api.signOut({
      headers: request.headers,
      asResponse: true,
    });
    return result({ ok: true }, 200, signedOut.headers);
  } catch (error) {
    if (error instanceof AppError)
      return result({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return result({ error: "Kontrollera uppgifterna och försök igen." }, 400);
    return result(
      { error: "Inloggningen kunde inte slutföras. Försök igen om en stund." },
      503,
    );
  }
}
