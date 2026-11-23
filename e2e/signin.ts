import type { Page } from "@playwright/test";

/** Marcel, the one address the e2e server's PORTFOLIO_ALLOWED_EMAILS lets in. */
export const MARCEL = "marcel@example.com";

/** Signs the browser in through the kit's test-only route (PORTFOLIO_E2E=1) and opens `next`. */
export async function signIn(page: Page, next = "/"): Promise<void> {
  await page.goto(`/api/test/sign-in?${new URLSearchParams({ email: MARCEL, next })}`);
}
