/**
 * Records the full demo path as video for the backup GIF:
 * map -> place -> toggle B -> stress test -> memo -> profiles.
 */
const { chromium } = require("playwright");

const OUT = process.argv[2] || "/tmp/innsight-demo";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);

  await page.getByText("Place building at 45 The Esplanade").click();
  await page.waitForTimeout(2500);

  await page.getByText("Option B", { exact: false }).first().click();
  await page.waitForTimeout(1800);
  await page.getByText("Option A", { exact: false }).first().click();
  await page.waitForTimeout(1500);

  await page.getByText("Run heat-wave stress test").click();
  await page.waitForSelector("text=PEAK GRID STRAIN", { timeout: 30000 });
  await page.waitForTimeout(3500);

  await page.getByText("Option B: Mass Timber", { exact: false }).first().click();
  await page.waitForTimeout(2000);

  await page.waitForSelector("text=View memo", { timeout: 30000 });
  await page.getByText("View memo").click();
  await page.waitForSelector("text=COMPARATIVE DEVELOPMENT MEMO", { timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(2500);

  await context.close();
  await browser.close();
  console.log("video saved in", OUT);
})();
