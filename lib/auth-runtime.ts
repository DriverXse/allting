import { env } from "cloudflare:workers";
import { createAuth, ownIdentity, type AuthConfig } from "./auth";

type AuthEnvironment = {
  ALLTING_ORIGIN?: string;
  BETTER_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  ALLTING_AUTH_METHOD?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_AUTH_EMULATOR?: string;
};
export function authConfig(): AuthConfig {
  const settings = env as unknown as AuthEnvironment;
  if (import.meta.env.DEV)
    return {
      origin: settings.ALLTING_ORIGIN || "http://127.0.0.1:5173",
      secret: settings.BETTER_AUTH_SECRET || "",
      development: true,
      testMailUrl: "http://127.0.0.1:8025/send",
      ...(settings.ALLTING_AUTH_METHOD === "password"
        ? {
            method: "password" as const,
            firebase: {
              apiKey: settings.FIREBASE_API_KEY,
              projectId: settings.FIREBASE_PROJECT_ID,
              emulator: settings.FIREBASE_AUTH_EMULATOR,
            },
          }
        : {}),
    };
  return {
    origin: settings.ALLTING_ORIGIN || "https://allting.example.invalid",
    secret: settings.BETTER_AUTH_SECRET || "",
    resendKey: settings.RESEND_API_KEY,
    emailFrom: settings.AUTH_EMAIL_FROM,
    method:
      settings.ALLTING_AUTH_METHOD === "password" ? "password" : "magic-link",
    firebase: {
      apiKey: settings.FIREBASE_API_KEY,
      projectId: settings.FIREBASE_PROJECT_ID,
    },
  };
}
export async function getAllTingUser(request: Request) {
  // ChatGPT headers and the Sites service bearer never establish app identity.
  if (
    !(request.headers.get("cookie") || "")
      .split(";")
      .some((c) => /^\s*(?:__Secure-)?allting\.session_token=/.test(c))
  )
    return null;
  const config = authConfig();
  return ownIdentity(
    createAuth(env.DB!, config),
    env.DB!,
    request.headers,
    config,
  );
}
