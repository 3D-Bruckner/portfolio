// Sign-in as a browser meets it: the pages send someone not signed in to /signin and back, the sign-in page in the page's language with
// its ways in and a refused sign-in's reason, the consent page an MCP client's sign-in ends on, and the OAuth metadata MCP clients read.
import { expect, test } from "@playwright/test";
import { MARCEL, signIn } from "./signin";

test.describe("a browser that asks for German", () => {
  test.use({ locale: "de-DE", extraHTTPHeaders: { "accept-language": "de-DE,de;q=0.9,en;q=0.8" } });

  test("is sent to the sign-in page, in German, and comes back once signed in", async ({ page }) => {
    await page.goto("/");
    expect(new URL(page.url()).pathname).toBe("/signin");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/");
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
    await expect(page.getByRole("button", { name: "Code zuschicken" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mit Passkey anmelden" })).toBeVisible();
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Drucke" })).toBeVisible();
  });

  test("shows why a sign-in was refused, in its own words", async ({ page }) => {
    await page.goto("/signin?error=email_not_allowed&next=%2F");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Mit dieser Adresse kann man sich hier nicht anmelden.");
    await page.goto("/signin?error=INVALID_TOKEN");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Anmeldelink ist abgelaufen");
  });

  test("asks for the code once it is sent, saying where to", async ({ page }) => {
    // The e2e server's SMTP server doesn't exist; Better Auth sends in the background, so the page can't tell and the log says so.
    await page.goto("/signin");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("E-Mail-Adresse").fill(MARCEL);
    await page.getByRole("button", { name: "Code zuschicken" }).click();
    await expect(page.getByRole("status")).toHaveText(`Wir haben einen Anmeldecode an ${MARCEL} geschickt. Gib ihn hier ein.`);
    await page.getByLabel("Code", { exact: true }).fill("000000");
    await page.getByRole("button", { name: "Mit dem Code anmelden" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Dieser Code stimmt nicht oder ist abgelaufen. Bitte einen neuen anfordern.");
  });

  test("the consent page asks the signed-in person", async ({ page }) => {
    await signIn(page, "/consent?client_id=unknown");
    await expect(page.getByRole("heading", { name: "Zugriff erlauben?" })).toBeVisible();
    await expect(page.getByText(MARCEL)).toBeVisible();
    await expect(page.getByRole("button", { name: "Erlauben" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ablehnen" })).toBeVisible();
  });
});

test("the consent page sends someone not signed in to /signin, carrying where they were going", async ({ request }) => {
  const r = await request.get("/consent?client_id=unknown&scope=openid", { maxRedirects: 0 });
  expect(r.status()).toBe(307);
  expect(r.headers().location).toBe(`/signin?${new URLSearchParams({ next: "/consent?client_id=unknown&scope=openid" })}`);
});

test("the test sign-in route refuses an address not on the list", async ({ request }) => {
  const r = await request.get("/api/test/sign-in?email=eve@example.com", { maxRedirects: 0 });
  expect(r.status()).toBe(403);
  expect(r.headers()["set-cookie"]).toBeUndefined();
});

test("MCP clients find the authorization server and the protected resources", async ({ request, baseURL }) => {
  expect(await (await request.get("/.well-known/oauth-protected-resource/mcp")).json()).toMatchObject({ resource: `${baseURL}/mcp` });
  expect(await (await request.get("/.well-known/oauth-protected-resource/api/v1")).json()).toMatchObject({ resource: `${baseURL}/api/v1` });
  expect(await (await request.get("/.well-known/oauth-authorization-server/api/auth")).json()).toMatchObject({ issuer: `${baseURL}/api/auth` });
  expect(await (await request.get("/.well-known/openid-configuration/api/auth")).json()).toMatchObject({ issuer: `${baseURL}/api/auth` });
});
