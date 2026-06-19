import { chromium } from "playwright";
const URL = process.env.URL || "http://localhost:4173/";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector("#renderCanvas");
await page.waitForTimeout(2500);

await page.evaluate(() => {
  const g = window.heistTD;
  g.ctx.state.gold = 99999;
  // thieves around the bottom lane so we see steal coins + floating text
  for (const [id, idx] of [["thief_02", 1], ["thief_01", 2], ["archer_01", 3], ["mage_slow_01", 5], ["frost_01", 6]]) g.build(id, idx);
  // zoom + aim the camera at the bottom lane (mutate Vector3 components in place)
  const cam = g.camera.camera;
  cam.radius = 24;
  cam.target.x = -1;
  cam.target.y = 0.5;
  cam.target.z = -8;
  g.ctx.state.currentWave = 0;
  g.waves.requestStart(); // wave 1
});
await page.waitForTimeout(4500);
await page.screenshot({ path: "shots/10-closeup.png" });
console.log("saved shots/10-closeup.png");
await browser.close();
