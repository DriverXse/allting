import { chromium, webkit, devices } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { localFirebaseMail, testPassword } from "./qa-auth.mjs";

const base = "http://127.0.0.1:5173",
  emulator = "http://127.0.0.1:9099",
  engine = process.argv.includes("--webkit") ? "webkit" : "edge";
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "edge" ? { channel: "msedge" } : {}),
});
const context = await browser.newContext({
    ...(engine === "webkit" ? devices["iPhone 13"] : devices["Pixel 7"]),
    viewport: { width: 390, height: 844 },
  }),
  page = await context.newPage(),
  errors = [],
  email = `firebase${Date.now()}@example.test`;
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync(".sites-runtime/qa", { recursive: true });
async function loaded(path) {
  await page.goto(base + path);
  await page.waitForLoadState("networkidle");
}
async function layout(name) {
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )),
      `${name} overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `.sites-runtime/qa/firebase-${engine}-${name}.png`,
    fullPage: true,
  });
}
async function loginForm(password = testPassword) {
  await page.getByLabel("E-postadress", { exact: true }).fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
}
try {
  assert.equal(
    (await (await context.request.get(base + "/api/auth/config")).json())
      .method,
    "password",
  );
  await loaded("/");
  const { items } = await (
    await context.request.get(base + "/api/listings")
  ).json();
  const listing = items.find((x) => x.owner_id === "seed_erik") || items[0];
  assert(listing, "Local seed data required");
  for (const path of [
    "/lagg-upp",
    "/mina-saker",
    "/favoriter",
    "/bevakningar",
    "/meddelanden",
    "/notiser",
    "/blockerade",
  ]) {
    await loaded(path);
    await page
      .getByRole("heading", { name: "Logga in på AllTing", exact: true })
      .waitFor();
    assert.equal(await page.getByRole("link", { name: /ChatGPT/ }).count(), 0);
  }
  const listingPath = `/saker/${listing.id}`;
  await loaded(listingPath);
  await page.getByRole("button", { name: "Föreslå byte", exact: true }).click();
  await page
    .getByText("Logga in eller skapa ett konto för att föreslå ett byte.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    new URL(page.url()).searchParams.get("return_to"),
    listingPath + "?foresla=1",
  );
  await layout("login");
  await page.getByRole("button", { name: "Skapa konto", exact: true }).click();
  await page.getByLabel("E-postadress", { exact: true }).fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(testPassword);
  await layout("register");
  await page.getByRole("button", { name: "Skapa konto", exact: true }).click();
  await page
    .getByRole("heading", { name: "Bekräfta din e-post", exact: true })
    .waitFor();
  await layout("verification");
  assert.equal(
    (await (await context.request.get(base + "/api/me")).json()).identity,
    null,
  );
  const unverified = await context.request.post(
    base + "/api/auth/password-login",
    { headers: { Origin: base }, data: { email, password: testPassword } },
  );
  assert((await unverified.json()).needs_verification);
  assert.equal(
    (
      await context.request.post(base + "/api/listings", {
        headers: { Origin: base },
        data: {},
      })
    ).status(),
    401,
  );
  const mail = await localFirebaseMail(context, email);
  // Exercise Firebase's real local verification handler. It changes mailbox
  // verification only; visiting the email link never creates an AllTing session.
  await page.goto(mail.oobLink);
  await page.waitForLoadState("networkidle");
  assert.equal(
    (await (await context.request.get(base + "/api/me")).json()).identity,
    null,
  );
  const back =
    new URL(mail.oobLink).searchParams.get("continueUrl") ||
    base + "/konto?return_to=" + encodeURIComponent(listingPath + "?foresla=1");
  await page.goto(back);
  await loginForm("incorrect password");
  await page
    .getByRole("alert")
    .filter({ hasText: "E-postadressen eller lösenordet stämmer inte." })
    .waitFor();
  await loginForm();
  await page
    .getByRole("heading", { name: "Välj namn och ort", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "15 km", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.getByLabel("Visningsnamn", { exact: true }).inputValue(),
    "",
  );
  await layout("onboarding");
  await page.getByLabel("Visningsnamn", { exact: true }).fill("Malin");
  await page
    .getByRole("button", { name: "Börja utforska", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Föreslå byte", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, listingPath);
  const me = await (await context.request.get(base + "/api/me")).json();
  assert.equal(me.user.display_name, "Malin");
  assert.equal(me.user.default_search_radius_km, 15);
  const anonymous = await browser.newContext();
  for (const path of [
    "inventory",
    "favorites",
    "searches",
    "trades",
    "notifications",
    "blocks",
    "admin",
  ])
    assert.equal(
      (await anonymous.request.get(base + "/api/" + path)).status(),
      401,
    );
  const publicProfile = await (
    await anonymous.request.get(base + "/api/profiles/" + me.user.id)
  ).json();
  assert(!JSON.stringify(publicProfile).includes(email));
  assert.equal(
    (
      await (
        await anonymous.request.get(base + "/api/me", {
          headers: {
            "oai-authenticated-user-id": me.user.id,
            "oai-authenticated-user-email": email,
          },
        })
      ).json()
    ).identity,
    null,
  );
  await anonymous.close();
  await loaded("/profil");
  await page.getByRole("button", { name: "Logga ut", exact: true }).click();
  await page.waitForURL(base + "/");
  assert.equal(
    (await (await context.request.get(base + "/api/me")).json()).identity,
    null,
  );
  await loaded("/konto");
  await page
    .getByRole("button", { name: "Glömt lösenordet?", exact: true })
    .click();
  await page.getByLabel("E-postadress", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Skicka återställningslänk", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Om adressen är registrerad" })
    .waitFor();
  await layout("password-reset");
  const reset = await localFirebaseMail(context, email, "PASSWORD_RESET"),
    newPassword = "en ny lokal lösenordsfras";
  const changed = await context.request.post(
    `${emulator}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-allting-key`,
    { data: { oobCode: reset.oobCode, newPassword } },
  );
  assert(changed.ok(), "Firebase password reset failed");
  const reused = await context.request.post(
    `${emulator}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-allting-key`,
    { data: { oobCode: reset.oobCode, newPassword } },
  );
  assert(!reused.ok(), "Reset code reused");
  await page
    .getByRole("button", { name: "Till inloggningen", exact: true })
    .click();
  await loginForm();
  await page
    .getByRole("alert")
    .filter({ hasText: "E-postadressen eller lösenordet stämmer inte." })
    .waitFor();
  await loginForm(newPassword);
  await page.waitForURL(base + "/profil");
  assert((await (await context.request.get(base + "/api/me")).json()).identity);
  assert.deepEqual(errors, []);
  writeFileSync(
    `.sites-runtime/qa/firebase-${engine}-result.json`,
    JSON.stringify(
      {
        engine,
        registration: "passed",
        verification: "passed",
        contextReturn: "passed",
        privacy: "passed",
        reset: "passed",
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Firebase ${engine}: registration, verification, onboarding, listing return, authorization, logout and password reset passed`,
  );
} finally {
  await browser.close();
}
