import { expect, test, type Page } from "@playwright/test";

// A scenario link, as "Copy link" produces it.
const SCENARIO = "?year=2010&shock=GRC:1.00,PRT:0.60@2&model=debtrank";

async function openControls(page: Page) {
  // A scenario link opens the panel on its own a moment after load, so retry
  // until the toggle reports open instead of trusting a single read.
  const toggle = page.locator("button[aria-expanded]");
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded", { timeout: 1000 })) !== "true") {
      await toggle.click({ timeout: 2000 });
    }
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("sidebar-controls")).toBeVisible();
}

test("loads with no console errors and fetches the default year", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  const data = page.waitForResponse((r) => /data\/network\/\d{4}\.json/.test(r.url()));

  await page.goto("./");

  expect((await data).status()).toBe(200);
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a shared scenario link restores the shock and fills the ranking", async ({ page }) => {
  await page.goto(`./${SCENARIO}`);
  await openControls(page);

  await expect(page.getByRole("status")).toContainText("impact");
  await expect(page.getByRole("status")).toHaveAttribute("aria-live", "polite");
  await expect(page.getByTestId("ranking-header")).toContainText("affected");
  await expect(page.getByTestId("ranked-results")).toContainText("Portugal");
});

test("picking a country and a shock produces a ranking, and Reset clears it", async ({ page }) => {
  await page.goto("./");
  await openControls(page);

  await page.getByRole("combobox").filter({ hasText: "Select a country to shock" }).selectOption({ label: "Greece" });
  await expect(page.getByTestId("ranked-results")).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("ranked-results")).toHaveCount(0);
});

test("switching years loads that year's file", async ({ page }) => {
  await page.goto("./");
  await openControls(page);
  const data = page.waitForResponse((r) => r.url().includes("/data/network/2008.json"));

  await page.getByRole("slider").first().fill("2008");

  expect((await data).status()).toBe(200);
});

test("country details open from the ranking drill-down and from the result card", async ({ page }) => {
  await page.goto(`./${SCENARIO}`);
  await openControls(page);
  const panel = page.getByTestId("country-panel");

  await page.getByTestId("ranked-results").getByText("Portugal", { exact: true }).click();
  await page.getByTestId("ranked-results").getByRole("button", { name: "Country details" }).click();
  await expect(panel).toContainText("Portugal");
  await expect(panel).toContainText("Creditors");
  await expect(panel).toContainText("External debt / GDP");

  await panel.getByRole("button", { name: "Close country details" }).click();
  await expect(panel).toHaveCount(0);

  await page.getByRole("button", { name: "Country details" }).first().click();
  await expect(panel).toContainText("Greece");
});

test("pair view shows both directions and a history, and closes", async ({ page }) => {
  await page.goto(`./${SCENARIO}`);
  await openControls(page);
  const history = page.waitForResponse((r) => r.url().includes("/data/network/pairs.json"));

  await page.getByTestId("ranked-results").getByText("Portugal", { exact: true }).click();
  await page.getByTestId("ranked-results").getByRole("button", { name: "Pair view" }).click();

  const panel = page.getByTestId("pair-panel");
  await expect(panel).toContainText("Portugal ↔ Greece");
  await expect(panel).toContainText("Portugal on Greece");
  await expect(panel).toContainText("Greece on Portugal");
  await expect(panel).toContainText("loss buffer");
  expect((await history).status()).toBe(200);
  await expect(panel.getByTestId("pair-sparkline")).toBeVisible();

  await panel.getByRole("button", { name: "Close pair view" }).click();
  await expect(panel).toHaveCount(0);
});

test("the Stability tab opens from a link, charts every year, and tab changes go through the URL", async ({ page }) => {
  await page.goto("./?view=stability");
  await expect(page.getByRole("tab", { name: "Stability" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("stability-chart")).toBeVisible({ timeout: 60_000 });
  // 21 yearly points on the line, and no globe on this tab
  await expect(page.getByTestId("stability-chart").locator("circle")).toHaveCount(21);
  await expect(page.locator("canvas")).toHaveCount(0);

  await page.getByRole("tab", { name: "Contagion" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  expect(page.url()).not.toContain("view=");

  await page.getByRole("tab", { name: "Stability" }).click();
  expect(page.url()).toContain("view=stability");
});

test("the tab bar follows the arrow keys, Home and End", async ({ page }) => {
  await page.goto("./");
  const contagion = page.getByRole("tab", { name: "Contagion" });
  const stability = page.getByRole("tab", { name: "Stability" });
  await contagion.focus();

  await page.keyboard.press("ArrowRight");
  await expect(stability).toHaveAttribute("aria-selected", "true");
  await expect(stability).toBeFocused();
  await page.keyboard.press("ArrowRight"); // wraps
  await expect(contagion).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(stability).toBeFocused();
  await page.keyboard.press("Home");
  await expect(contagion).toBeFocused();
  // only the selected tab is in the tab order
  await expect(stability).toHaveAttribute("tabindex", "-1");
});

test.describe("layout contracts", () => {
  test("ranking scrolls on its own, below a fixed header and fixed controls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`./${SCENARIO}`);
    await openControls(page);

    const results = page.getByTestId("ranked-results");
    await expect(results).toBeVisible();
    expect(await results.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
    const header = (await page.getByTestId("ranking-header").boundingBox())!;
    const list = (await results.boundingBox())!;
    expect(list.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  });

  test("opening the sidebar does not resize the globe", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./");
    const canvas = page.locator("canvas");
    // The canvas starts at its 300x150 default until it fits the viewport.
    await expect.poll(async () => (await canvas.boundingBox())?.width, { timeout: 20_000 }).toBe(1280);
    const before = (await canvas.boundingBox())!;

    await openControls(page);

    const after = (await canvas.boundingBox())!;
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  test("desktop sidebar is 380px wide", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./");
    await openControls(page);
    const box = (await page.getByTestId("sidebar-controls").boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(380);
    expect(box.width).toBeGreaterThan(300);
  });

  test("mobile: the country panel fits without sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`./${SCENARIO}`);
    await openControls(page);
    await page.getByRole("button", { name: "Country details" }).first().click();

    const panel = page.getByTestId("country-panel");
    await expect(panel).toContainText("Greece");
    expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("mobile: the pair view fits without sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`./${SCENARIO}`);
    await openControls(page);
    await page.getByTestId("ranked-results").getByText("Portugal", { exact: true }).click();
    await page.getByTestId("ranked-results").getByRole("button", { name: "Pair view" }).click();

    const panel = page.getByTestId("pair-panel");
    await expect(panel.getByTestId("pair-sparkline")).toBeVisible();
    expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("mobile: the tab bar and the Stability view fit without sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("./?view=stability");
    await expect(page.getByRole("tab", { name: "Stability" })).toBeVisible();
    await expect(page.getByTestId("stability-chart")).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("mobile: drawer opens and closes, and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("./");
    const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    expect(await noSideScroll()).toBe(true);
    await page.getByRole("button", { name: "Open controls" }).click();
    await expect(page.getByTestId("sidebar-controls")).toBeVisible();
    // The drawer starts below the 80px navbar, which stays reachable.
    expect((await page.getByTestId("sidebar-controls").boundingBox())!.y).toBeGreaterThanOrEqual(80);
    expect(await noSideScroll()).toBe(true);
    const drawer = page.locator("aside");
    expect(await drawer.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
    await page.getByRole("button", { name: "Close controls" }).first().click();
    await expect(page.getByRole("button", { name: "Open controls" })).toBeVisible();
    // Closed, the drawer is off-screen, so its controls must not be tabbable.
    expect(await drawer.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  });
});
