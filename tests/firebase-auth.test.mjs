import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./d1.mjs";
import {
  createAuth,
  ownIdentity,
  authRequest,
  Service,
} from "../.sites-runtime/test-service.mjs";

const origin = "https://allting.example.test",
  projectId = "allting-test";
const config = {
  origin,
  secret: randomBytes(32).toString("hex"),
  method: "password",
  firebase: { apiKey: "test-api-key", projectId },
};
const email = "anna@example.test",
  password = randomBytes(24).toString("base64url");
function fixture(overrides = {}) {
  const db = database(),
    calls = [],
    users = new Map(),
    settings = { ...config, ...overrides };
  let fault;
  const fail = (message) =>
    Response.json({ error: { message } }, { status: 400 });
  function token(user) {
    return (
      "header." +
      Buffer.from(
        JSON.stringify({
          aud: user.project || projectId,
          iss: `https://securetoken.google.com/${user.project || projectId}`,
          sub: user.uid,
        }),
      ).toString("base64url") +
      ".signature"
    );
  }
  const transport = async (url, options) => {
    assert(
      [
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
      ].includes(new URL(url).origin),
    );
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers["X-Firebase-Locale"], "sv");
    const method = new URL(url).origin.includes("securetoken")
        ? "token"
        : new URL(url).pathname.split(":")[1],
      body =
        method === "token"
          ? Object.fromEntries(new URLSearchParams(options.body))
          : JSON.parse(options.body);
    calls.push({ method, body });
    if (fault) return fail(fault);
    if (method === "token") {
      const user = [...users.values()].find(
        (u) => `refresh:${u.uid}:${u.generation || 0}` === body.refresh_token,
      );
      if (!user || user.disabled) return fail("TOKEN_EXPIRED");
      return Response.json({
        id_token: token(user),
        user_id: user.uid,
        refresh_token: body.refresh_token,
      });
    }
    if (["signUp", "signInWithPassword"].includes(method)) {
      if (method === "signUp") {
        if (users.has(body.email)) return fail("EMAIL_EXISTS");
        users.set(body.email, {
          uid: crypto.randomUUID(),
          email: body.email,
          password: body.password,
          verified: false,
        });
      }
      const user = users.get(body.email);
      if (!user || user.password !== body.password)
        return fail("INVALID_LOGIN_CREDENTIALS");
      if (user.disabled) return fail("USER_DISABLED");
      return Response.json({
        localId: user.uid,
        email: user.email,
        idToken: token(user),
        refreshToken: `refresh:${user.uid}:${user.generation || 0}`,
      });
    }
    if (method === "lookup") {
      const user = [...users.values()].find((u) => token(u) === body.idToken);
      return Response.json({
        users: user
          ? [
              {
                localId: user.uid,
                email: user.email,
                emailVerified: user.verified,
                disabled: user.disabled,
              },
            ]
          : [],
      });
    }
    if (method === "sendOobCode") {
      if (body.requestType === "PASSWORD_RESET" && !users.has(body.email))
        return fail("EMAIL_NOT_FOUND");
      return Response.json({ email: body.email });
    }
    throw new Error("Unexpected provider operation");
  };
  async function request(path, body = {}, headers = {}, method = "POST") {
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
      settings,
      undefined,
      transport,
    );
  }
  async function register(address = email) {
    const response = await request("register", {
      email: address,
      password,
      return_to: "/saker/cykel?foresla=1",
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response;
  }
  async function login(address = email) {
    const response = await request("password-login", {
      email: address,
      password,
      return_to: "/saker/cykel?foresla=1",
    });
    const cookie = response.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    return { response, cookie, headers: new Headers({ Cookie: cookie }) };
  }
  const auth = createAuth(db, settings);
  return {
    db,
    calls,
    users,
    request,
    register,
    login,
    auth,
    identity: (headers) => ownIdentity(auth, db, headers, settings, transport),
    fault: (value) => {
      fault = value;
    },
  };
}

test("Firebase registration and unverified login never create an AllTing session", async () => {
  const f = fixture();
  const response = await f.register();
  assert.deepEqual(await response.json(), {
    ok: true,
    needs_verification: true,
  });
  assert.equal(response.headers.getSetCookie().length, 0);
  const login = await f.login();
  assert.deepEqual(await login.response.json(), {
    ok: true,
    needs_verification: true,
  });
  assert.equal(login.cookie, "");
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_user").get().n,
    0,
  );
  const mail = f.calls.find((c) => c.method === "sendOobCode").body;
  assert.equal(mail.requestType, "VERIFY_EMAIL");
  assert.equal(
    new URL(mail.continueUrl).searchParams.get("return_to"),
    "/saker/cykel?foresla=1",
  );
  assert(!mail.continueUrl.includes(email));
  assert.equal(await f.identity(login.headers), null);
});

test("verified Firebase password login issues own secure cookie and encrypts refresh credentials per session", async () => {
  const f = fixture();
  await f.register();
  f.users.get(email).verified = true;
  const session = await f.login();
  assert.equal(
    session.response.status,
    200,
    await session.response.clone().text(),
  );
  assert.deepEqual(await session.response.json(), {
    ok: true,
    return_to: "/saker/cykel?foresla=1",
  });
  const cookies = session.response.headers
    .getSetCookie()
    .join(";")
    .toLowerCase();
  for (const flag of ["httponly", "secure", "samesite=lax"])
    assert(cookies.includes(flag));
  const identity = await f.identity(session.headers);
  assert.equal(identity.email, email);
  assert(identity.emailVerified);
  const account = f.db.sqlite
    .prepare("SELECT * FROM allting_auth_account")
    .get();
  assert.equal(account.provider_id, "firebase:" + projectId);
  for (const name of ["password", "access_token", "refresh_token", "id_token"])
    assert.equal(account[name], null);
  const stored = f.db.sqlite
    .prepare("SELECT * FROM allting_auth_session")
    .get();
  assert(stored.firebase_refresh);
  assert(!stored.firebase_refresh.includes("refresh:"));
  assert(!stored.firebase_refresh.includes(f.users.get(email).uid));
  await new Service(f.db, identity).saveProfile({
    display_name: "Anna",
    city: "Norrtälje",
  });
  const publicProfile = await new Service(f.db, null).profile(identity.userId);
  assert(!JSON.stringify(publicProfile).includes(email));
  await f.request("sign-out", {}, { Cookie: session.cookie });
  assert.equal(await f.identity(session.headers), null);
});

test("verified Firebase mail can recover legacy history; another verified user cannot", async () => {
  const f = fixture();
  await new Service(f.db, {
    userId: "legacy_anna",
    email,
    emailVerified: true,
  }).saveProfile({ display_name: "Anna", city: "Norrtälje" });
  await f.register("erik@example.test");
  f.users.get("erik@example.test").verified = true;
  const erik = await f.login("erik@example.test");
  assert.notEqual((await f.identity(erik.headers)).userId, "legacy_anna");
  await f.register();
  assert.equal((await f.login()).cookie, "");
  f.users.get(email).verified = true;
  assert.equal(
    (await f.identity((await f.login()).headers)).userId,
    "legacy_anna",
  );
});

test("Firebase login rejects wrong passwords, disabled accounts and cross-project identities", async () => {
  const f = fixture();
  await f.register();
  f.users.get(email).verified = true;
  assert.equal(
    (await f.request("password-login", { email, password: "wrong" })).status,
    401,
  );
  f.users.get(email).disabled = true;
  assert.equal((await f.login()).response.status, 401);
  f.users.get(email).disabled = false;
  f.users.get(email).project = "other-project";
  assert.equal((await f.login()).response.status, 503);
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_session").get().n,
    0,
  );
});

test("Firebase request boundary rejects CSRF, role/verification/token assertions and internal endpoints", async () => {
  const f = fixture();
  for (const extra of [
    { emailVerified: true },
    { role: "admin" },
    { idToken: "forged" },
    { firebase: { emulator: "https://evil.test" } },
  ])
    assert.equal(
      (await f.request("password-login", { email, password, ...extra })).status,
      400,
    );
  assert.equal(
    (
      await f.request(
        "register",
        { email, password },
        { Origin: "https://evil.test" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        "register",
        { email, password },
        { "sec-fetch-site": "cross-site" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await f.request("register", { email, password: "short" })).status,
    400,
  );
  assert.equal(
    (await f.request("register", { email, password: "x".repeat(5000) })).status,
    413,
  );
  for (const path of [
    "allting-firebase-session",
    "sign-in/email",
    "sign-up/email",
    "change-email",
    "verify",
  ]) {
    assert.equal((await f.request(path, {})).status, 404);
  }
  assert.equal((await f.request("register", {}, {}, "GET")).status, 404);
  assert.equal(f.calls.length, 0);
  const direct = await f.auth.api.completeFirebaseSignIn({
    body: {},
    headers: new Headers({ Origin: origin }),
    asResponse: true,
  });
  assert.equal(direct.status, 401);
});

test("Firebase password reset and repeated registration do not disclose account existence", async () => {
  const f = fixture({ development: true });
  await f.register();
  const known = await f.request("reset-password", { email });
  const unknown = await f.request("reset-password", {
    email: "unknown@example.test",
  });
  assert.equal(known.status, unknown.status);
  assert.deepEqual(await known.json(), await unknown.json());
  const existing = await f.request("register", {
    email,
    password: "a different long phrase",
  });
  assert.equal(existing.status, 200);
  assert.equal(
    f.calls.filter(
      (c) =>
        c.method === "sendOobCode" && c.body.requestType === "VERIFY_EMAIL",
    ).length,
    1,
  );
  const repeated = await f.request("register", { email, password });
  assert.equal(repeated.status, 200);
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_session").get().n,
    0,
  );
});

test("verification resend requires the password and return URLs remain inside AllTing", async () => {
  const f = fixture();
  await f.register();
  assert.equal(
    (await f.request("resend-verification", { email, password: "wrong" }))
      .status,
    401,
  );
  const response = await f.request("resend-verification", {
    email,
    password,
    return_to: "https://evil.test",
  });
  assert.equal(response.status, 200);
  const mail = f.calls.at(-1).body;
  assert.equal(new URL(mail.continueUrl).origin, origin);
  assert.equal(
    new URL(mail.continueUrl).searchParams.get("return_to"),
    "/profil",
  );
});

test("Firebase credentials, provider failures and mail errors fail closed with no sensitive output", async () => {
  for (const overrides of [
    { firebase: {} },
    { firebase: { ...config.firebase, emulator: "http://127.0.0.1:9099" } },
  ]) {
    const f = fixture(overrides);
    assert.equal(
      (await f.request("register", { email, password })).status,
      503,
    );
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  f.fault("provider-secret-token-" + email);
  const response = await f.request("register", { email, password });
  assert.equal(response.status, 503);
  assert(!(await response.text()).includes(email));
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_session").get().n,
    0,
  );
});

test("Firebase endpoints share mailbox/IP rate limits across registration and reset", async () => {
  const f = fixture();
  for (let n = 0; n < 3; n++)
    assert.equal((await f.request("reset-password", { email })).status, 200);
  assert.equal((await f.request("register", { email, password })).status, 429);
  assert.equal(f.calls.length, 3);
});

test("Firebase subject mapping stays unique across concurrent verified logins", async () => {
  const f = fixture();
  await f.register();
  f.users.get(email).verified = true;
  // Concurrent first logins must not create duplicate users/provider mappings.
  const logins = await Promise.all([f.login(), f.login()]);
  assert(logins.every((x) => x.response.status === 200));
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_account").get().n,
    1,
  );
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_user").get().n,
    1,
  );
});

test("Firebase sessions recheck the same verified subject and renew encrypted credentials", async () => {
  const f = fixture();
  await f.register();
  f.users.get(email).verified = true;
  const session = await f.login();
  f.db.sqlite
    .prepare("UPDATE allting_auth_session SET firebase_checked_at = 0")
    .run();
  assert.equal((await f.identity(session.headers)).email, email);
  assert(f.calls.some((call) => call.method === "token"));
  const stored = f.db.sqlite
    .prepare("SELECT * FROM allting_auth_session")
    .get();
  assert(stored.firebase_checked_at > Date.now() - 10000);
  assert(!stored.firebase_refresh.includes("refresh:"));
});

test("Firebase password reset and account disabling revoke old sessions independently", async () => {
  const f = fixture();
  await f.register();
  const user = f.users.get(email);
  user.verified = true;
  const old = await f.login();
  user.generation = 1;
  const fresh = await f.login();
  f.db.sqlite
    .prepare("UPDATE allting_auth_session SET firebase_checked_at = 0")
    .run();
  assert.equal(await f.identity(old.headers), null);
  assert.equal((await f.identity(fresh.headers)).email, email);
  user.disabled = true;
  f.db.sqlite
    .prepare("UPDATE allting_auth_session SET firebase_checked_at = 0")
    .run();
  assert.equal(await f.identity(fresh.headers), null);
});

test("Firebase session rechecks fail closed during outages and reject corrupt credentials", async () => {
  const f = fixture();
  await f.register();
  f.users.get(email).verified = true;
  const session = await f.login();
  f.db.sqlite
    .prepare("UPDATE allting_auth_session SET firebase_checked_at = 0")
    .run();
  f.fault("INTERNAL_ERROR");
  await assert.rejects(
    f.identity(session.headers),
    (error) => error.status === 503,
  );
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_session").get().n,
    1,
  );
  f.fault(undefined);
  assert.equal((await f.identity(session.headers)).email, email);
  f.db.sqlite
    .prepare(
      "UPDATE allting_auth_session SET firebase_checked_at = 0, firebase_refresh = 'corrupt'",
    )
    .run();
  assert.equal(await f.identity(session.headers), null);
  assert.equal(
    f.db.sqlite.prepare("SELECT count(*) n FROM allting_auth_session").get().n,
    0,
  );
});
