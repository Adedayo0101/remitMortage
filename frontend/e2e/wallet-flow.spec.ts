import { test, expect } from "@playwright/test";

const MOCK_PUBLIC_KEY = "GAXI4LZGQ7F3CKOBU7S6MFYKZRCNFRQVXJXKOMZ7GM7MIFST5W54AAAA";

test.beforeEach(async ({ page }) => {
  // Inject mock Freighter wallet interface into window before page loads
  await page.addInitScript((mockPublicKey) => {
    (window as any).freighterApi = {
      isConnected: async () => true,
      getPublicKey: async () => mockPublicKey,
      signBlob: async (blob: string) => `mock_signature_hex_${blob}`,
      requestAccess: async () => {},
      getNetwork: async () => "https://horizon-testnet.stellar.org",
      isAllowed: async () => true,
    };
  }, MOCK_PUBLIC_KEY);
});

test.describe("Freighter Wallet Cross-Browser E2E Flow", () => {
  test("connects mock Freighter wallet successfully", async ({ page }) => {
    await page.goto("/");

    // Click the connect wallet button on Navbar
    const connectBtn = page.locator('[data-testid="connect-wallet-button"]').first();
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    // Verify wallet address display appears with shortened public key
    const addressDisplay = page.locator('[data-testid="wallet-address-display"]').first();
    await expect(addressDisplay).toBeVisible();
    await expect(addressDisplay).toContainText("GAXI4L");
  });

  test("executes sign-challenge flow against mock Freighter interface", async ({ page }) => {
    await page.goto("/");

    // Connect wallet first
    const connectBtn = page.locator('[data-testid="connect-wallet-button"]').first();
    await connectBtn.click();

    // Open wallet modal by clicking connected address badge
    const addressDisplay = page.locator('[data-testid="wallet-address-display"]').first();
    await expect(addressDisplay).toBeVisible();
    await addressDisplay.click();

    // Trigger challenge signing inside modal
    const signBtn = page.locator('[data-testid="sign-challenge-btn"]');
    await expect(signBtn).toBeVisible();
    await signBtn.click();

    // Verify signature output
    const resultBox = page.locator('[data-testid="signed-challenge-result"]');
    await expect(resultBox).toBeVisible();
    await expect(resultBox).toContainText("mock_signature_hex_auth_challenge_nonce_123456");
  });

  test("disconnects wallet cleanly and resets state", async ({ page }) => {
    await page.goto("/");

    // Connect wallet
    const connectBtn = page.locator('[data-testid="connect-wallet-button"]').first();
    await connectBtn.click();

    // Verify connected
    const addressDisplay = page.locator('[data-testid="wallet-address-display"]').first();
    await expect(addressDisplay).toBeVisible();

    // Click disconnect button
    const disconnectBtn = page.locator('[data-testid="disconnect-wallet-button"]').first();
    await expect(disconnectBtn).toBeVisible();
    await disconnectBtn.click();

    // Verify state resets to un-connected Connect Wallet button
    await expect(connectBtn).toBeVisible();
  });
});
