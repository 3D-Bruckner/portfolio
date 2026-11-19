// The phone's main path: a new print, its text, a category, a photo from the camera roll, published; and what can go wrong on the way
// (a dropped upload, a HEIC the picker must not offer, the last photo of a published print).
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { addPhoto, FIXTURE, newPrint, PHONE, publish, publishedPrint, siteExport, unique } from "./app";
import { signIn } from "./signin";

test.use(PHONE);

test("createDraftUploadPublish: a new print with its text, a category and a photo reaches the site's export", async ({ page, request }) => {
  const category = unique("Spielzeug");
  await signIn(page, "/categories");
  await page.getByLabel("Neue Kategorie").fill(category);
  await page.getByRole("button", { name: "Kategorie anlegen" }).click();
  await expect(page.getByRole("list", { name: "Kategorien" })).toContainText(category);

  const title = unique("Beyblade – Dragoon");
  await newPrint(page, { title, description: "Ein Kreisel aus PLA.", price: "6" });
  await page.getByRole("checkbox", { name: category }).check();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();
  await addPhoto(page);
  await publish(page);

  await page.goto("/");
  await page.getByRole("tab", { name: "Veröffentlicht" }).click();
  await expect(page.getByRole("tabpanel", { name: "Veröffentlicht" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
  const exported = (await siteExport(request, page)).prints.find((p) => p.title === title);
  expect(exported).toMatchObject({ price: 6, categories: [category], showcase: false });
  expect(exported?.photos).toHaveLength(1);
});

test("uploadRetryAfterFailure: a dropped upload fails alone and is sent again", async ({ page }) => {
  await newPrint(page, { title: unique("Wackelpudding") });
  let failed = false;
  await page.route("**/api/prints/*/photos", async (route) => {
    if (failed) return route.continue();
    failed = true;
    await route.fulfill({ status: 500, body: "" });
  });
  await page.getByLabel("Fotos hinzufügen").setInputFiles(FIXTURE);
  await expect(page.getByRole("region", { name: "Fotos" }).getByRole("alert")).toContainText("nicht hochgeladen");
  await page.getByRole("button", { name: /Erneut versuchen/ }).click();
  await expect(page.getByRole("list", { name: "Fotos" }).getByRole("listitem")).toHaveCount(1, { timeout: 20_000 });
});

test("stalledUploadGivesUp: an upload that hasn't moved for a minute is stopped and can be sent again", async ({ page }) => {
  // The page's clock is the test's: a minute passes at once. The first post never gets an answer, as on a dead mobile connection.
  await page.clock.install();
  await newPrint(page, { title: unique("Funkloch") });
  let stalled = false;
  await page.route("**/api/prints/*/photos", async (route) => {
    if (stalled) return route.continue();
    stalled = true;
    // Never answered.
  });
  await page.getByLabel("Fotos hinzufügen").setInputFiles(FIXTURE);
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect.poll(() => stalled).toBe(true);
  await page.clock.fastForward(59_000);
  await expect(page.getByRole("region", { name: "Fotos" }).getByRole("alert")).toHaveCount(0);
  await page.clock.fastForward(2_000);
  await expect(page.getByRole("region", { name: "Fotos" }).getByRole("alert")).toContainText("Es ging eine Minute lang nicht weiter.");
  await page.getByRole("button", { name: /Erneut versuchen/ }).click();
  await expect(page.getByRole("list", { name: "Fotos" }).getByRole("listitem")).toHaveCount(1, { timeout: 20_000 });
});

test("largePhotoArrivesWhole: a photo over 10 MB is stored, not cut off on the way to the route", async ({ page }) => {
  // Next 16 passes only the first 10 MB of a body on when its proxy runs on the route; the upload route is outside the proxy.
  const w = 2400;
  const h = 1800;
  const jpeg = await sharp(randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
    .toBuffer();
  expect(jpeg.length).toBeGreaterThan(11 * 1024 * 1024);
  const id = await newPrint(page, { title: unique("Großes Foto") });
  const r = await page.request.post(`/api/prints/${id}/photos`, {
    headers: { "accept-language": "de" },
    multipart: { photo: { name: "IMG_0002.jpg", mimeType: "image/jpeg", buffer: jpeg } },
  });
  expect(r.status(), await r.text()).toBe(201);
  expect(await r.json()).toMatchObject({ printId: id, width: w, height: h });
});

test("fileInputAccept: the picker asks for JPEG, PNG or WebP, so an iPhone converts HEIC", async ({ page }) => {
  await newPrint(page, { title: unique("Accept") });
  await expect(page.getByLabel("Fotos hinzufügen")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  await expect(page.getByLabel("Fotos hinzufügen")).toHaveAttribute("multiple", "");
});

test("buildLineShowsPending: after publishing, the header says the site is about to be updated", async ({ page }) => {
  await publishedPrint(page, unique("Bauzeile"));
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText("Website wird in Kürze aktualisiert");
});

test("cropCutout: a cutout chosen with the keyboard changes the photo the site gets", async ({ page, request }) => {
  const title = unique("Ausschnitt");
  await publishedPrint(page, title);
  const before = (await siteExport(request, page)).prints.find((p) => p.title === title)!.photos[0]!;
  await page.getByRole("button", { name: /Ausschnitt wählen/ }).click();
  const frame = page.getByRole("group", { name: "Ausschnitt" });
  await frame.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Ausschnitt speichern" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(async () => (await siteExport(request, page)).prints.find((p) => p.title === title)!.photos[0]!.width).toBeLessThan(before.width);
});

test("deleteLastPhotoWarns: deleting a published print's last photo says it leaves the site, then takes it off", async ({ page }) => {
  await publishedPrint(page, unique("Letztes Foto"));
  await page.getByRole("button", { name: /Foto löschen/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("von der Website genommen");
  await dialog.getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByRole("list", { name: "Fotos" }).getByRole("listitem")).toHaveCount(0);
  await expect(page.getByText("Entwurf", { exact: true })).toBeVisible();
});

test("a draft's photo is deleted after a plain confirmation", async ({ page }) => {
  await newPrint(page, { title: unique("Entwurfsfoto") });
  await addPhoto(page);
  await page.getByRole("button", { name: /Foto löschen/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).not.toContainText("von der Website genommen");
  await dialog.getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByRole("list", { name: "Fotos" }).getByRole("listitem")).toHaveCount(0);
});

test("publishing without a photo says what is missing", async ({ page }) => {
  await newPrint(page, { title: unique("Ohne Foto"), description: "Text ist da." });
  await expect(page.getByRole("button", { name: "Veröffentlichen" })).toBeDisabled();
  await expect(page.getByText("Zum Veröffentlichen fehlt: mindestens ein Foto")).toBeVisible();
});

test("saveBarNeverCovers: on a phone, the sticky Save bar covers no field as the form is tabbed through or scrolled", async ({ page }) => {
  await newPrint(page, { title: unique("Lange Form"), description: "Text." });
  const bar = page.getByRole("button", { name: "Speichern" });
  /** Whether the focused field is on screen and the point at its centre is the field itself, not the Save bar over it. */
  const focusedIsVisible = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + Math.min(r.height / 2, 20);
      return { name: el.getAttribute("name") ?? el.tagName, ok: y > 0 && y < window.innerHeight && el.contains(document.elementFromPoint(x, y)) };
    });
  // From the bottom of the page, the title (the first field) comes back into view uncovered.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByLabel("Titel", { exact: true }).focus();
  expect(await focusedIsVisible()).toEqual({ name: "title", ok: true });
  // Tabbing down through every field: the one that has focus is never under the bar.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByLabel("Titel", { exact: true }).focus();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await bar.evaluate((b) => b === document.activeElement || b.contains(document.activeElement))) break;
    const tag = await page.evaluate(() => document.activeElement?.tagName);
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") continue;
    expect(await focusedIsVisible()).toEqual({ name: expect.any(String), ok: true });
  }
});
