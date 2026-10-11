import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/auth-schema";
import { AppError, type Identity } from "./service";
import { safeReturnPath } from "./auth-navigation";
import { firebaseSession } from "./firebase-session";
import {
  firebaseClient,
  type FirebaseConfig,
  type FirebaseIdentity,
  type FirebaseTransport,
} from "./firebase-auth";
import { sealSessionCredential, openSessionCredential } from "./session-seal";

export type AuthConfig = {
  origin: string;
  secret: string;
  emailFrom?: string;
  resendKey?: string;
  development?: boolean;
  testMailUrl?: string;
  method?: "magic-link" | "password";
  firebase?: FirebaseConfig;
};
export type LoginMail = { email: string; url: string };
type MailSender = (mail: LoginMail) => Promise<void>;
export async function sendLoginMail(config: AuthConfig, mail: LoginMail) {
  if (config.development && config.testMailUrl) {
    const target = new URL(config.testMailUrl);
    if (target.origin !== "http://127.0.0.1:8025")
      throw new Error("Invalid local mailbox.");
    const sent = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mail),
      signal: AbortSignal.timeout(5000),
    });
    if (!sent.ok)
      throw new AppError(503, "Den lokala testbrevlådan är inte tillgänglig.");
    return;
  }
  if (!config.resendKey || !config.emailFrom)
    throw new AppError(
      503,
      "Inloggningen är inte tillgänglig just nu. Försök igen senare.",
    );
  const link = mail.url.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: `Bearer ${config.resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [mail.email],
      subject: "Din inloggningslänk till AllTing",
      text: `Hej!\n\nÖppna länken för att logga in eller skapa ditt AllTing-konto:\n${mail.url}\n\nLänken gäller i 15 minuter och kan användas en gång.\nOm du inte bad om länken kan du bortse från det här mejlet.\n\nAllTing`,
      html: `<div lang="sv" style="font:16px system-ui;color:#243a30;max-width:520px"><h1>AllTing</h1><p>Hej!</p><p>Öppna länken för att logga in eller skapa ditt AllTing-konto.</p><p><a href="${link}">Logga in på AllTing</a></p><p>Länken gäller i 15 minuter och kan användas en gång.</p><p>Om du inte bad om länken kan du bortse från det här mejlet.</p></div>`,
    }),
  });
  // Never include provider bodies, addresses or login links in error output.
  if (!result.ok)
    throw new AppError(
      503,
      "Mejlet kunde inte skickas just nu. Försök igen om en stund.",
    );
}
export function createAuth(
  db: D1Database,
  config: AuthConfig,
  sendMail?: MailSender,
  provenFirebase?: FirebaseIdentity,
) {
  if (config.secret.length < 32)
    throw new AppError(503, "Inloggningen är inte tillgänglig just nu.");
  return betterAuth({
    appName: "AllTing",
    baseURL: config.origin,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.origin],
    database: drizzleAdapter(drizzle(db, { schema }), {
      provider: "sqlite",
      schema,
      transaction: false,
    }),
    emailAndPassword: { enabled: false },
    user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
      additionalFields: {
        firebaseRefresh: {
          type: "string",
          required: false,
          input: false,
          returned: false,
        },
        firebaseCheckedAt: {
          type: "number",
          required: false,
          input: false,
          returned: false,
        },
      },
    },
    advanced: {
      cookiePrefix: "allting",
      useSecureCookies: !config.development,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: !config.development,
      },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 40,
      customRules: {
        "/sign-in/magic-link": { window: 600, max: 5 },
        "/magic-link/verify": { window: 60, max: 10 },
      },
    },
    logger: { disabled: true },
    plugins: [
      firebaseSession(provenFirebase, config.secret),
      magicLink({
        expiresIn: 15 * 60,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url, token }) => {
          const generated = new URL(url);
          const returnTo = safeReturnPath(
            generated.searchParams.get("callbackURL"),
          );
          // A fragment is not sent in HTTP requests/referrers or access logs.
          // Explicit confirmation prevents mail scanners from redeeming a link.
          const fragment = new URLSearchParams({ token, return_to: returnTo });
          const confirmation = `${config.origin}/konto/bekrafta#${fragment}`;
          await (sendMail || ((mail) => sendLoginMail(config, mail)))({
            email,
            url: confirmation,
          });
        },
      }),
    ],
  });
}
export type AllTingAuth = ReturnType<typeof createAuth>;
export async function ownIdentity(
  auth: AllTingAuth,
  db: D1Database,
  headers: Headers,
  config?: AuthConfig,
  transport?: FirebaseTransport,
): Promise<Identity | null> {
  const current = await auth.api.getSession({ headers });
  if (!current?.user.emailVerified) return null;
  const providerSession = await db
    .prepare(
      `SELECT s.firebase_refresh, s.firebase_checked_at, a.account_id, a.provider_id
    FROM allting_auth_session s LEFT JOIN allting_auth_account a ON a.user_id=s.user_id AND a.provider_id LIKE 'firebase:%' WHERE s.id=?`,
    )
    .bind(current.session.id)
    .first<{
      firebase_refresh: string | null;
      firebase_checked_at: number | null;
      account_id: string;
      provider_id: string;
    }>();
  if (providerSession?.firebase_refresh) {
    if (
      !config?.firebase ||
      config.method !== "password" ||
      providerSession.provider_id !== `firebase:${config.firebase.projectId}`
    )
      return null;
    // At most one minute of revocation latency. Database state is authoritative,
    // with no public session cache or Firebase credentials in browser storage.
    if (Date.now() - (providerSession.firebase_checked_at || 0) >= 60000) {
      try {
        const token = await openSessionCredential(
          providerSession.firebase_refresh,
          config.secret,
        );
        const renewed = await firebaseClient(
          config.firebase,
          config.origin,
          config.development,
          transport,
        ).renew(
          token,
          current.user.email.toLowerCase(),
          providerSession.account_id,
        );
        await db
          .prepare(
            "UPDATE allting_auth_session SET firebase_refresh=?,firebase_checked_at=? WHERE id=?",
          )
          .bind(
            await sealSessionCredential(renewed, config.secret),
            Date.now(),
            current.session.id,
          )
          .run();
      } catch (error) {
        if (error instanceof AppError && error.status !== 401) throw error;
        await db
          .prepare("DELETE FROM allting_auth_session WHERE id=?")
          .bind(current.session.id)
          .run();
        return null;
      }
    }
  }
  // Mailbox ownership has just been proven by Better Auth. Reuse a legacy
  // domain account only after this proof, preserving its listings and history.
  const existing = await db
    .prepare(
      "SELECT id FROM users WHERE lower(email)=? ORDER BY created_at LIMIT 1",
    )
    .bind(current.user.email.toLowerCase())
    .first<{ id: string }>();
  return {
    userId: existing?.id || current.user.id,
    email: current.user.email,
    fullName: existing ? current.user.name : null,
    emailVerified: true,
  };
}
