import { chromium, webkit, devices } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { signInLocal } from "./qa-auth.mjs";
const out = ".sites-runtime/qa",
  base = "http://127.0.0.1:5173";
mkdirSync(out, { recursive: true });
const useWebkit = process.argv.includes("--webkit");
const browser = await (useWebkit ? webkit : chromium).launch(
  useWebkit ? { headless: true } : { channel: "msedge", headless: true },
);
const c = await browser.newContext({
  ...(useWebkit ? devices["iPhone 13"] : devices["Pixel 7"]),
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  colorScheme: "light",
});
const errors = [],
  checks = [];
const p = await c.newPage();
p.on("pageerror", (e) => errors.push(e.message));
async function load(path) {
  await p.goto(base + path);
  await p.waitForLoadState("networkidle");
}
async function theme(value) {
  await p.waitForFunction(
    (v) => document.documentElement.dataset.theme === v,
    value,
  );
}
async function save(label, value) {
  await p.getByRole("radio", { name: label, exact: true }).check();
  await p
    .getByRole("status")
    .filter({ hasText: "Utseendet är sparat." })
    .waitFor();
  await p.waitForFunction(
    async (v) =>
      (await (await fetch("/api/me")).json()).user.theme_preference === v,
    value,
  );
}
async function inspect(name) {
  const result = await p.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (c) =>
      c
        .map((x) => {
          x /= 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (a, b) => {
      const x = lum(a),
        y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const issues = [];
    for (const e of document.querySelectorAll("body *")) {
      if (
        !e.getClientRects().length ||
        !Array.from(e.childNodes).some(
          (n) => n.nodeType === 3 && n.textContent.trim(),
        ) ||
        e.closest("[disabled]") ||
        e.classList.contains("sr-only") ||
        e.classList.contains("skip")
      )
        continue;
      const style = getComputedStyle(e);
      let parent = e,
        bg;
      while (parent) {
        const s = getComputedStyle(parent).backgroundColor;
        if (!s.includes("rgba") && s !== "transparent") {
          bg = rgb(s);
          break;
        }
        parent = parent.parentElement;
      }
      if (!bg) continue;
      const ratio = contrast(rgb(style.color), bg),
        large =
          parseFloat(style.fontSize) >= 24 ||
          (parseFloat(style.fontSize) >= 18.66 &&
            Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5) - 0.02)
        issues.push({
          text: e.textContent.trim().slice(0, 65),
          ratio: Math.round(ratio * 100) / 100,
          fg: style.color,
          bg,
        });
    }
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      brokenImages: [...document.images].filter(
        (i) => i.complete && !i.naturalWidth,
      ).length,
      contrastIssues: issues,
    };
  });
  assert(!result.overflow, name + " overflow");
  assert.equal(result.brokenImages, 0, name + " images");
  checks.push({ name, ...result });
}
try {
  // Keep external JavaScript blocked: the small inline bootstrap must choose
  // the right palette before React or any account request can run.
  for (const [stored, blocked, expected] of [
    ["light", false, "light"],
    ["dark", false, "dark"],
    ["system", false, "dark"],
    ["invalid", false, "light"],
    [null, false, "light"],
    [null, true, "light"],
  ]) {
    const firstPaint = await browser.newContext({ colorScheme: "dark" });
    if (stored && stored !== "invalid")
      await firstPaint.addCookies([
        { name: "allting-consent", value: `1.${Date.now()}.1.0`, url: base },
      ]);
    await firstPaint.addInitScript(
      ({ stored, blocked }) => {
        if (blocked)
          Object.defineProperty(window, "localStorage", {
            get() {
              throw new Error("Storage blocked");
            },
          });
        else if (stored) localStorage.setItem("allting-appearance", stored);
      },
      { stored, blocked },
    );
    await firstPaint.route("**/*", (route) =>
      route.request().resourceType() === "script"
        ? route.abort()
        : route.continue(),
    );
    const beforeReact = await firstPaint.newPage();
    for (const path of ["/", "/offline.html"]) {
      await beforeReact.goto(base + path, { waitUntil: "domcontentloaded" });
      assert.equal(
        await beforeReact.evaluate(
          () => document.documentElement.dataset.theme,
        ),
        expected,
      );
    }
    await firstPaint.close();
  }
  checks.push({
    name: "first paint before React, invalid cache and blocked storage",
  });
  await load("/");
  await theme("light");
  await inspect("light home");
  await p.emulateMedia({ colorScheme: "dark" });
  await theme("light");
  await p
    .getByRole("button", { name: "Endast nödvändiga", exact: true })
    .click();
  for (const path of ["/konto", "/registrera"]) {
    await load(path);
    await theme("light");
    await inspect("anonymous " + path);
  }
  await load("/konto");
  await p
    .getByRole("button", { name: "Glömt lösenordet?", exact: true })
    .click();
  await inspect("password reset form");
  await p.emulateMedia({ colorScheme: "light" });
  await theme("light");
  checks.push({
    name: "guest stays light by default, including a dark device",
  });
  await p
    .getByRole("button", { name: "Cookieinställningar", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Godkänn valfria cookies", exact: true })
    .click();
  await signInLocal(c, "local_seedy@example.test");
  await c.request.put(base + "/api/preferences", {
    headers: { Origin: base },
    data: { theme_preference: "system" },
  });
  await load("/profil");
  await save("Mörkt", "dark");
  await theme("dark");
  const second = await c.newPage();
  await second.goto(base + "/profil");
  await second.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await p.reload();
  await theme("dark");
  await p.getByRole("radio", { name: "Mörkt", exact: true }).waitFor();
  assert(
    await p.getByRole("radio", { name: "Mörkt", exact: true }).isChecked(),
  );
  await p.emulateMedia({ colorScheme: "dark" });
  await save("Ljust", "light");
  await theme("light");
  await second.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  assert(
    await second.getByRole("radio", { name: "Ljust", exact: true }).isChecked(),
  );
  await second.close();
  await p.emulateMedia({ colorScheme: "light" });
  await theme("light");
  await save("Följ enheten", "system");
  await p.emulateMedia({ colorScheme: "dark" });
  await theme("dark");
  await p.emulateMedia({ colorScheme: "light" });
  await theme("light");
  await save("Mörkt", "dark");
  await p.getByRole("radio", { name: "Ljust", exact: true }).focus();
  await p.keyboard.press("ArrowRight");
  await p
    .getByRole("status")
    .filter({ hasText: "Utseendet är sparat." })
    .waitFor();
  await theme("dark");
  checks.push({
    name: "saved choice, reload, independent tabs, OS override and keyboard",
  });
  await c.route("**/api/preferences", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test: anslutningen avbröts." }),
    }),
  );
  await p.getByRole("radio", { name: "Ljust", exact: true }).check();
  await p
    .getByRole("alert")
    .filter({ hasText: "Test: anslutningen avbröts." })
    .waitFor();
  await theme("dark");
  assert(
    await p.getByRole("radio", { name: "Mörkt", exact: true }).isChecked(),
  );
  await c.unroute("**/api/preferences");
  checks.push({ name: "failed save restores the previous theme" });
  for (const width of useWebkit ? [390] : [360, 390, 430, 1280]) {
    await p.setViewportSize({ width, height: 844 });
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
      "/cookies",
      "/offline.html",
      "/lagg-upp",
      "/saker/seed-listing-2",
    ]) {
      await load(path);
      await theme("dark");
      await inspect(width + " " + path);
      if (path === "/") {
        const fits = await p
          .getByPlaceholder("Sök efter byten", { exact: true })
          .evaluate((input) => {
            const style = getComputedStyle(input),
              canvas = document.createElement("canvas"),
              ctx = canvas.getContext("2d");
            ctx.font = style.font;
            return (
              ctx.measureText(input.placeholder).width <=
              input.clientWidth -
                parseFloat(style.paddingLeft) -
                parseFloat(style.paddingRight)
            );
          });
        assert(fits, `The search placeholder is clipped at ${width}px`);
      }
      if (
        width === 390 &&
        [
          "/",
          "/profil",
          "/lagg-upp",
          "/saker/seed-listing-2",
          "/meddelanden",
        ].includes(path)
      )
        await p.screenshot({
          path:
            out +
            "/dark-" +
            (path.slice(1).replaceAll("/", "-") || "home") +
            (useWebkit ? "-webkit" : "") +
            ".png",
          fullPage: true,
        });
    }
  }
  await load("/sok");
  await p
    .getByRole("button", { name: "Cookieinställningar", exact: true })
    .click();
  await inspect("dark cookie settings");
  await p.getByRole("button", { name: "Stäng", exact: true }).click();
  await p.getByRole("button", { name: "Filter", exact: true }).click();
  await p.getByRole("dialog").waitFor();
  await inspect("filter dialog");
  await p.screenshot({
    path: out + "/dark-filter" + (useWebkit ? "-webkit" : "") + ".png",
  });
  await p.getByRole("button", { name: "Stäng", exact: true }).click();
  const offers = await (await c.request.get(base + "/api/trades")).json();
  if (offers[0]?.id) {
    await load("/byten/" + offers[0].id);
    await inspect("trade and chat");
    await p.screenshot({
      path: out + "/dark-chat" + (useWebkit ? "-webkit" : "") + ".png",
      fullPage: true,
    });
  }
  const clean = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
  });
  await signInLocal(clean, "local_seedy@example.test");
  const other = await clean.newPage();
  await other.goto(base + "/profil");
  await other.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await other
    .getByRole("button", { name: "Endast nödvändiga", exact: true })
    .click();
  assert.equal(
    await other.evaluate(() => localStorage.getItem("allting-appearance")),
    null,
  );
  await clean.close();
  checks.push({ name: "account choice restored in another browser context" });
  const contrastIssues = checks.flatMap((x) =>
    (x.contrastIssues || []).map((y) => ({ page: x.name, ...y })),
  );
  writeFileSync(
    out + "/appearance-" + (useWebkit ? "webkit" : "edge") + ".json",
    JSON.stringify({ errors, checks, contrastIssues }, null, 2),
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(
    contrastIssues.length,
    0,
    JSON.stringify(contrastIssues.slice(0, 20)),
  );
  console.log(
    JSON.stringify({
      engine: useWebkit ? "WebKit" : "Edge",
      checks: checks.length,
      errors,
      contrastIssues: contrastIssues.length,
    }),
  );
} finally {
  await browser.close();
}
