import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";
import type { FirebaseIdentity } from "./firebase-auth";
import { sealSessionCredential } from "./session-seal";

export function firebaseSession(
  proven: FirebaseIdentity | undefined,
  secret: string,
) {
  return {
    id: "allting-firebase-session",
    endpoints: {
      completeFirebaseSignIn: createAuthEndpoint(
        "/allting-firebase-session",
        {
          method: "POST",
          body: z.object({}).strict(),
          requireHeaders: true,
        },
        async (ctx) => {
          // Supplied only by the server after password authentication AND verified
          // mailbox lookup. This route is never exposed by AllTing's API router.
          if (!proven) throw new APIError("UNAUTHORIZED");
          const adapter = ctx.context.internalAdapter,
            key = {
              providerId: `firebase:${proven.projectId}`,
              accountId: proven.uid,
            },
            owner = await adapter.findAccountOwnerByKey(key);
          if (owner?.kind === "orphaned") throw new APIError("UNAUTHORIZED");
          let user =
            owner?.kind === "owned"
              ? owner.user
              : (await adapter.findUserByEmail(proven.email))?.user;
          if (user && user.email.toLowerCase() !== proven.email)
            throw new APIError("UNAUTHORIZED");
          if (!user) {
            try {
              user = await adapter.createUser(
                { email: proven.email, emailVerified: true, name: "" },
                { method: "custom" },
              );
            } catch {
              // A concurrent login may have just created the same verified user.
              user = (await adapter.findUserByEmail(proven.email))?.user;
            }
          }
          if (!user) throw new APIError("INTERNAL_SERVER_ERROR");
          if (!user.emailVerified) {
            await adapter.deleteUserSessions(user.id);
            await adapter.deleteAccounts(user.id);
            user = await adapter.updateUser(user.id, { emailVerified: true });
          }
          if (!owner) {
            const accounts = await adapter.findAccounts(user.id);
            if (
              accounts.some(
                (a) =>
                  a.providerId === key.providerId &&
                  a.accountId !== key.accountId,
              )
            )
              throw new APIError("UNAUTHORIZED");
            try {
              await adapter.linkAccount({ ...key, userId: user.id });
            } catch {
              const linked = await adapter.findAccountOwnerByKey(key);
              if (linked?.kind !== "owned" || linked.user.id !== user.id)
                throw new APIError("UNAUTHORIZED");
            }
          }
          // A fresh session receives its own encrypted provider credential. A later
          // login must never revive an older, revoked session after a password reset.
          const session = await adapter.createSession(user.id, false, {
            firebaseRefresh: await sealSessionCredential(
              proven.refreshToken,
              secret,
            ),
            firebaseCheckedAt: Date.now(),
          });
          await setSessionCookie(ctx, { user, session });
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
