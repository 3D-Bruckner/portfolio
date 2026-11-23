// The web app on the iPhone's Home Screen: the manifest and icons are served to someone not signed in, the pages carry the tags iOS reads,
// and the list page at a phone's size keeps clear of the notch and the home indicator.
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { PHONE } from "./app";
import { signIn } from "./signin";

test("manifestServed: the manifest says standalone and its icons are reachable without signing in", async ({ request }) => {
  const r = await request.get("/manifest.webmanifest");
  expect(r.status()).toBe(200);
  const m = await r.json();
  expect(m).toMatchObject({ name: "3D Bruckner Portfolio", short_name: "Portfolio", display: "standalone", start_url: "/", scope: "/" });
  expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  for (const src of [...m.icons.map((i: { src: string }) => i.src), "/apple-icon.png", "/icon.svg"]) {
    const icon = await request.get(src, { maxRedirects: 0 });
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()["content-type"], src).toMatch(/^image\//);
  }
});

test.describe("on a phone", () => {
  test.use(PHONE);

  test("appleWebAppMeta: the page carries what iOS reads", async ({ page }) => {
    await page.goto("/signin");
    const meta = (name: string) => page.locator(`meta[name="${name}"]`).getAttribute("content");
    expect(await meta("apple-mobile-web-app-capable")).toBe("yes");
    expect(await meta("mobile-web-app-capable")).toBe("yes");
    expect(await meta("apple-mobile-web-app-title")).toBe("Portfolio");
    expect(await meta("viewport")).toContain("viewport-fit=cover");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-icon\.png/);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  });

  test("the list page at 390×844 keeps its content out of the notch and the home indicator", async ({ page }) => {
    await signIn(page, "/");
    await expect(page.getByRole("heading", { name: "Drucke" })).toBeVisible();
    // Playwright can't emulate env(safe-area-inset-*); the proof is that the rules use it, and a picture for a look.
    const rules = await page.evaluate(() => getComputedStyle(document.querySelector("body > header")!).paddingTop);
    expect(rules).toBe("0px"); // no inset in a desktop browser: the rule resolves to 0, not to a failure
    // The sides: the content rows keep clear of the notch (1rem, or the inset where wider), the body doesn't, so the headers reach the edges.
    const sides = await page.evaluate(() => {
      const pad = (el: Element) => getComputedStyle(el).paddingLeft + " " + getComputedStyle(el).paddingRight;
      return { body: pad(document.body), main: pad(document.querySelector("main")!), header: pad(document.querySelector("body > header > div")!) };
    });
    expect(sides).toEqual({ body: "0px 0px", main: "16px 16px", header: "16px 16px" });
    const dir = process.env.SCREENSHOT_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: `${dir}/home-screen.png` });
    }
  });
});
