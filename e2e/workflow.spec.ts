// The way from the printer to the site on the phone: photos first, then the name; the tips "For the website"; the price from the site's
// formula; and a save that keeps what was changed elsewhere since the page was opened.
import { expect, test } from "@playwright/test";
import { FIXTURE, newPrint, PHONE, unique } from "./app";
import { signIn } from "./signin";

test.use(PHONE);

test("startWithPhotos: photos picked on the list make a draft that opens with them; naming it gives it its address", async ({ page }) => {
  await signIn(page, "/");
  const start = page.getByLabel("Mit Fotos beginnen");
  await expect(page.getByRole("link", { name: "Neuer Druck" })).toBeVisible();
  await start.setInputFiles([FIXTURE, FIXTURE]);
  await expect(page).toHaveURL(/\/prints\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Neuer Druck /);
  await expect(page.getByRole("list", { name: "Fotos" }).getByRole("listitem")).toHaveCount(2, { timeout: 30_000 });

  const title = unique("Drachenei");
  await page.getByLabel("Titel", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();
  // The draft's address followed its new name.
  await expect(page.getByLabel("Adresse auf der Website")).toHaveValue(/^drachenei-/);
});

test("forTheWebsite: tips say what the site would miss, and go once it's there", async ({ page }) => {
  await newPrint(page, { title: unique("Kabelhalter"), description: "Ein Halter für Kabel am Schreibtisch, geschraubt oder geklebt." });
  const tips = page.getByRole("region", { name: "Für die Website" });
  await expect(tips).toContainText("Kein Preis");
  await page.getByLabel("Preis (Euro)").fill("4");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();
  await expect(tips).not.toContainText("Kein Preis");
});

test("priceSuggestion: weight and time give the site's price, taken with one tap", async ({ page }) => {
  await newPrint(page, { title: unique("Vase") });
  await page.getByLabel("Gewicht (Gramm)").fill("50");
  await page.getByLabel("Druckzeit (Minuten)").fill("120");
  // 50 g PLA 2.25 € + 2 h 2 € + 2 € fee = 6.25, rounded up for customers.
  await expect(page.getByText("Nach Preisformel (PLA): 6,25 €, aufgerundet 7 €")).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByLabel("Preis (Euro)")).toHaveValue("7");
});

test("saveKeepsOtherChanges: a save sends only what was changed in it, so a change made elsewhere meanwhile stays", async ({ page, context }) => {
  const id = await newPrint(page, { title: unique("Schale"), description: "Erste Beschreibung." });
  // Elsewhere (another tab, as Claude would through MCP): the description changes.
  const other = await context.newPage();
  await other.goto(`/prints/${id}`);
  await expect(other.getByRole("button", { name: "Speichern" })).toBeEnabled();
  await other.getByLabel("Beschreibung").fill("Von woanders geändert.");
  await other.getByRole("button", { name: "Speichern" }).click();
  await expect(other.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();
  await other.close();
  // Here, still showing the first description: only the price is changed and saved.
  await page.getByLabel("Preis (Euro)").fill("9");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Beschreibung")).toHaveValue("Von woanders geändert.");
  await expect(page.getByLabel("Preis (Euro)")).toHaveValue("9");
});

test("fromLink: a link that is no model page is refused with what is wrong, and nothing is made", async ({ page }) => {
  await signIn(page, "/");
  const field = page.getByLabel("Link zu einem Modell einfügen");
  await field.fill("https://www.example.com/model/12345");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByText("Das ist keine Adresse eines Modells")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
