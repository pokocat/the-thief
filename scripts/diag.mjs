import { chromium } from "playwright";
const URL = process.env.URL || "http://localhost:4173/";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 }, deviceScaleFactor: 1.3 });
page.on("console", (m) => { if (m.type() === "error") console.log("[err]", m.text()); });
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));
await page.goto(URL, { waitUntil: "domcontentloaded" });
console.log("waiting for asset preload + game init...");
await page.waitForFunction(() => !!window.heistTD, null, { timeout: 90000 });
await page.waitForTimeout(4000);
const info = await page.evaluate(() => ({ fps: Math.round(window.heistTD.ctx.scene.getEngine().getFps()), towers: window.heistTD.ctx.towers.towers.length }));
console.log("info:", JSON.stringify(info));
await page.screenshot({ path: "shots/diag.png", timeout: 120000 });
console.log("screenshot ok");
await browser.close();
