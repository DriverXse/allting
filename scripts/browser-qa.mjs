import { chromium, webkit, devices } from "playwright";
import sharp from "sharp";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { signInLocal } from "./qa-auth.mjs";
const base = "http://127.0.0.1:5173",
  out = ".sites-runtime/qa";
mkdirSync(out, { recursive: true });
const engine = process.argv.includes("--webkit")
  ? "webkit"
  : process.argv.includes("--chromium")
    ? "chromium"
    : "edge";
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  ...(engine === "edge" ? { channel: "msedge" } : {}),
  headless: true,
});
const errors = [];
async function context(account, width = 390) {
  const c = await browser.newContext({
    ...(width < 720
      ? engine === "webkit"
        ? devices["iPhone 13"]
        : devices["Pixel 7"]
      : {}),
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
    isMobile: width < 720,
    hasTouch: width < 720,
    colorScheme: process.argv.includes("--dark") ? "dark" : "light",
  });
  // Exercise the complete trade flow with optional cookies declined.
  await c.addCookies([
    { name: "allting-consent", value: `1.${Date.now()}.0.0`, url: base },
  ]);
  c.on("response", async (response) => {
    if (response.url().includes("/api/images") && !response.ok())
      console.error(
        `Image request failed (${response.status()}): ${await response.text().catch(() => "")}`,
      );
  });
  if (account) {
    const email = {
      1: "local_seedy@example.test",
      erik: "seed_erik@example.test",
      sofia: "seed_sofia@example.test",
      new: `nina${Date.now()}@example.test`,
    }[account];
    await signInLocal(c, email);
    if (process.argv.includes("--dark") && account !== "new") {
      const response = await c.request.put(`${base}/api/preferences`, {
        headers: { Origin: base },
        data: { theme_preference: "dark" },
      });
      assert(response.ok(), "Could not set the local test account's theme");
    }
  }
  return c;
}
async function json(c, path, method = "GET", data) {
  const r = await c.request.fetch(`${base}/api/${path}`, {
    method,
    headers: { Origin: base },
    ...(data !== undefined ? { data } : {}),
  });
  const b = await r.json();
  if (!r.ok())
    throw new Error(`${method} ${path} ${r.status()}: ${JSON.stringify(b)}`);
  return b;
}
async function loaded(page, url) {
  await page.goto(`${base}${url}`);
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("status")
    .filter({ hasText: "Hämtar" })
    .waitFor({ state: "hidden" })
    .catch(() => {});
}
async function noOverflow(page, name) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert(!overflow, `${name} has horizontal overflow`);
  assert.equal(
    await page
      .locator("img")
      .evaluateAll(
        (imgs) => imgs.filter((i) => i.complete && !i.naturalWidth).length,
      ),
    0,
    `${name} has broken images`,
  );
}
try {
  for (const width of process.argv.includes("--flow-only")
    ? []
    : [360, 390, 430, 1280]) {
    const c = await context("1", width),
      p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    for (const path of [
      "/",
      "/sok",
      "/matchningar",
      "/mina-saker",
      "/favoriter",
      "/meddelanden",
      "/profil",
      "/bevakningar",
      "/notiser",
      "/blockerade",
      "/admin",
      "/regler",
      "/lagg-upp",
      "/saker/seed-listing-2",
    ]) {
      await loaded(p, path);
      await noOverflow(p, `${width} ${path}`);
      if (path === "/" || path === "/saker/seed-listing-2")
        await p.screenshot({
          path: `${out}/${width}-${path === "/" ? "home" : "detail"}.png`,
          fullPage: true,
        });
    }
    await c.close();
    console.log(`Layout passed at ${width}px`);
  }
  const nina = await context("new"),
    erik = await context("erik"),
    admin = await context("1");
  const p = await nina.newPage(),
    ep = await erik.newPage(),
    ap = await admin.newPage();
  for (const page of [p, ep, ap])
    page.on("pageerror", (e) => errors.push(e.message));
  const offerTitles = [
    `Cykel för byte ${Date.now()}`,
    `Cykelhjälm för byte ${Date.now()}`,
  ];
  for (const title of offerTitles)
    await json(erik, "listings", "POST", {
      title,
      description: "Använd men fungerar som den ska. Alla delar följer med.",
      category_id: "sport",
      condition: "good",
      city: "Norrtälje",
      wanted: ["bokhylla"],
      open_to_suggestions: false,
      images: ["/api/images/seed-image-2.webp"],
    });
  await loaded(p, "/profil");
  if (await p.getByRole("heading", { name: "Välj namn och ort" }).count()) {
    await p.getByLabel("Visningsnamn").fill("Nina");
    await p.getByRole("button", { name: "Börja utforska" }).click();
    await p.getByRole("heading", { name: "Nina", exact: true }).waitFor();
  }
  assert.equal((await json(nina, "me")).user.theme_preference, "light");
  if (process.argv.includes("--dark"))
    await json(nina, "preferences", "PUT", { theme_preference: "dark" });
  await loaded(p, "/lagg-upp");
  const photo = await sharp({
    create: { width: 640, height: 480, channels: 3, background: "#b7c3a4" },
  })
    .jpeg()
    .toBuffer();
  await p.locator("input[type=file]").setInputFiles([
    { name: "sak-1.jpg", mimeType: "image/jpeg", buffer: photo },
    { name: "sak-2.jpg", mimeType: "image/jpeg", buffer: photo },
  ]);
  await p.getByAltText("Bild 2", { exact: true }).waitFor();
  const title = `Bokhylla QA ${Date.now()}`;
  await p.getByLabel("Titel", { exact: true }).fill(title);
  await p.getByLabel("Kategori", { exact: true }).selectOption("home");
  await p
    .getByLabel("Beskrivning", { exact: true })
    .fill(
      "Liten bokhylla i trä. Hel och stadig, med några märken på ena sidan.",
    );
  await p.getByLabel("Jag söker", { exact: true }).fill("cykel, verktyg");
  await p.getByRole("button", { name: "Publicera sak" }).click();
  await p.getByRole("heading", { name: title, exact: true }).waitFor();
  const lid = new URL(p.url()).pathname.split("/")[2];
  await noOverflow(p, "new listing");
  await p.getByRole("link", { name: "Redigera sak", exact: true }).click();
  await p.getByLabel("Titel", { exact: true }).fill(`${title} ändrad`);
  await p.getByRole("button", { name: "Spara ändringar" }).click();
  await p
    .getByRole("heading", { name: `${title} ändrad`, exact: true })
    .waitFor();
  const created = await json(nina, `listings/${lid}`);
  assert.equal(created.images.length, 2);
  const imageResponse = await nina.request.get(`${base}${created.images[0]}`);
  assert(imageResponse.ok());
  assert.equal(imageResponse.headers()["content-type"], "image/webp");
  const scratch = await json(nina, "listings", "POST", {
    title: `Liten hylla ${Date.now()}`,
    description: "Hel och stadig, men några märken på sidan.",
    category_id: "home",
    condition: "good",
    city: "Norrtälje",
    wanted: [],
    open_to_suggestions: true,
    images: created.images,
  });
  await loaded(p, `/saker/${scratch.id}`);
  await p.getByRole("button", { name: "Pausa saken", exact: true }).click();
  await p.waitForURL(base + "/mina-saker");
  assert.equal((await json(nina, `listings/${scratch.id}`)).status, "paused");
  await loaded(p, `/saker/${scratch.id}`);
  await p.getByRole("button", { name: "Gör aktiv igen", exact: true }).click();
  await p.waitForURL(base + "/mina-saker");
  await loaded(p, `/saker/${scratch.id}`);
  p.once("dialog", (dialog) => dialog.accept());
  await p.getByRole("button", { name: "Ta bort saken", exact: true }).click();
  await p.waitForURL(base + "/mina-saker");
  assert.equal((await json(nina, `listings/${scratch.id}`)).status, "deleted");
  await loaded(p, "/sok");
  await p.getByLabel("Sök efter en sak", { exact: true }).fill("cykel");
  await p.getByRole("button", { name: "Sök", exact: true }).click();
  await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Filter", exact: true }).click();
  await p.getByRole("button", { name: "50 km", exact: true }).click();
  await p.getByRole("button", { name: "Visa saker", exact: true }).click();
  await p
    .getByRole("button", { name: "Bevaka sökningen", exact: true })
    .click();
  await p
    .getByRole("status")
    .filter({ hasText: "Bevakningen är sparad" })
    .waitFor();
  assert((await json(nina, "searches")).length > 0);
  const favouriteButton = p
    .getByRole("button", { name: /Spara .* som favorit/ })
    .first();
  const savedFavourite = p.waitForResponse(
    (response) =>
      response.url().includes("/api/favorites/") &&
      response.request().method() === "POST",
  );
  await favouriteButton.click();
  assert((await savedFavourite).ok());
  assert((await json(nina, "favorites")).length > 0);
  // Start from the listing on mobile, use the actual item picker.
  await loaded(ep, `/saker/${lid}`);
  await ep.getByRole("button", { name: "Föreslå byte", exact: true }).click();
  await ep
    .locator(".item-selector")
    .first()
    .getByText(offerTitles[0], { exact: true })
    .click();
  await ep
    .getByLabel("Meddelande (valfritt)")
    .fill("Vill du byta bokhyllan mot cykeln?");
  await ep.getByRole("button", { name: "Skicka förslag", exact: true }).click();
  await ep
    .getByRole("heading", { name: "Byte med Nina", exact: true })
    .waitFor();
  const root = new URL(ep.url()).pathname.split("/")[2];
  await loaded(p, `/byten/${root}`);
  await p.getByRole("button", { name: "Skicka motbud", exact: true }).click();
  await p
    .locator(".item-selector")
    .nth(1)
    .getByText(offerTitles[1], { exact: true })
    .click();
  await p.getByLabel("Meddelande (valfritt)").fill("Kan hjälmen följa med?");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Skicka motbud", exact: true })
    .click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await loaded(ep, `/byten/${root}`);
  await ep.getByRole("button", { name: "Acceptera byte", exact: true }).click();
  await ep
    .getByRole("heading", { name: "Det här har ni kommit överens om" })
    .waitFor();
  await loaded(p, `/byten/${root}`);
  await p
    .getByLabel("Meddelande", { exact: true })
    .fill("Vi kan ses vid biblioteket på lördag.");
  await p
    .getByRole("button", { name: "Skicka meddelande", exact: true })
    .click();
  await p
    .getByText("Vi kan ses vid biblioteket på lördag.", { exact: true })
    .waitFor();
  await p
    .getByRole("button", { name: "Markera som genomfört", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Du har bekräftat genomförandet" })
    .waitFor();
  await loaded(ep, `/byten/${root}`);
  await ep
    .getByRole("button", { name: "Markera som genomfört", exact: true })
    .click();
  await ep
    .getByRole("heading", { name: "Ert genomförda byte", exact: true })
    .waitFor();
  await loaded(p, `/byten/${root}`);
  await p.getByRole("button", { name: "Lämna betyg", exact: true }).click();
  await p.getByRole("button", { name: "4 av 5 stjärnor" }).click();
  await p
    .getByLabel("Kommentar (valfritt)")
    .fill("Allt var som beskrivet. Tack för bytet!");
  await p.getByRole("button", { name: "Spara betyg", exact: true }).click();
  await p.getByText("Ditt betyg: 4 av 5").waitFor();
  await p.screenshot({
    path: `${out}/${engine}-completed-trade.png`,
    fullPage: true,
  });
  await p.getByRole("button", { name: "Rapportera användare" }).click();
  await p.getByLabel("Orsak").selectOption("Spam");
  await p.getByRole("button", { name: "Skicka rapport", exact: true }).click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await loaded(ap, "/admin");
  assert(
    (await ap.getByRole("heading", { name: "Spam", exact: true }).count()) > 0,
  );
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Blockera Erik", exact: true }).click();
  await p
    .getByText("Ni kan inte skicka meddelanden till varandra.", { exact: true })
    .waitFor();
  await loaded(p, "/blockerade");
  await p.getByRole("button", { name: "Ta bort blockering" }).click();
  await p.getByRole("heading", { name: "Ingen är blockerad" }).waitFor();
  // HTTP authorization and input checks on the real Worker/dev API.
  const outsider = await context("sofia");
  for (const [path, method, data] of [
    [`trades/${root}`, "GET"],
    [`trades/${root}/messages`, "POST", { body: "Obehörigt" }],
    [`listings/${lid}/status`, "POST", { status: "deleted" }],
    ["admin", "GET"],
  ]) {
    const r = await outsider.request.fetch(`${base}/api/${path}`, {
      method,
      headers: { Origin: base },
      ...(data ? { data } : {}),
    });
    assert([403, 404].includes(r.status()), `IDOR ${path}: ${r.status()}`);
  }
  const bad = await erik.request.post(`${base}/api/trades`, {
    headers: { Origin: base },
    data: {
      target: lid,
      initiator_items: [],
      recipient_items: [lid],
      price: 100,
    },
  });
  assert.equal(bad.status(), 400);
  const csrf = await nina.request.post(`${base}/api/notifications`, {
    headers: { Origin: "https://example.invalid" },
    data: {},
  });
  assert.equal(csrf.status(), 403);
  await loaded(p, "/profil");
  await p.getByRole("button", { name: "Logga ut", exact: true }).click();
  await p.waitForURL(base + "/");
  assert.equal((await json(nina, "me")).identity, null);
  assert.deepEqual(errors, []);
  console.log(
    "Mobile registration, upload, edit, search, filters, favorites, watches, proposal, counteroffer, acceptance, chat, both confirmations, rating, report, block, logout and HTTP authorization passed.",
  );
  writeFileSync(
    `${out}/result-${engine}.json`,
    JSON.stringify(
      {
        widths: process.argv.includes("--flow-only")
          ? [390]
          : [360, 390, 430, 1280],
        engine,
        flows: "passed",
        errors,
        createdListing: lid,
        trade: root,
      },
      null,
      2,
    ),
  );
  await Promise.all([
    nina.close(),
    erik.close(),
    admin.close(),
    outsider.close(),
  ]);
} finally {
  await browser.close();
}
