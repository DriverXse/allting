import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

const origin = process.env.ALLTING_TEST_ORIGIN || "http://127.0.0.1:8787";
const engine = process.argv.includes("--webkit") ? "webkit" : "edge";
const browser = await (engine === "webkit" ? webkit : chromium).launch({
  headless: true,
  ...(engine === "edge" ? { channel: "msedge" } : {}),
});
const errors = [];
mkdirSync(".sites-runtime/qa", { recursive: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /RSC|navigation|prefetch/.test(message.text())
      )
        errors.push(message.text());
    });
    await page.goto(origin + "/");
    await page.waitForLoadState("networkidle");
    const links =
      width < 720
        ? [
            ["/sok", "/sok"],
            ["/lagg-upp", "/lagg-upp"],
            ["/meddelanden", "/meddelanden"],
            ["/profil", "/profil"],
            ["/favoriter", "/favoriter"],
            ["/regler", "/regler"],
          ]
        : [
            ["/matchningar", "/matchningar"],
            ["/mina-saker", "/mina-saker"],
            ["/lagg-upp", "/lagg-upp"],
            ["/profil", "/profil"],
            ["/regler", "/regler"],
          ];
    for (const [href, expected] of links) {
      await page.locator(`a[href="${href}"]:visible`).first().click();
      await page.waitForURL(origin + expected);
      await page.waitForLoadState("networkidle");
      assert(await page.locator("main h1").count(), `missing view ${expected}`);
      assert(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )),
      );
      await page
        .getByRole("link", { name: "AllTing hem", exact: true })
        .click();
      await page.waitForURL(origin + "/");
      await page.waitForLoadState("networkidle");
    }
    // Native browser back/forward must also restore the intended route.
    await page.locator('a[href="/regler"]:visible').first().click();
    await page.waitForURL(origin + "/regler");
    await page.goBack();
    await page.waitForURL(origin + "/");
    await page.goForward();
    await page.waitForURL(origin + "/regler");
    await page.waitForLoadState("networkidle");
    assert(
      await page
        .getByRole("heading", { name: "Så fungerar AllTing", exact: true })
        .count(),
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `.sites-runtime/qa/navigation-${engine}.json`,
    JSON.stringify(
      {
        origin,
        widths: [390, 1280],
        links: "passed",
        history: "passed",
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Real production-build link clicks, views and browser history passed (${engine}).`,
  );
} finally {
  await browser.close();
}
