// Steps the web app's tests share: a phone's viewport and German, a new print through the form, a photo through the file input, the
// export read with an API token made on the settings page (as the site build reads it).
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { join } from "node:path";
import { signIn } from "./signin";

export const PHONE = {
  viewport: { width: 390, height: 844 },
  locale: "de-DE",
  extraHTTPHeaders: { "accept-language": "de-DE,de;q=0.9,en;q=0.8" },
};

// Playwright runs from the repository root.
export const FIXTURE = join(process.cwd(), "backend", "fixtures", "gps-rotated.jpg");

/** A title no other test uses, so tests running side by side find their own prints. */
export const unique = (title: string): string => `${title} ${Math.random().toString(36).slice(2, 8)}`;

/** Signs in, makes a draft through "Neuer Druck" and lands on its page; returns its id. */
export async function newPrint(page: Page, fields: { title: string; description?: string; price?: string }): Promise<string> {
  await signIn(page, "/");
  await page.getByRole("link", { name: "Neuer Druck" }).click();
  await page.getByLabel("Titel", { exact: true }).fill(fields.title);
  if (fields.description) await page.getByLabel("Beschreibung").fill(fields.description);
  if (fields.price) await page.getByLabel("Preis (Euro)").fill(fields.price);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/prints\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Picks the fixture photo in the file input and waits until it is shown in the grid. */
export async function addPhoto(page: Page, count = 1): Promise<void> {
  await page.getByLabel("Fotos hinzufügen").setInputFiles(FIXTURE);
  await expect(page.getByRole("list", { name: "Fotos" }).getByRole("listitem")).toHaveCount(count, { timeout: 20_000 });
}

export async function publish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(page.getByText("Veröffentlicht", { exact: true })).toBeVisible();
}

/** A published print with a title, a description and the fixture photo; returns its id. */
export async function publishedPrint(page: Page, title: string): Promise<string> {
  const id = await newPrint(page, { title, description: "Gedruckt für einen Test." });
  await addPhoto(page);
  await publish(page);
  return id;
}

let token: string | undefined;

/** A read token, made once per worker on the settings page, in a tab of its own so the test's page stays where it is. */
export async function readToken(page: Page): Promise<string> {
  if (token) return token;
  const tab = await page.context().newPage();
  await signIn(tab, "/settings");
  await tab.getByLabel("Name des Tokens").fill(unique("e2e"));
  await tab.getByRole("button", { name: "Token erstellen" }).click();
  const shown = tab.getByLabel("Neuer Token");
  await expect(shown).toHaveValue(/^upl_/, { timeout: 20_000 });
  token = await shown.inputValue();
  await tab.close();
  return token;
}

type Exported = { slug: string; title: string; price?: number; categories: string[]; showcase: boolean; photos: { width: number; height: number }[] };

export async function siteExport(request: APIRequestContext, page: Page): Promise<{ prints: Exported[] }> {
  const t = await readToken(page);
  const r = await request.get("/api/v1/export", { headers: { authorization: `Bearer ${t}` } });
  expect(r.status()).toBe(200);
  return r.json();
}
