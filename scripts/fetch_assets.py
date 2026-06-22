import re,urllib.request,urllib.parse,os,json,time
UA={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36'}
OUT='public/assets/models'; os.makedirs(OUT,exist_ok=True)
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read()
def gettext(u): return get(u).decode('utf-8','ignore')
def search_ids(term):
    html=gettext(f'https://poly.pizza/search/{urllib.parse.quote(term)}')
    out=[]
    for m in re.finditer(r'/m/([A-Za-z0-9_-]+)',html):
        if m.group(1) not in out: out.append(m.group(1))
    return out
def info(mid):
    html=gettext(f'https://poly.pizza/m/{mid}')
    g=re.search(r'https://static\.poly\.pizza/([a-f0-9-]{36})\.glb',html)
    quat='Quaternius' in html
    kenney='Kenney' in html
    lic='CC0' if 'CC0' in html else ('CC-BY' if ('CC-BY' in html or 'Attribution' in html) else '?')
    cred=re.search(r'/u/([A-Za-z0-9_ -]+)"',html)
    return {'id':mid,'uuid':(g.group(1) if g else None),'quat':quat,'kenney':kenney,'lic':lic,
            'creator':(cred.group(1) if cred else '?')}
# slot -> search synonyms (prefer Quaternius CC0 for a coherent flat low-poly set)
SLOTS={
 'enemy_goblin':['goblin','imp'],
 'enemy_skeleton':['skeleton enemy','skeleton'],
 'enemy_slime':['slime','blob monster'],
 'enemy_orc':['orc','ogre'],
 'enemy_bat':['bat','flying monster'],
 'enemy_ghost':['ghost','wraith'],
 'enemy_demon':['demon','devil'],
 'enemy_dragon':['dragon'],
 'tower_knight':['knight','paladin'],
 'tower_wizard':['wizard','mage'],
 'tower_archer':['archer','elf archer'],
 'tower_barbarian':['barbarian','warrior'],
 'tower_rogue':['rogue','ninja'],
 'prop_pine':['pine tree','pine'],
 'prop_tree':['tree'],
 'prop_rock':['rock'],
 'prop_crystal':['crystal'],
 'prop_barrel':['barrel'],
 'prop_chest':['treasure chest','chest'],
 'prop_mushroom':['mushroom'],
 'prop_fence':['fence'],
 'prop_torch':['torch','lantern'],
}
manifest=[]
for slot,terms in SLOTS.items():
    picked=None
    for term in terms:
        try: ids=search_ids(term)
        except Exception as e: print('search err',term,e); continue
        # pass1 Quaternius CC0
        for mid in ids[:8]:
            try: d=info(mid)
            except: continue
            if d['uuid'] and d['quat'] and d['lic']=='CC0': picked=(d,term); break
        if picked: break
    if not picked:
        # pass2: any CC0
        for term in terms:
            for mid in search_ids(term)[:8]:
                try: d=info(mid)
                except: continue
                if d['uuid'] and d['lic']=='CC0': picked=(d,term); break
            if picked: break
    if not picked:
        print('  MISS',slot); continue
    d,term=picked
    url=f"https://static.poly.pizza/{d['uuid']}.glb"
    dest=f"{OUT}/{slot}.glb"
    try:
        data=get(url); open(dest,'wb').write(data)
        kb=len(data)//1024
        creator='Quaternius' if d['quat'] else ('Kenney' if d['kenney'] else d['creator'])
        manifest.append({'slot':slot,'term':term,'creator':creator,'license':d['lic'],'source':f"https://poly.pizza/m/{d['id']}",'kb':kb})
        print(f"  OK {slot:16} {creator:12} {d['lic']:6} {kb}KB")
    except Exception as e: print('  dl err',slot,e)
    time.sleep(0.3)
json.dump(manifest,open(f'{OUT}/manifest.json','w'),indent=2,ensure_ascii=False)
print('TOTAL',len(manifest))
