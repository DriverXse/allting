import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, writeFileSync } from "node:fs";
import { signInLocal } from "./qa-auth.mjs";
const base = "http://127.0.0.1:5173";
const useWebkit = process.argv.includes("--webkit");
const browser = await (useWebkit ? webkit : chromium).launch(
  useWebkit ? {} : { channel: "msedge" },
);
const c = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "dark",
});
const p = await c.newPage();
const errors = [],
  checks = [];
p.on("pageerror", (e) => errors.push(e.message));
const panel = () => p.locator(".cookie-panel");
async function load(path) {
  await p.goto(base + path);
  await p.waitForLoadState("networkidle");
}
async function settings() {
  await p
    .getByRole("button", { name: "Cookieinställningar", exact: true })
    .click();
  await panel()
    .getByRole("heading", { name: "Cookieinställningar", exact: true })
    .waitFor();
}
async function event() {
  const r = await c.request.get(base + "/api/listings?q=consentqaemptyresult");
  assert(r.ok());
}
const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file = readdirSync(dir).find(
  (x) => x.endsWith(".sqlite") && x !== "metadata.sqlite",
);
const db = new DatabaseSync(`${dir}/${file}`, { readOnly: true });
let uid;
function count() {
  return db
    .prepare("SELECT count(*) n FROM analytics_events WHERE user_id=?")
    .get(uid).n;
}
try {
  await load("/");
  await panel().waitFor();
  assert.equal(
    await p.evaluate(() => document.documentElement.dataset.theme),
    "light",
  );
  assert.equal(
    await p.evaluate(() => localStorage.getItem("allting-appearance")),
    null,
  );
  for (const width of [360, 390, 430, 1280]) {
    await p.setViewportSize({ width, height: 844 });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const reject = await panel()
      .getByRole("button", { name: "Endast nödvändiga", exact: true })
      .boundingBox();
    const accept = await panel()
      .getByRole("button", { name: "Godkänn valfria cookies", exact: true })
      .boundingBox();
    assert(Math.abs(reject.width - accept.width) <= 1);
    assert(Math.abs(reject.height - accept.height) <= 1);
    assert(reject.height >= 44);
    await p.screenshot({
      path: `.sites-runtime/qa/consent-${useWebkit ? "webkit" : "edge"}-${width}.png`,
    });
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await panel().getByRole("button", { name: "Anpassa", exact: true }).click();
  assert.equal(await panel().getByRole("checkbox").count(), 2);
  for (const checkbox of await panel().getByRole("checkbox").all())
    assert.equal(await checkbox.isChecked(), false);
  await panel()
    .getByRole("button", { name: "Endast nödvändiga", exact: true })
    .click();
  await p.reload();
  await p.waitForLoadState("networkidle");
  assert.equal(await panel().count(), 0);
  checks.push(
    "equal choices, no preselected purposes, reject remembered, light on dark device, responsive widths",
  );
  await signInLocal(c, "local_seedy@example.test");
  await c.request.put(base + "/api/preferences", {
    headers: { Origin: base },
    data: { theme_preference: "light" },
  });
  await load("/profil");
  uid = (await (await c.request.get(base + "/api/me")).json()).user.id;
  const before = count();
  await event();
  assert.equal(count(), before);
  await p.getByRole("radio", { name: "Mörkt", exact: true }).check();
  await p
    .getByRole("status")
    .filter({ hasText: "Utseendet är sparat." })
    .waitFor();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("allting-appearance")),
    null,
  );
  await p.reload();
  await p.waitForLoadState("networkidle");
  await p.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  checks.push(
    "signed-in profile and account theme work with only necessary cookies, no server statistics",
  );
  await settings();
  await panel()
    .getByRole("checkbox", { name: /Kom ihåg utseendet/ })
    .check();
  await panel()
    .getByRole("button", { name: "Spara mina val", exact: true })
    .click();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("allting-appearance")),
    "dark",
  );
  await event();
  assert.equal(count(), before);
  const second = await c.newPage();
  await second.goto(base + "/profil");
  await second.waitForLoadState("networkidle");
  await settings();
  await panel()
    .getByRole("checkbox", { name: /Kom ihåg utseendet/ })
    .uncheck();
  await panel()
    .getByRole("checkbox", { name: /Användningsstatistik/ })
    .check();
  await panel()
    .getByRole("button", { name: "Spara mina val", exact: true })
    .click();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("allting-appearance")),
    null,
  );
  await second.waitForFunction(
    () => document.documentElement.dataset.consent.split(".")[2] === "0",
  );
  await event();
  assert(count() > before);
  await settings();
  await panel()
    .getByRole("button", { name: "Endast nödvändiga", exact: true })
    .click();
  const after = count();
  await event();
  assert.equal(count(), after);
  await second.waitForFunction(
    () => document.documentElement.dataset.consent.split(".")[3] === "0",
  );
  await second.close();
  checks.push(
    "independent purposes, server opt-in, immediate revocation, cache removed, other tabs synchronized",
  );
  await load("/cookies");
  await p
    .getByRole("button", { name: "Ändra cookieinställningar", exact: true })
    .click();
  await panel()
    .getByRole("button", { name: "Godkänn valfria cookies", exact: true })
    .click();
  const cookie = (await c.cookies()).find((x) => x.name === "allting-consent");
  // Windows WebKit reports None even for Lax, also accounted for upstream:
  // https://github.com/microsoft/playwright/blob/main/tests/library/browsercontext-cookies.spec.ts
  assert.equal(
    cookie.sameSite,
    useWebkit && process.platform === "win32" ? "None" : "Lax",
  );
  assert.equal(cookie.path, "/");
  assert(cookie.expires > Date.now() / 1000 + 179 * 86400);
  await settings();
  await panel()
    .getByRole("button", { name: "Endast nödvändiga", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Cookieinställningar", exact: true })
    .focus();
  await p.keyboard.press("Enter");
  await panel()
    .getByRole("heading", { name: "Cookieinställningar", exact: true })
    .waitFor();
  assert.equal(
    await p.evaluate(() => document.activeElement.id),
    "cookie-title",
  );
  await p.keyboard.press("Escape");
  assert.equal(await panel().count(), 0);
  checks.push(
    "public information, cookie duration and SameSite, keyboard open/close and focus return",
  );
  const revokedCount = count();
  for (const value of [
    `1.${Date.now() - 181 * 86400000}.1.1`,
    `2.${Date.now()}.1.1`,
    "invalid",
  ]) {
    await c.addCookies([{ name: "allting-consent", value, url: base }]);
    await load("/");
    await panel().waitFor();
    await event();
    assert.equal(count(), revokedCount);
  }
  checks.push("expired, unknown-version and malformed consent fail closed");
  const blocked = await browser.newContext();
  await blocked.addInitScript(() => {
    Object.defineProperty(document, "cookie", {
      get: () => "",
      set: () => {
        throw new Error("blocked");
      },
    });
    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new Error("blocked");
      },
    });
  });
  const bp = await blocked.newPage();
  await bp.goto(base);
  await bp
    .getByRole("button", { name: "Endast nödvändiga", exact: true })
    .click();
  await bp
    .getByRole("status")
    .filter({ hasText: "Webbläsaren blockerar lagring" })
    .waitFor();
  await bp.locator(".cookie-panel").waitFor({ state: "hidden" });
  await blocked.close();
  checks.push(
    "blocked cookie/local storage leaves browsing usable and statistics off",
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    `.sites-runtime/qa/consent-${useWebkit ? "webkit" : "edge"}.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ engine: useWebkit ? "WebKit" : "Edge", checks, errors }),
  );
} finally {
  db.close();
  await c.close();
  await browser.close();
}
