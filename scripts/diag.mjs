import { chromium } from "playwright";
const URL = process.env.URL || "http://localhost:4173/";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1 });
page.on("console", (m) => console.log(`[${m.type()}]`, m.text()));
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#renderCanvas");
console.log("waiting 8s for first frames...");
await page.waitForTimeout(8000);
const info = await page.evaluate(() => {
  const g = window.heistTD;
  return { hasGame: !!g, fps: g ? Math.round(g.ctx.scene.getEngine().getFps()) : -1 };
});
console.log("info:", JSON.stringify(info));
await page.screenshot({ path: "shots/diag.png", timeout: 60000 });
console.log("screenshot ok");
await browser.close();
