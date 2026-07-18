/**
 * Browser smoke test of the sacred demo path:
 * place building -> toggle A/B -> run stress test -> memo renders.
 * Fails on any console error. Saves stage screenshots to --outdir.
 */
const { chromium } = require("playwright");

const BASE = process.env.SMOKE_URL || "http://localhost:3000/";
const OUT =
  process.argv[2] ||
  process.env.SMOKE_OUTDIR ||
  "/tmp/innsight-smoke";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`PAGEERROR: ${err.message}`));

  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3500);

  // Landing screen (if present): enter the app first.
  const getStarted = page.getByText("Get Started", { exact: true });
  if (await getStarted.count()) {
    await getStarted.first().click();
    await page.waitForTimeout(2000);
  }
  await shot("1-map");

  // 1. Place the building.
  await page.getByText("Place building at 45 The Esplanade").click();
  await page.waitForTimeout(1200);
  await shot("2-placed");

  // 2. Toggle to Option B and back to A.
  await page.getByText("Option B", { exact: false }).first().click();
  await page.waitForTimeout(800);
  await shot("3-option-b");
  await page.getByText("Option A", { exact: false }).first().click();
  await page.waitForTimeout(500);

  // 3. Run the stress test.
  await page.getByText(/Run (heat-wave stress test|year stress)/).first().click();
  await page.waitForSelector("text=PEAK GRID STRAIN", { timeout: 30000 });
  await page.waitForTimeout(1000);
  await shot("4-stress");

  // 4. Open the memo.
  await page.waitForSelector("text=/View (year )?memo/", { timeout: 90000 });
  await page.getByText(/View (year )?memo/).first().click();
  await page.waitForSelector("text=/(COMPARATIVE DEVELOPMENT|YEAR-PACK PORTFOLIO) MEMO/i", {
    timeout: 20000,
  });
  await page.waitForTimeout(600);
  await shot("5-memo");

  // 5. Profiles panel with the validation overlay.
  await page.getByText("Close", { exact: true }).click();
  await page.getByText("Back to map").click();
  await page.getByText("Energy Load Profiles").click();
  await page.waitForSelector("text=Validation: our generated curve", {
    timeout: 15000,
  });
  await page.waitForTimeout(800);
  await shot("6-profiles");

  await browser.close();

  const failed = errors.length > 0;
  console.log(
    JSON.stringify({ ok: !failed, errors, screenshots: OUT }, null, 2),
  );
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});
