import { chromium, webkit, devices } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

const base = "http://127.0.0.1:5173";
mkdirSync(".sites-runtime/qa", { recursive: true });
const engine = process.argv.includes("--webkit") ? "webkit" : "edge";
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "edge" ? { channel: "msedge" } : {}),
});
const context = await browser.newContext({
  ...(engine === "webkit" ? devices["iPhone 13"] : devices["Pixel 7"]),
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const email = `mobil${Date.now()}@example.test`;
async function loaded(path) {
  await page.goto(base + path);
  await page.waitForLoadState("networkidle");
}
async function mobileLayout(name) {
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )),
      `${name}: overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `.sites-runtime/qa/auth-${engine}-${name}.png`,
    fullPage: true,
  });
}
async function prompt(action) {
  await page
    .getByRole("heading", { name: "Logga in eller skapa konto", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).searchParams.get("action"), action);
  assert(!(await page.getByRole("link", { name: /ChatGPT/ }).count()));
}
try {
  await loaded("/");
  assert((await page.locator(".listing-card").count()) > 0);
  const listings = await (
    await context.request.get(base + "/api/listings")
  ).json();
  const listing =
    listings.items.find((item) => item.owner_id === "seed_erik") ||
    listings.items[0];
  const listingPath = `/saker/${listing.id}`;
  assert.equal(
    (await (await context.request.get(base + "/api/me")).json()).identity,
    null,
  );
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
      .getByRole("heading", { name: "Logga in eller skapa konto", exact: true })
      .waitFor();
  }
  await loaded(listingPath);
  const title = await page.locator("h1").last().textContent();
  await page.getByRole("button", { name: "Fler alternativ" }).click();
  await page
    .getByRole("button", { name: "Rapportera saken", exact: true })
    .click();
  await prompt("report");
  assert.equal(new URL(page.url()).searchParams.get("return_to"), listingPath);
  await loaded(listingPath);
  await page.getByRole("button", { name: "Föreslå byte", exact: true }).click();
  await prompt("propose");
  await page
    .getByText("Logga in eller skapa ett konto för att föreslå ett byte.", {
      exact: true,
    })
    .waitFor();
  await mobileLayout("login");
  await page.getByLabel("E-postadress", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Skicka inloggningslänk", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Kolla din e-post", exact: true })
    .waitFor();
  assert.equal(
    (await (await context.request.get(base + "/api/me")).json()).identity,
    null,
  );
  const inbox = await context.request.get(
    `http://127.0.0.1:8025/mail?email=${encodeURIComponent(email)}`,
  );
  const { url } = await inbox.json();
  assert(url?.startsWith(base + "/konto/bekrafta#token="));
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get("token");
  await page.goto(url);
  await page
    .getByRole("button", { name: "Fortsätt till AllTing", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).hash, "");
  await mobileLayout("confirmation");
  // GET requests/mail scanners must not consume the link.
  assert.equal(
    (await (await context.request.get(base + "/api/me")).json()).identity,
    null,
  );
  await page
    .getByRole("button", { name: "Fortsätt till AllTing", exact: true })
    .click();
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
  assert.equal(await page.getByLabel(/Kort presentation/).count(), 0);
  await mobileLayout("onboarding");
  await page.getByLabel("Visningsnamn", { exact: true }).fill("Malin");
  await page.locator("summary").filter({ hasText: "Intresseområden" }).click();
  await page.getByLabel("Verktyg", { exact: true }).check();
  await page
    .getByRole("button", { name: "Börja utforska", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Föreslå byte", exact: true })
    .waitFor();
  assert(new URL(page.url()).pathname === listingPath);
  assert(await page.getByRole("heading", { name: title, exact: true }).count());
  await page
    .getByRole("link", { name: "Lägg upp en sak", exact: true })
    .waitFor();
  const me = await (await context.request.get(base + "/api/me")).json();
  assert.equal(me.user.display_name, "Malin");
  assert.equal(me.user.default_search_radius_km, 15);
  assert.deepEqual(me.user.interests, ["tools"]);
  const anonymous = await browser.newContext();
  const forged = await anonymous.request.get(base + "/api/me", {
    headers: {
      "oai-authenticated-user-id": "local_seedy",
      "oai-authenticated-user-email": "local_seedy@example.test",
    },
  });
  assert.equal((await forged.json()).identity, null);
  for (const path of [
    "inventory",
    "favorites",
    "searches",
    "trades",
    "notifications",
    "blocks",
    "admin",
  ]) {
    const response = await anonymous.request.get(base + "/api/" + path);
    assert.equal(response.status(), 401, `anonymous ${path}`);
  }
  const publicProfile = await (
    await anonymous.request.get(base + "/api/profiles/" + me.user.id)
  ).json();
  assert(!JSON.stringify(publicProfile).includes(email));
  await anonymous.close();
  const reused = await context.request.post(base + "/api/auth/verify", {
    headers: { Origin: base },
    data: { token },
  });
  assert.equal(reused.status(), 410);
  await loaded("/profil");
  await page.getByRole("button", { name: "Logga ut", exact: true }).click();
  await page.waitForURL(base + "/");
  assert.equal(
    (await (await context.request.get(base + "/api/me")).json()).identity,
    null,
  );
  await page.goto(url);
  await page
    .getByRole("button", { name: "Fortsätt till AllTing", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Länken har gått ut eller redan använts" })
    .waitFor();
  assert.equal(
    (await (await context.request.get(base + "/api/me")).json()).identity,
    null,
  );
  assert.deepEqual(errors, []);
  mkdirSync(".sites-runtime/qa", { recursive: true });
  writeFileSync(
    `.sites-runtime/qa/auth-${engine}.json`,
    JSON.stringify({ engine, width: 390, flows: "passed", errors }, null, 2),
  );
  console.log(
    `Own email registration, verification, onboarding, return to proposal, privacy, protected routes and logout passed (${engine}).`,
  );
} finally {
  await browser.close();
}
