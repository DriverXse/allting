import { randomBytes } from "node:crypto";
// Local test helpers only. These endpoints are never part of the Site build.
export const testPassword = randomBytes(24).toString("base64url");
const base = "http://127.0.0.1:5173",
  emulator = "http://127.0.0.1:9099";
export async function localFirebaseMail(context, email, type = "VERIFY_EMAIL") {
  const response = await context.request.get(
    `${emulator}/emulator/v1/projects/demo-allting/oobCodes`,
  );
  if (!response.ok())
    throw new Error("The local Firebase emulator is unavailable");
  const { oobCodes } = await response.json();
  const mail = oobCodes
    .filter((m) => m.email === email && m.requestType === type)
    .at(-1);
  if (!mail) throw new Error("No local Firebase test mail");
  return mail;
}
export async function signInLocal(context, email) {
  const { method } = await (
    await context.request.get(base + "/api/auth/config")
  ).json();
  async function post(path, body) {
    const r = await context.request.post(base + "/api/auth/" + path, {
      headers: { Origin: base },
      data: body,
    });
    if (!r.ok()) throw new Error(`Local test sign-in failed (${r.status()})`);
    return r.json();
  }
  if (method === "password") {
    await post("register", { email, password: testPassword });
    let result = await post("password-login", {
      email,
      password: testPassword,
    });
    if (result.needs_verification) {
      const mail = await localFirebaseMail(context, email);
      const response = await context.request.post(
        `${emulator}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-allting-key`,
        { data: { oobCode: mail.oobCode } },
      );
      if (!response.ok())
        throw new Error("Local test email verification failed");
      result = await post("password-login", { email, password: testPassword });
    }
    if (result.needs_verification)
      throw new Error("Unverified local test user");
  } else {
    await post("login", { email });
    const inbox = await context.request.get(
      `http://127.0.0.1:8025/mail?email=${encodeURIComponent(email)}`,
    );
    const link = new URL((await inbox.json()).url),
      fragment = new URLSearchParams(link.hash.slice(1));
    await post("verify", { token: fragment.get("token") });
  }
}
