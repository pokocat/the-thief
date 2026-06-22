import { chromium } from "playwright";
const b=await chromium.launch({args:["--no-sandbox"]});
const p=await b.newPage();
const UA={}; 
async function get(u){ return (await p.evaluate(async(u)=>{const r=await fetch(u);return await r.text();},u)); }
const terms=["orc","ogre","golem","skeleton warrior","zombie","lich","necromancer","paladin knight","demon","imp","gargoyle","dragon","giant spider","troll","bandit","ninja","mimic chest","wizard","slime","minotaur","werewolf","ghost"];
await p.goto("https://poly.pizza/",{waitUntil:"domcontentloaded"});
for(const t of terms){
  try{
    const html=await get(`https://poly.pizza/search/${encodeURIComponent(t)}`);
    const ids=[...new Set([...html.matchAll(/\/m\/([A-Za-z0-9_-]+)/g)].map(m=>m[1]))].slice(0,5);
    let line=t.padEnd(16)+": ";
    for(const id of ids){
      const mh=await get(`https://poly.pizza/m/${id}`);
      const quat=/Quaternius/.test(mh), kay=/KayKit|Kay Lousberg/.test(mh), cc0=/CC0/.test(mh);
      const who=quat?"Q":kay?"K":(/CC0/.test(mh)?"cc0":"by");
      line+= who+(cc0?"+":"-")+" ";
    }
    console.log(line);
  }catch(e){console.log(t,"ERR",e.message);}
}
await b.close();
