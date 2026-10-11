import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./d1.mjs";
import {
  createAuth,
  ownIdentity,
  authRequest,
  safeReturnPath,
  Service,
} from "../.sites-runtime/test-service.mjs";

const origin = "https://allting.example.test";
const config = {
  origin,
  secret: randomBytes(32).toString("hex"),
};
function fixture() {
  const db = database(),
    mails = [];
  const sender = async (mail) => {
    mails.push(mail);
  };
  const auth = createAuth(db, config, sender);
  function request(path, body = {}, headers = {}, method = "POST") {
    return authRequest(
      new Request(origin + "/api/auth/" + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "cf-connecting-ip": "192.0.2.1",
          ...headers,
        },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
      db,
      config,
      sender,
    );
  }
  async function send(
    email = "anna@example.test",
    returnTo = "/saker/cykel?foresla=1",
  ) {
    const r = await request("login", { email, return_to: returnTo });
    assert.equal(r.status, 200, await r.text());
    return new URLSearchParams(new URL(mails.at(-1).url).hash.slice(1));
  }
  async function login(email = "anna@example.test") {
    const link = await send(email);
    const r = await request("verify", {
      token: link.get("token"),
      return_to: link.get("return_to"),
    });
    assert.equal(r.status, 200, await r.clone().text());
    const cookie = r.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    return { response: r, cookie, headers: new Headers({ Cookie: cookie }) };
  }
  return { db, mails, sender, auth, request, send, login };
}

test("magic link uses an email fragment, hashed storage and no account before verification", async () => {
  const f = fixture(),
    link = await f.send("ANNA@example.test");
  assert.equal(f.mails[0].email, "anna@example.test");
  const url = new URL(f.mails[0].url);
  assert.equal(url.pathname, "/konto/bekrafta");
  assert.equal(url.search, "");
  assert.equal(link.get("return_to"), "/saker/cykel?foresla=1");
  assert(
    !JSON.stringify(
      f.db.sqlite.prepare("SELECT * FROM allting_auth_verification").all(),
    ).includes(link.get("token")),
  );
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_user").get().n,
    0,
  );
  assert.equal(await ownIdentity(f.auth, f.db, new Headers()), null);
});

test("verified magic login creates an HttpOnly secure session and minimal default onboarding", async () => {
  const f = fixture(),
    session = await f.login();
  const cookies = session.response.headers.getSetCookie().join(";");
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax"])
    assert(cookies.toLowerCase().includes(flag.toLowerCase()), flag);
  const body = await session.response.json();
  assert.deepEqual(Object.keys(body).sort(), ["ok", "return_to"]);
  const identity = await ownIdentity(f.auth, f.db, session.headers);
  assert(identity.emailVerified);
  const s = new Service(f.db, identity);
  assert.equal((await s.me()).user, null);
  const profile = await s.saveProfile({
    display_name: "Anna",
    city: "Norrtälje",
    interests: ["tools", "garden"],
  });
  assert.equal(profile.default_search_radius_km, 15);
  assert.deepEqual(profile.interests.sort(), ["garden", "tools"]);
  const publicProfile = await new Service(f.db, null).profile(identity.userId);
  assert(!("email" in publicProfile));
});

test("a magic link is consumed once, including concurrent verification attempts", async () => {
  const f = fixture(),
    link = await f.send();
  const responses = await Promise.all(
    [1, 2].map(() => f.request("verify", { token: link.get("token") })),
  );
  assert.deepEqual(responses.map((x) => x.status).sort(), [200, 410]);
  assert.equal(
    (await f.request("verify", { token: link.get("token") })).status,
    410,
  );
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_session").get().n,
    1,
  );
});

test("expired and fabricated links create no sessions", async () => {
  const f = fixture(),
    link = await f.send();
  f.db.sqlite
    .prepare("UPDATE allting_auth_verification SET expires_at=?")
    .run(Date.now() - 1000);
  assert.equal(
    (await f.request("verify", { token: link.get("token") })).status,
    410,
  );
  assert.equal(
    (await f.request("verify", { token: "A".repeat(32) })).status,
    410,
  );
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_session").get().n,
    0,
  );
});

test("logout revokes the session and forged platform headers do not sign in", async () => {
  const f = fixture(),
    session = await f.login();
  assert(await ownIdentity(f.auth, f.db, session.headers));
  assert.equal(
    (await f.request("sign-out", {}, { Cookie: session.cookie })).status,
    200,
  );
  assert.equal(await ownIdentity(f.auth, f.db, session.headers), null);
  assert.equal(
    await ownIdentity(
      f.auth,
      f.db,
      new Headers({
        "oai-authenticated-user-id": "admin",
        "oai-authenticated-user-email": "admin@example.test",
      }),
    ),
    null,
  );
  const altered = new Headers({ Cookie: session.cookie.replace(/.$/, "X") });
  assert.equal(await ownIdentity(f.auth, f.db, altered), null);
});

test("session expiry and unverified auth users cannot establish app identity", async () => {
  const f = fixture(),
    session = await f.login();
  f.db.sqlite.exec("UPDATE allting_auth_user SET email_verified=0");
  assert.equal(await ownIdentity(f.auth, f.db, session.headers), null);
  f.db.sqlite.exec("UPDATE allting_auth_user SET email_verified=1");
  f.db.sqlite
    .prepare("UPDATE allting_auth_session SET expires_at=?")
    .run(Date.now() - 1000);
  assert.equal(await ownIdentity(f.auth, f.db, session.headers), null);
});

test("legacy account history is accessible only after proving the same email", async () => {
  const f = fixture();
  await new Service(f.db, {
    userId: "legacy",
    email: "anna@example.test",
    emailVerified: true,
  }).saveProfile({ display_name: "Anna", city: "Norrtälje" });
  const stranger = await f.login("erik@example.test");
  assert.notEqual(
    (await ownIdentity(f.auth, f.db, stranger.headers)).userId,
    "legacy",
  );
  const anna = await f.login();
  assert.equal(
    (await ownIdentity(f.auth, f.db, anna.headers)).userId,
    "legacy",
  );
});

test("auth rejects CSRF, client role fields, oversized input and direct GET verification", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.request(
        "login",
        { email: "anna@example.test" },
        { Origin: "https://evil.example.test" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await f.request("login", { email: "anna@example.test" }, { Origin: "" }))
      .status,
    403,
  );
  assert.equal(
    (await f.request("login", { email: "anna@example.test", role: "admin" }))
      .status,
    400,
  );
  assert.equal(
    (await f.request("login", { email: "x".repeat(5000) })).status,
    413,
  );
  assert.equal(
    (
      await f.request(
        "magic-link/verify?token=" + "a".repeat(32),
        {},
        {},
        "GET",
      )
    ).status,
    404,
  );
  assert.equal(
    (await f.request("change-email", { newEmail: "admin@example.test" }))
      .status,
    404,
  );
  assert.equal(f.mails.length, 0);
});

test("return paths preserve the intended listing and reject redirects outside AllTing", async () => {
  for (const value of [
    "https://evil.example.test",
    "//evil.example.test",
    "/\\evil.example.test",
    "/api/auth/verify",
    "/konto",
    "/%5c%5cevil.example.test",
  ]) {
    const result = safeReturnPath(value);
    assert.equal(result, "/");
  }
  const f = fixture(),
    link = await f.send("anna@example.test", "https://evil.example.test");
  assert.equal(link.get("return_to"), "/");
});

test("email requests are bounded and delivery failures never create a session", async () => {
  const f = fixture();
  for (let n = 0; n < 3; n++) await f.send();
  assert.equal(
    (await f.request("login", { email: "anna@example.test" })).status,
    429,
  );
  const failed = await authRequest(
    new Request(origin + "/api/auth/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "erik@example.test" }),
    }),
    f.db,
    config,
    async () => {
      throw new Error("private-provider-error-token");
    },
  );
  assert.equal(failed.status, 503);
  assert(!(await failed.text()).includes("private-provider"));
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_session").get().n,
    0,
  );
});
