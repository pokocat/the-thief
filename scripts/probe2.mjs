import { chromium } from "playwright";
const b=await chromium.launch({args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--enable-webgl","--no-sandbox"]});
const p=await b.newPage({viewport:{width:800,height:500}});
p.on("pageerror",e=>console.log("EXC",e.message));
await p.goto("http://localhost:4173/",{waitUntil:"domcontentloaded"});
await p.waitForFunction(()=>!!window.heistTD,null,{timeout:90000});
await p.waitForTimeout(3000);
const out=await p.evaluate(()=>{
  const s=window.heistTD.ctx.scene;
  const pick=[];
  for(const m of s.meshes){
    if(m.getTotalVertices()===0) continue;
    const n=(m.name||"")+" / "+(m.parent&&m.parent.name||"");
    if(/tree|leaf|pine|foliage|Goblin|Character|Cube/i.test(n) || /tree|pine|goblin/i.test((m.parent&&m.parent.parent&&m.parent.parent.name)||"")){
      const mat=m.material;
      pick.push({n:n.slice(0,40), cls:mat&&mat.getClassName(),
        diff: mat&&mat.diffuseColor?[+mat.diffuseColor.r.toFixed(2),+mat.diffuseColor.g.toFixed(2),+mat.diffuseColor.b.toFixed(2)]:null,
        albedo: mat&&mat.albedoColor?[+mat.albedoColor.r.toFixed(2),+mat.albedoColor.g.toFixed(2),+mat.albedoColor.b.toFixed(2)]:null,
        tex: !!(mat&&(mat.diffuseTexture||mat.albedoTexture)),
        vcol: m.isVerticesDataPresent("color"), useV: m.useVertexColors});
    }
    if(pick.length>=12) break;
  }
  return pick;
});
console.log(JSON.stringify(out,null,1));
await b.close();
