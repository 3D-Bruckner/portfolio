// The portfolio's order and its showcases, changed on the order page, as the site's export shows them.
import { expect, test } from "@playwright/test";
import { PHONE, publishedPrint, siteExport, unique } from "./app";

test.use(PHONE);

const indexOf = (prints: { title: string }[], title: string) => prints.findIndex((p) => p.title === title);

test("reorderWithButtons: moving a print up changes the export's order", async ({ page, request }) => {
  const older = unique("Älter");
  const newer = unique("Neuer");
  await publishedPrint(page, older);
  await publishedPrint(page, newer);
  let prints = (await siteExport(request, page)).prints;
  expect(indexOf(prints, newer)).toBeLessThan(indexOf(prints, older));

  await page.goto("/order");
  // The print the page shows just above it: another test's print may have been published in between.
  const titles = await page.getByRole("list", { name: "Portfolio" }).getByRole("listitem").allInnerTexts();
  const above = titles[titles.findIndex((t) => t.includes(older)) - 1]!.split("\n")[0]!.trim();
  await page.getByRole("button", { name: `${older} nach oben` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reihenfolge gespeichert" })).toBeVisible();
  prints = (await siteExport(request, page)).prints;
  expect(indexOf(prints, older)).toBeLessThan(indexOf(prints, above));
});

test("showcasePin: a pinned print is a showcase, above the rest", async ({ page, request }) => {
  const title = unique("Showcase");
  await publishedPrint(page, title);
  await page.goto("/order");
  await page.getByRole("button", { name: `${title} als Showcase anheften` }).click();
  await expect(page.getByRole("list", { name: "Showcases" })).toContainText(title);
  const prints = (await siteExport(request, page)).prints;
  const at = indexOf(prints, title);
  expect(prints[at]!.showcase).toBe(true);
  expect(prints.slice(0, at).every((p) => p.showcase)).toBe(true);

  await page.getByRole("button", { name: `${title} lösen` }).click();
  await expect(page.getByRole("region", { name: "Showcases" })).not.toContainText(title);
});

test("listThumbnails: the lists show each cover as a small thumbnail, loaded as it scrolls into view", async ({ page }) => {
  const title = unique("Vorschaubild");
  await publishedPrint(page, title);
  for (const [path, list] of [
    ["/", page.getByRole("tabpanel", { name: "Veröffentlicht" })],
    ["/order", page.getByRole("list", { name: "Portfolio" })],
  ] as const) {
    await page.goto(path);
    if (path === "/") await page.getByRole("tab", { name: "Veröffentlicht" }).click();
    const img = list.getByRole("listitem").filter({ hasText: title }).locator("img");
    await expect(img).toHaveAttribute("loading", "lazy");
    await expect(img).toHaveAttribute("src", /\?size=thumb&v=/);
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => Math.max(e.naturalWidth, e.naturalHeight)), { message: path }).toBe(256);
  }
});

test("openFromOrder: a print's cover and title on the order page open it, to change it", async ({ page }) => {
  const title = unique("Zum Bearbeiten");
  const id = await publishedPrint(page, title);
  await page.goto("/order");
  await page.getByRole("link", { name: `${title} bearbeiten` }).click();
  await expect(page).toHaveURL(new RegExp(`/prints/${id}$`));
  await expect(page.getByLabel("Titel", { exact: true })).toHaveValue(title);
});
