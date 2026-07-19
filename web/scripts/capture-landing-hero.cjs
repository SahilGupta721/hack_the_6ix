// Refresh the landing hero: capture the assembler in its placed-building state.
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(() => sessionStorage.setItem("innsight-entered", "1"));
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const gs = page.getByRole("button", { name: "Get Started" });
  if (await gs.count()) { await gs.first().click(); }
  await page.waitForTimeout(6000);
  const place = page.getByText(/Place building/);
  if (await place.count()) { await place.first().click(); }
  await page.waitForTimeout(9000);
  await page.screenshot({ path: "public/screenshot-assembler.png" });
  await browser.close();
  console.log("hero refreshed");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
