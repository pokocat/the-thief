import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const URL = process.env.URL || "http://localhost:4173/";
mkdirSync("shots", { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 }, deviceScaleFactor: 1.4 });
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#renderCanvas");
await page.waitForTimeout(6000);

const shot = async (name) => { await page.screenshot({ path: `shots/${name}.png`, timeout: 120000 }); console.log("saved", name); };

await shot("v2-1-overview");

// build a representative tower of each family + zoom in
await page.evaluate(() => {
  const g = window.heistTD;
  g.ctx.state.gold = 999999;
  for (const [id, idx] of [["thief_03", 5], ["mage_blood_01", 4], ["frost_02", 6], ["archer_02", 3], ["hero_01", 13], ["mage_armor_01", 2]]) g.build(id, idx);
  const cam = g.camera.camera; cam.radius = 20; cam.target.x = 0; cam.target.y = 0.6; cam.target.z = -5;
});
await page.waitForTimeout(2500);
await shot("v2-2-towers");

// spawn a swarm and zoom to the bottom lane for characters + shadows + combat
await page.evaluate(() => {
  const g = window.heistTD;
  g.ctx.state.currentWave = 12; g.waves.requestStart(); // wave 13 swarm of goblins
  const cam = g.camera.camera; cam.radius = 22; cam.target.x = -2; cam.target.y = 0.5; cam.target.z = -8.5;
});
await page.waitForTimeout(16000);
await shot("v2-3-combat");

// a boss wave for the big unit
await page.evaluate(() => {
  const g = window.heistTD;
  g.ctx.state.currentWave = 29; g.waves.requestStart(); // wave 30 final boss
  const cam = g.camera.camera; cam.radius = 26; cam.target.x = 6; cam.target.y = 1; cam.target.z = 2;
});
await page.waitForTimeout(16000);
await shot("v2-4-boss");

await browser.close();
console.log("done");
