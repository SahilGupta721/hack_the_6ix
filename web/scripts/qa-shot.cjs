const { chromium } = require("playwright");

(async () => {
  const url = process.argv[2] || "http://localhost:3000/";
  const out = process.argv[3] || "/tmp/qa.png";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`PAGEERROR: ${err.message}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ url, errors }, null, 2));
  await browser.close();
})();
