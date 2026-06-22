import { chromium } from "playwright";
const browser = await chromium.launch({ args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--enable-webgl","--no-sandbox"] });
const page = await browser.newPage({ viewport:{width:900,height:600} });
page.on("pageerror",e=>console.log("EXC",e.message));
await page.goto("http://localhost:4173/",{waitUntil:"domcontentloaded"});
await page.waitForFunction(()=>!!window.heistTD,null,{timeout:90000});
await page.waitForTimeout(2000);
const out = await page.evaluate(()=>{
  const g=window.heistTD; g.ctx.state.gold=999999;
  g.build("hero_01",0); g.build("thief_01",1);
  const res=[];
  for(const t of g.ctx.towers.towers){
    const model=t.visual.head.getChildren()[0];
    const meshes=model? model.getChildMeshes(false).filter(m=>m.getTotalVertices()>0):[];
    res.push({model:t.cfg.model, meshes: meshes.slice(0,3).map(m=>{
      const mat=m.material;
      return {
        cls: mat&&mat.getClassName(),
        diffuseTex: !!(mat&&mat.diffuseTexture),
        diffuse: mat&&mat.diffuseColor? [mat.diffuseColor.r.toFixed(2),mat.diffuseColor.g.toFixed(2),mat.diffuseColor.b.toFixed(2)]:null,
        emissive: mat&&mat.emissiveColor? [mat.emissiveColor.r.toFixed(2),mat.emissiveColor.g.toFixed(2),mat.emissiveColor.b.toFixed(2)]:null,
        vcolor: m.isVerticesDataPresent("color"),
        outline: m.renderOutline, outlineW: m.outlineWidth,
      };
    })});
  }
  return res;
});
console.log(JSON.stringify(out,null,2));
await browser.close();
