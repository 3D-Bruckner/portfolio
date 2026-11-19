// A new print filled in from a Bambu Studio 3MF on the phone: the slicer's numbers, the suggested price, the model's title and its
// MakerWorld page, read in the browser; nothing is saved until "Speichern".
import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { PHONE, unique } from "./app";
import { signIn } from "./signin";

test.use(PHONE);

const MODEL = `<model><metadata name="Title">Plane Radar</metadata><metadata name="DesignModelId">2872376</metadata>
<metadata name="Description">&lt;p&gt;Live ADS-B.&lt;/p&gt;</metadata></model>`;
const SLICE = `<config><plate><metadata key="prediction" value="7200"/><metadata key="weight" value="50"/>
<filament id="1" type="PLA" color="#FFFFFF" used_g="45"/><filament id="2" type="PLA" color="#000000" used_g="5"/></plate></config>`;
const threeMf = Buffer.from(
  zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "3D/3dmodel.model": strToU8(MODEL), "Metadata/slice_info.config": strToU8(SLICE) }),
);

test("fillFromThreeMf: a sliced 3MF fills time, weight, colours, price, an empty title and the MakerWorld link", async ({ page }) => {
  await signIn(page, "/");
  await page.getByRole("link", { name: "Neuer Druck" }).click();
  // Wait until the form answers (hydrated), then pick the file as the phone's file picker would.
  await expect(page.getByRole("button", { name: "Speichern" })).toBeEnabled();
  await page.getByLabel("Aus 3MF-Datei ausfüllen").setInputFiles({ name: "radar.3mf", mimeType: "model/3mf", buffer: threeMf });
  await expect(page.getByRole("status").filter({ hasText: "Ausgefüllt" })).toContainText(
    "Druckzeit, Gewicht, Farben, Preis, Titel, Beschreibung, MakerWorld-Link",
  );
  await expect(page.getByLabel("Druckzeit (Minuten)")).toHaveValue("120");
  await expect(page.getByLabel("Gewicht (Gramm)")).toHaveValue("50");
  await expect(page.getByLabel("Farben", { exact: true })).toHaveValue("2");
  // 50 g PLA 2.25 € + 2 h 2 € + 2 € fee, multi-colour: (4.25 × 1.1) + 2 = 6.675 → 7.
  await expect(page.getByLabel("Preis (Euro)")).toHaveValue("7");
  await expect(page.getByLabel("Titel", { exact: true })).toHaveValue("Plane Radar");
  await expect(page.getByLabel("Beschreibung")).toHaveValue("Live ADS-B.");

  // A title typed first is kept; then it saves as any form does.
  const title = unique("Flugzeug-Radar");
  await page.getByLabel("Titel", { exact: true }).fill(title);
  await page.getByLabel("Aus 3MF-Datei ausfüllen").setInputFiles({ name: "radar.3mf", mimeType: "model/3mf", buffer: threeMf });
  await expect(page.getByLabel("Titel", { exact: true })).toHaveValue(title);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page).toHaveURL(/\/prints\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Druckzeit (Minuten)")).toHaveValue("120");
});

test("refusesOtherFiles: a photo picked by mistake is named as not a 3MF, and nothing changes", async ({ page }) => {
  await signIn(page, "/");
  await page.getByRole("link", { name: "Neuer Druck" }).click();
  await expect(page.getByRole("button", { name: "Speichern" })).toBeEnabled();
  await page.getByLabel("Aus 3MF-Datei ausfüllen").setInputFiles({ name: "IMG_1.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });
  await expect(page.getByRole("alert")).toHaveText("Das ist keine 3MF-Datei.");
  await expect(page.getByLabel("Druckzeit (Minuten)")).toHaveValue("");
});
