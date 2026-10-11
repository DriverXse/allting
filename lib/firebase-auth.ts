import { AppError } from "./service";
import { safeReturnPath } from "./auth-navigation";

export type FirebaseConfig = {
  apiKey?: string;
  projectId?: string;
  // Only the local development runtime may set this. Never read from requests.
  emulator?: string;
};
export type FirebaseIdentity = {
  uid: string;
  email: string;
  projectId: string;
  refreshToken: string;
};
export type FirebaseTransport = typeof fetch;
type Credentials = {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
};
const unavailable = () =>
  new AppError(
    503,
    "Inloggningen är inte tillgänglig just nu. Försök igen senare.",
  );

export function firebaseClient(
  config: FirebaseConfig,
  origin: string,
  development = false,
  transport: FirebaseTransport = fetch,
) {
  if (!config.apiKey || !config.projectId) throw unavailable();
  let base = "https://identitytoolkit.googleapis.com/v1";
  if (config.emulator) {
    if (!development || config.emulator !== "http://127.0.0.1:9099")
      throw unavailable();
    base = `${config.emulator}/identitytoolkit.googleapis.com/v1`;
  }
  async function call<T>(
    method: string,
    body: unknown,
    renewing = false,
  ): Promise<T> {
    let response: Response;
    try {
      response = await transport(
        renewing
          ? `${config.emulator || "https://securetoken.googleapis.com"}${config.emulator ? "/securetoken.googleapis.com" : ""}/v1/token?key=${encodeURIComponent(config.apiKey!)}`
          : `${base}/accounts:${method}?key=${encodeURIComponent(config.apiKey!)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": renewing
              ? "application/x-www-form-urlencoded"
              : "application/json",
            "X-Firebase-Locale": "sv",
          },
          body: renewing
            ? new URLSearchParams(body as Record<string, string>).toString()
            : JSON.stringify(body),
          signal: AbortSignal.timeout(12000),
          redirect: "manual",
        },
      );
    } catch {
      throw unavailable();
    }
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      // Read only the provider's error code. Never log/return provider bodies,
      // passwords, addresses, ID/refresh tokens or verification links.
      const code = String(payload?.error?.message || "").split(" : ")[0];
      if (["TOO_MANY_ATTEMPTS_TRY_LATER", "QUOTA_EXCEEDED"].includes(code))
        throw new AppError(
          429,
          "För många försök. Vänta en stund och försök igen.",
        );
      if (
        [
          "INVALID_LOGIN_CREDENTIALS",
          "EMAIL_NOT_FOUND",
          "INVALID_PASSWORD",
          "USER_DISABLED",
          "USER_NOT_FOUND",
          "TOKEN_EXPIRED",
          "INVALID_REFRESH_TOKEN",
          "INVALID_ID_TOKEN",
          "INVALID_GRANT",
        ].includes(code)
      )
        throw new AppError(
          401,
          "E-postadressen eller lösenordet stämmer inte.",
        );
      if (code === "EMAIL_EXISTS")
        throw new AppError(
          409,
          "Kontot kunde inte skapas. Prova att logga in eller återställa lösenordet.",
        );
      if (
        code.startsWith("WEAK_PASSWORD") ||
        code === "PASSWORD_DOES_NOT_MEET_REQUIREMENTS"
      )
        throw new AppError(
          400,
          "Välj ett längre lösenord. Använd minst 10 tecken.",
        );
      throw unavailable();
    }
    if (!payload) throw unavailable();
    return payload as T;
  }
  function continuation(returnTo: string | undefined, verified: boolean) {
    const query = new URLSearchParams({
      return_to: safeReturnPath(returnTo, "/profil"),
    });
    if (verified) query.set("verified", "1");
    return `${origin}/konto?${query}`;
  }
  async function credentials(
    email: string,
    password: string,
    register = false,
  ) {
    const signed = await call<Credentials>(
      register ? "signUp" : "signInWithPassword",
      {
        email,
        password,
        returnSecureToken: true,
      },
    );
    if (
      !signed.localId ||
      !signed.idToken ||
      !signed.refreshToken ||
      signed.email?.toLowerCase() !== email
    )
      throw unavailable();
    return signed;
  }
  async function inspect(signed: Credentials) {
    // This ID token comes directly from the fixed Google HTTPS endpoint, never
    // from a browser request. Google validates it again during account lookup.
    const { users } = await call<{
      users?: Array<{
        localId: string;
        email: string;
        emailVerified?: boolean;
        disabled?: boolean;
      }>;
    }>("lookup", { idToken: signed.idToken });
    const user = users?.[0];
    if (
      !user ||
      user.disabled ||
      user.localId !== signed.localId ||
      user.email?.toLowerCase() !== signed.email.toLowerCase()
    )
      throw unavailable();
    // Detect accidental cross-project configuration. This payload is received
    // over the trusted server-to-Google connection; it is not a client assertion.
    try {
      const claims = JSON.parse(
        atob(
          signed.idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
        ),
      );
      if (
        claims.aud !== config.projectId ||
        claims.iss !== `https://securetoken.google.com/${config.projectId}` ||
        claims.sub !== user.localId
      )
        throw unavailable();
    } catch {
      throw unavailable();
    }
    return user;
  }
  async function verification(signed: Credentials, returnTo?: string) {
    await call("sendOobCode", {
      requestType: "VERIFY_EMAIL",
      idToken: signed.idToken,
      email: signed.email,
      continueUrl: continuation(returnTo, true),
      canHandleCodeInApp: false,
    });
  }
  return {
    async register(email: string, password: string, returnTo?: string) {
      let signed: Credentials;
      try {
        signed = await credentials(email, password, true);
      } catch (error) {
        if (!(error instanceof AppError && error.status === 409)) throw error;
        // Do not disclose account existence. An owner who retries registration
        // with the correct password can receive a fresh verification email.
        try {
          signed = await credentials(email, password);
          if ((await inspect(signed)).emailVerified) return;
        } catch (retryError) {
          if (retryError instanceof AppError && retryError.status === 401)
            return;
          throw retryError;
        }
      }
      await verification(signed, returnTo);
    },
    async login(
      email: string,
      password: string,
    ): Promise<FirebaseIdentity | null> {
      const signed = await credentials(email, password),
        user = await inspect(signed);
      return user.emailVerified === true
        ? {
            uid: user.localId,
            email: user.email.toLowerCase(),
            projectId: config.projectId!,
            refreshToken: signed.refreshToken,
          }
        : null;
    },
    async resend(email: string, password: string, returnTo?: string) {
      const signed = await credentials(email, password),
        user = await inspect(signed);
      if (!user.emailVerified) await verification(signed, returnTo);
    },
    async renew(refreshToken: string, email: string, uid: string) {
      const renewed = await call<{
        id_token: string;
        refresh_token: string;
        user_id: string;
      }>(
        "token",
        { grant_type: "refresh_token", refresh_token: refreshToken },
        true,
      );
      if (renewed.user_id !== uid || !renewed.refresh_token)
        throw new AppError(401, "Logga in igen för att fortsätta.");
      const user = await inspect({
        idToken: renewed.id_token,
        localId: uid,
        email,
        refreshToken: renewed.refresh_token,
      });
      if (!user.emailVerified)
        throw new AppError(401, "Logga in igen för att fortsätta.");
      return renewed.refresh_token;
    },
    async reset(email: string, returnTo?: string) {
      try {
        await call("sendOobCode", {
          requestType: "PASSWORD_RESET",
          email,
          continueUrl: continuation(returnTo, false),
          canHandleCodeInApp: false,
        });
      } catch (error) {
        // The same response for registered and unknown email addresses.
        if (!(error instanceof AppError && error.status === 401)) throw error;
      }
    },
  };
}
