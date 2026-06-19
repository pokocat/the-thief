// Renders the game in headless Chromium (SwiftShader WebGL) and captures
// a series of screenshots demonstrating the prototype.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.URL || "http://localhost:4173/";
const OUT = "shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--no-sandbox",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE ERROR:", m.text());
});
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector("#renderCanvas");
await page.waitForTimeout(2500); // let the scene build

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", `${OUT}/${name}.png`);
};

await shot("1-overview");

// place a mix of towers along the path lanes and load up on gold
await page.evaluate(() => {
  const g = window.heistTD;
  g.ctx.state.gold = 99999;
  const plan = [
    ["thief_01", 1], ["thief_01", 2], ["archer_01", 3], ["mage_slow_01", 4],
    ["thief_01", 5], ["frost_01", 6], ["mage_blood_01", 9], ["thief_01", 10],
    ["archer_01", 11], ["mage_armor_01", 12], ["thief_01", 13], ["frost_01", 14],
    ["hero_01", 18],
  ];
  for (const [id, idx] of plan) g.build(id, idx);
});
await page.waitForTimeout(300);
await shot("2-towers-built");

// open the build menu on an empty pad
await page.evaluate(() => window.heistTD.ui.selectAt("pad", 0));
await page.waitForTimeout(300);
await shot("3-build-menu");
await page.evaluate(() => window.heistTD.ui.clearSelection());

// start wave 1 and capture mid-combat
await page.evaluate(() => window.heistTD.waves.requestStart());
await page.waitForTimeout(3500);
await shot("4-combat-wave1");

// tower detail panel
await page.evaluate(() => {
  const uid = window.heistTD.ctx.towers.towers[0].uid;
  window.heistTD.ui.selectAt("tower", uid);
});
await page.waitForTimeout(300);
await shot("5-tower-panel");
await page.evaluate(() => window.heistTD.ui.clearSelection());

// tech panel
await page.click('button:has-text("科技")');
await page.waitForTimeout(300);
await shot("6-tech-panel");
await page.click('.tech-panel .close-btn');

// jump ahead to a boss/flying wave for variety: fast-forward several waves
await page.evaluate(async () => {
  const g = window.heistTD;
  g.ctx.state.gold = 999999;
  // upgrade a couple of thieves to show bigger models + add anti-air everywhere
  for (const t of g.ctx.towers.towers) {
    let guard = 0;
    while (t.cfg.upgradeTo && guard < 2) {
      g.ctx.towers.upgrade(t, g.ctx);
      guard++;
    }
  }
});
// run forward to wave 10 (flying) by clearing waves quickly via simulated time is hard;
// instead just let current wave finish and start the next few
await page.waitForTimeout(500);
await shot("7-upgraded-towers");

await browser.close();
console.log("done");
