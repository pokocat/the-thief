import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.URL || "http://localhost:4173/";
mkdirSync("shots", { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector("#renderCanvas");
await page.waitForTimeout(2500);

// weak-ish towers so enemies survive and walk the path with visible health bars,
// then spawn a big swarm wave (wave 13 = 32 normals) for a lively combat frame.
await page.evaluate(() => {
  const g = window.heistTD;
  g.ctx.state.gold = 99999;
  const plan = [["thief_01", 1], ["thief_01", 5], ["archer_01", 3], ["mage_slow_01", 10], ["thief_02", 13], ["thief_01", 6]];
  for (const [id, idx] of plan) g.build(id, idx);
  g.ctx.state.currentWave = 12; // requestStart -> wave 13 (swarm)
  g.waves.requestStart();
});

// let the swarm spread across the first lanes
await page.waitForTimeout(5000);
await page.screenshot({ path: "shots/8-combat-swarm.png" });
console.log("saved shots/8-combat-swarm.png");

// a flying wave to show anti-air (set to wave 9 -> start wave 10 flyers)
await page.evaluate(() => {
  const g = window.heistTD;
  // add anti-air coverage
  g.build("archer_01", 11);
  g.build("archer_02", 12);
});
await page.waitForTimeout(6000);
await page.screenshot({ path: "shots/9-after-combat.png" });
console.log("saved shots/9-after-combat.png");

await browser.close();
console.log("done");
