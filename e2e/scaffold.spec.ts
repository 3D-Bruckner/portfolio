import { expect, test } from "@playwright/test";
import { signIn } from "./signin";

test("the health check answers ok", async ({ request }) => {
  const r = await request.get("/health");
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ status: "ok" });
});

test.describe("a browser that asks for German", () => {
  test.use({ locale: "de-DE", extraHTTPHeaders: { "accept-language": "de-DE,de;q=0.9,en;q=0.8" } });

  test("gets the pages in German, with no language in the URL", async ({ page }) => {
    await signIn(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { name: "Drucke" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("switches to English, and the choice sticks", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Prints" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(new URL(page.url()).pathname).toBe("/");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Prints" })).toBeVisible();
  });

  test("gets a 404 in German at an address nothing answers", async ({ page }) => {
    const r = await page.goto("/no-such-page");
    expect(r?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Nicht gefunden" })).toBeVisible();
  });
});
