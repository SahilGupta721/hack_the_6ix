const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  const dir = "/tmp/claude-1000/-mnt-c-Users-minif-Downloads-UofT-Projects-hack-the-6IX/a44ecb3e-17eb-47ec-9f4f-d248d27a0516/scratchpad";
  await page.screenshot({ path: `${dir}/landing-fixed.png` });
  await browser.close();
  console.log("landing shot saved");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
