// Accessibility (conventions: code/accessibility): axe finds nothing on the main pages, and every control is reached with the keyboard.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addPhoto, newPrint, PHONE, unique } from "./app";
import { signIn } from "./signin";

test.use(PHONE);

async function noViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/**
 * Tabs through the page and checks that every visible, enabled control got the focus once. A tab list's other tabs are left out: the
 * ARIA tab pattern reaches them with the arrow keys, not Tab.
 */
async function everyControlByKeyboard(page: Page) {
  const total = await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex='0']")];
    const visible = controls.filter(
      (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && !(el.role === "tab" && el.tabIndex === -1),
    );
    visible.forEach((el, i) => el.setAttribute("data-control", String(i)));
    return visible.length;
  });
  const seen = new Set<string>();
  await page.locator("body").focus();
  for (let i = 0; i < total * 2 + 5; i++) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => document.activeElement?.getAttribute("data-control") ?? null);
    if (at !== null) seen.add(at);
  }
  const missed = await page.evaluate(
    (seen) =>
      [...document.querySelectorAll<HTMLElement>("[data-control]")].filter((el) => !seen.includes(el.dataset.control!)).map((el) => el.outerHTML.slice(0, 120)),
    [...seen],
  );
  expect(missed).toEqual([]);
}

test("a11y: the list of prints", async ({ page }) => {
  await signIn(page, "/");
  await expect(page.getByRole("heading", { name: "Drucke" })).toBeVisible();
  await noViolations(page);
  await everyControlByKeyboard(page);
  // The other tab, with the arrow keys.
  const tabs = page.getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
});

test("a11y: a print's form with a photo", async ({ page }) => {
  await newPrint(page, { title: unique("Barrierefrei") });
  await addPhoto(page);
  await noViolations(page);
  await everyControlByKeyboard(page);
});

test("a11y: the crop frame", async ({ page }) => {
  await newPrint(page, { title: unique("Rahmen") });
  await addPhoto(page);
  await page.getByRole("button", { name: /Ausschnitt wählen/ }).click();
  await expect(page.getByRole("group", { name: "Ausschnitt" })).toBeVisible();
  await noViolations(page);
});

for (const [path, heading] of [
  ["/order", "Reihenfolge"],
  ["/categories", "Kategorien"],
  ["/add-ons", "Extras"],
  ["/settings", "Einstellungen"],
]) {
  test(`a11y: ${path}`, async ({ page }) => {
    await signIn(page, path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await noViolations(page);
    await everyControlByKeyboard(page);
  });
}
