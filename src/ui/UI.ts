import { bus } from "../core/Events";
import { Balance, buildableTowers, Tech, Items } from "../config";
import { upgradeTech, techCost } from "../systems/TechSystem";
import { buyAndEquip } from "../systems/ItemSystem";
import type { GameContext } from "../core/Context";
import type { WaveSystem } from "../systems/WaveSystem";
import type { CameraController } from "../core/CameraController";
import type { BuildPadRef } from "../map/SceneBuilder";
import type { Tower } from "../entities/Tower";
import type { TowerConfig, TowerCategory } from "../config/types";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---- inline SVG icon system -------------------------------------------------
// 24x24 viewBox, currentColor. Rendered into a `.ico` span so `color` drives it.
const ICONS: Record<string, string> = {
  coin:
    '<circle cx="12" cy="12" r="9" fill="currentColor"/>' +
    '<path d="M12 7v10M9.6 9.3c0-1 1.1-1.6 2.4-1.6s2.4.6 2.4 1.6M14.4 14.6c0 1-1.1 1.7-2.4 1.7s-2.4-.6-2.4-1.6" stroke="#2b1d11" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  wave:
    '<path d="M3 9.5c1.6 0 1.6 2 3.2 2s1.6-2 3.2-2 1.6 2 3.2 2 1.6-2 3.2-2 1.6 2 3.2 2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M3 14.5c1.6 0 1.6 2 3.2 2s1.6-2 3.2-2 1.6 2 3.2 2 1.6-2 3.2-2 1.6 2 3.2 2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  heartCrack:
    '<path d="M12 20.5S4 15.6 4 10.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 8 2.2c0 5.4-8 10.3-8 10.3z" fill="currentColor"/>' +
    '<path d="M12 5.5l-1.6 4.3 2.4 1.8-1.8 4.4" stroke="#2b1d11" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  scroll:
    '<path d="M7 4h10a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<path d="M8.5 9h7M8.5 12h7M8.5 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  target:
    '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<circle cx="12" cy="12" r="2.4" fill="currentColor"/>' +
    '<path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/>',
  close:
    '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  upgrade:
    '<path d="M12 4l7 7h-4v9H9v-9H5l7-7z" fill="currentColor"/>',
  sell:
    '<path d="M4 12.5V5a1 1 0 0 1 1-1h7.5a2 2 0 0 1 1.4.6l6 6a2 2 0 0 1 0 2.8l-6.5 6.5a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1-.6-1.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<circle cx="8" cy="8" r="1.5" fill="currentColor"/>',
  lock:
    '<rect x="5" y="10.5" width="14" height="9.5" rx="2" fill="currentColor"/>' +
    '<path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
};

const CATEGORY_EMOJI: Record<TowerCategory, string> = {
  thief: "🎭",
  mage: "🔮",
  frost: "❄️",
  archer: "🏹",
  hero: "🦸",
};

function svgIcon(name: keyof typeof ICONS | string): HTMLElement {
  const s = el("span", "ico");
  s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
  return s;
}

export class UI {
  private root: HTMLElement;
  private goldCapsule!: HTMLElement;
  private goldEl!: HTMLElement;
  private waveEl!: HTMLElement;
  private leakCapsule!: HTMLElement;
  private leakEl!: HTMLElement;
  private nextBtn!: HTMLButtonElement;
  private nextLabel!: HTMLElement;
  private nextCd!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer = 0;
  private lastGold = -1;

  private buildMenu!: HTMLElement;
  private towerPanel!: HTMLElement;
  private techPanel!: HTMLElement;
  private summary!: HTMLElement;

  private selectedTower: Tower | null = null;

  constructor(
    private ctx: GameContext,
    private waves: WaveSystem,
    private camera: CameraController
  ) {
    this.root = document.getElementById("ui-root")!;
    this.buildTopBar();
    this.buildToast();
    this.buildBuildMenu();
    this.buildTowerPanel();
    this.buildTechPanel();
    this.buildSummary();
    this.wireEvents();
    this.refreshHud();
  }

  // ---- top HUD -------------------------------------------------------------
  private buildTopBar(): void {
    const bar = el("div", "hud-top");

    const left = el("div", "hud-group");
    this.goldCapsule = el("div", "capsule is-gold");
    this.goldCapsule.append(svgIcon("coin"), (this.goldEl = el("span", "capsule-val", "0")));

    const waveCap = el("div", "capsule");
    waveCap.append(svgIcon("wave"), (this.waveEl = el("span", "capsule-val", "0/30")));

    this.leakCapsule = el("div", "capsule");
    this.leakCapsule.append(
      svgIcon("heartCrack"),
      (this.leakEl = el("span", "capsule-val", `0/${Balance.leakLimit}`))
    );
    left.append(this.goldCapsule, waveCap, this.leakCapsule);

    const right = el("div", "hud-group");
    const techBtn = el("button", "btn btn-ghost");
    techBtn.append(svgIcon("scroll"), document.createTextNode("科技"));
    techBtn.addEventListener("click", () => this.toggleTech());

    const camBtn = el("button", "btn btn-ghost");
    camBtn.append(svgIcon("target"), document.createTextNode("视角"));
    camBtn.addEventListener("click", () => this.camera.reset());

    this.nextBtn = el("button", "btn btn-primary btn-next");
    const nextTop = el("span");
    nextTop.append(svgIcon("play"), (this.nextLabel = el("span", undefined, "下一波")));
    this.nextCd = el("span", "btn-cd");
    this.nextBtn.append(nextTop, this.nextCd);
    this.nextBtn.addEventListener("click", () => this.waves.requestStart());

    right.append(techBtn, camBtn, this.nextBtn);
    bar.append(left, right);
    this.root.appendChild(bar);
  }

  // ---- toast ---------------------------------------------------------------
  private buildToast(): void {
    this.toastEl = el("div", "toast hidden");
    this.root.appendChild(this.toastEl);
  }

  private showBanner(text: string, secs = 3): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove("hidden", "show");
    void this.toastEl.offsetWidth; // restart animation
    this.toastEl.classList.add("show");
    this.toastTimer = secs;
  }

  // ---- build menu ----------------------------------------------------------
  private buildBuildMenu(): void {
    this.buildMenu = el("div", "panel build-menu hidden");
    this.root.appendChild(this.buildMenu);
  }

  private openBuildMenu(pad: BuildPadRef): void {
    this.clearSelection();
    this.buildMenu.innerHTML = "";
    this.buildMenu.appendChild(el("div", "panel-title", "建造塔"));
    const grid = el("div", "build-grid");
    for (const cfg of buildableTowers) {
      const card = el("button", "build-card");
      const band = el("div", "band");
      band.style.background = cfg.color;
      card.style.setProperty("--card-color", cfg.color);
      const afford = this.ctx.state.canAfford(cfg.cost);
      const cost = el("div", "build-cost" + (afford ? "" : " cant"));
      cost.append(svgIcon("coin"), el("span", undefined, cfg.cost.toString()));
      card.append(
        band,
        el("div", "build-emoji", CATEGORY_EMOJI[cfg.category] ?? "🏰"),
        el("div", "build-name", cfg.name),
        cost,
        el("div", "build-desc", cfg.desc)
      );
      card.disabled = !afford;
      card.addEventListener("click", () => this.tryBuild(cfg, pad));
      grid.appendChild(card);
    }
    this.buildMenu.appendChild(grid);
    this.buildMenu.appendChild(this.makeClose(() => this.clearSelection()));
    this.buildMenu.classList.remove("hidden");
  }

  private tryBuild(cfg: TowerConfig, pad: BuildPadRef): void {
    if (pad.occupied) return;
    if (!this.ctx.state.spend(cfg.cost)) {
      this.showBanner("金币不足！", 1.5);
      return;
    }
    this.ctx.towers.build(cfg, pad);
    this.clearSelection();
  }

  private makeClose(onClick: () => void): HTMLButtonElement {
    const close = el("button", "btn btn-ghost close-btn");
    close.appendChild(svgIcon("close"));
    close.setAttribute("aria-label", "关闭");
    close.addEventListener("click", onClick);
    return close;
  }

  // ---- tower panel ---------------------------------------------------------
  private buildTowerPanel(): void {
    this.towerPanel = el("div", "panel tower-panel hidden");
    this.root.appendChild(this.towerPanel);
  }

  private openTowerPanel(tower: Tower): void {
    this.clearSelection();
    this.selectedTower = tower;
    tower.setSelected(true);
    this.renderTowerPanel();
    this.towerPanel.classList.remove("hidden");
  }

  private renderTowerPanel(): void {
    const t = this.selectedTower;
    if (!t) return;
    const ctx = this.ctx;
    this.towerPanel.innerHTML = "";

    const title = el("div", "panel-title tower-head");
    title.append(el("span", undefined, t.cfg.name), el("span", "tier-badge", `T${t.cfg.tier}`));
    this.towerPanel.appendChild(title);

    const grid = el("div", "stat-grid");
    const interval = t.effectiveAttackInterval(ctx);
    grid.append(
      this.statCell("伤害", t.cfg.damage.toString() + (t.cfg.damageType === "magic" ? " · 魔法" : " · 物理")),
      this.statCell("攻速", `${(1 / interval).toFixed(2)} /秒`),
      this.statCell("范围", t.cfg.range.toFixed(1)),
      this.statCell("索敌", t.targetMode)
    );
    if ((t.cfg.stealMultiplier ?? 0) > 0) {
      grid.append(
        this.statCell("偷钱倍率", `x${t.effectiveStealMultiplier(ctx).toFixed(2)} / ${t.cfg.stealEveryHits}击`, true)
      );
    }
    grid.append(this.statCell("特性", t.cfg.desc, true));
    this.towerPanel.appendChild(grid);

    const btnRow = el("div", "btn-row");
    const next = ctx.towers.canUpgrade(t);
    if (next) {
      const up = el("button", "btn btn-primary");
      up.disabled = !ctx.state.canAfford(next.cost);
      this.setBtnLabel(up, `${next.name} · ${next.cost}`, "upgrade", up.disabled);
      up.addEventListener("click", () => {
        if (ctx.towers.upgrade(t, ctx)) this.renderTowerPanel();
        else this.showBanner("金币不足！", 1.5);
      });
      btnRow.appendChild(up);
    }
    const tgt = el("button", "btn btn-ghost");
    tgt.append(svgIcon("target"), document.createTextNode("切换索敌"));
    tgt.addEventListener("click", () => {
      t.cycleTargetMode();
      this.renderTowerPanel();
    });
    btnRow.appendChild(tgt);

    const refund = Math.floor(t.investedGold * Balance.sellRefundRatio);
    const sell = el("button", "btn btn-danger");
    sell.append(svgIcon("sell"), document.createTextNode(`出售 +${refund}`));
    sell.addEventListener("click", () => {
      ctx.towers.sell(t, ctx.pads, ctx);
      this.clearSelection();
    });
    btnRow.appendChild(sell);
    this.towerPanel.appendChild(btnRow);

    // hero equipment shop
    if (t.cfg.category === "hero") {
      this.towerPanel.appendChild(
        el("div", "panel-subtitle", `英雄装备 ${t.items.length}/${t.cfg.equipSlots ?? 0}（自动装备）`)
      );
      const shop = el("div", "item-grid");
      for (const item of Object.values(Items)) {
        const b = el("button", "item-card");
        const cost = el("div", "item-cost");
        cost.append(svgIcon("coin"), el("span", undefined, item.cost.toString()));
        b.append(el("div", "item-ico", item.icon), el("div", "item-name", item.name), cost);
        b.title = item.desc;
        b.disabled = t.items.length >= (t.cfg.equipSlots ?? 0) || !ctx.state.canAfford(item.cost);
        b.addEventListener("click", () => {
          const r = buyAndEquip(item.id, t, ctx);
          if (!r.ok) this.showBanner(r.reason ?? "无法装备", 1.5);
          else this.renderTowerPanel();
        });
        shop.appendChild(b);
      }
      this.towerPanel.appendChild(shop);
    }

    this.towerPanel.appendChild(this.makeClose(() => this.clearSelection()));
  }

  // primary button label with optional leading icon; disabled prepends a lock
  private setBtnLabel(btn: HTMLElement, text: string, icon: string, disabled: boolean): void {
    btn.textContent = "";
    btn.appendChild(svgIcon(disabled ? "lock" : icon));
    btn.appendChild(document.createTextNode(text));
  }

  private statCell(key: string, value: string, wide = false): HTMLElement {
    const cell = el("div", "stat-cell" + (wide ? " wide" : ""));
    cell.append(el("span", "stat-key", key), el("span", "stat-val", value));
    return cell;
  }

  // ---- tech panel ----------------------------------------------------------
  private buildTechPanel(): void {
    this.techPanel = el("div", "panel tech-panel parchment hidden");
    this.root.appendChild(this.techPanel);
  }

  private toggleTech(): void {
    if (!this.techPanel.classList.contains("hidden")) {
      this.techPanel.classList.add("hidden");
      return;
    }
    this.renderTechPanel();
    this.techPanel.classList.remove("hidden");
  }

  private renderTechPanel(): void {
    const ctx = this.ctx;
    this.techPanel.innerHTML = "";
    const title = el("div", "panel-title");
    title.append(svgIcon("scroll"), document.createTextNode("科技研究"));
    this.techPanel.appendChild(title);

    for (const cfg of Object.values(Tech)) {
      const level = ctx.state.techLevels[cfg.id] ?? 0;
      const row = el("div", "tech-row");
      const info = el("div", "tech-info");
      const name = el("div", "tech-name", cfg.name);
      const pips = el("div", "pips");
      for (let i = 0; i < cfg.maxLevel; i++) {
        pips.appendChild(el("span", "pip" + (i < level ? " on" : "")));
      }
      info.append(name, pips, el("div", "tech-desc", cfg.desc));
      row.appendChild(info);

      const cost = techCost(cfg.id, ctx.state);
      const btn = el("button", "btn btn-primary");
      const disabled = cost === null || !ctx.state.canAfford(cost);
      btn.disabled = disabled;
      if (cost === null) {
        btn.textContent = "已满级";
      } else {
        this.setBtnLabel(btn, `升级 · ${cost}`, "upgrade", disabled);
      }
      btn.addEventListener("click", () => {
        if (upgradeTech(cfg.id, ctx.state)) this.renderTechPanel();
        else this.showBanner("金币不足！", 1.5);
      });
      row.appendChild(btn);
      this.techPanel.appendChild(row);
    }
    this.techPanel.appendChild(this.makeClose(() => this.techPanel.classList.add("hidden")));
  }

  // ---- wave summary --------------------------------------------------------
  private buildSummary(): void {
    this.summary = el("div", "summary hidden");
    this.root.appendChild(this.summary);
  }

  // ---- selection -----------------------------------------------------------
  selectAt(pickedKind: string, id: number): void {
    if (pickedKind === "pad") {
      const pad = this.ctx.pads[id];
      if (pad.occupied) {
        const t = this.ctx.towers.towers.find((x) => x.padIndex === id);
        if (t) this.openTowerPanel(t);
      } else {
        this.openBuildMenu(pad);
      }
    } else if (pickedKind === "tower") {
      const t = this.ctx.towers.byUid(id);
      if (t) this.openTowerPanel(t);
    }
  }

  clearSelection(): void {
    if (this.selectedTower) this.selectedTower.setSelected(false);
    this.selectedTower = null;
    this.buildMenu.classList.add("hidden");
    this.towerPanel.classList.add("hidden");
  }

  // ---- events + tick -------------------------------------------------------
  private wireEvents(): void {
    bus.on("goldChanged", () => this.refreshHud());
    bus.on("leaksChanged", () => this.refreshHud());
    bus.on("techChanged", () => {});
    bus.on("waveStart", (p) => {
      this.refreshHud();
      this.summary.classList.add("hidden");
      this.showBanner(`第 ${p.waveId} 波 — ${p.hint}`, 3.5);
    });
    bus.on("waveEnd", (p) => this.showSummary(p));
    bus.on("gameOver", (p) => this.showGameOver(p.won, p.wavesCleared, p.leaks));
    bus.on("bossSpawn", (p) => this.showBanner(`⚔️ BOSS 来袭 — ${p.name}！`, 2.5));
  }

  private summaryRow(key: string, value: string, coin = false): HTMLElement {
    const row = el("div", "summary-row");
    const v = el("span", "v");
    if (coin) v.appendChild(svgIcon("coin"));
    v.appendChild(el("span", undefined, value));
    row.append(el("span", "k", key), v);
    return row;
  }

  private showSummary(p: {
    waveId: number;
    killIncome: number;
    stealIncome: number;
    bonus: number;
    leaks: number;
    gold: number;
    nextHint: string;
    isLast: boolean;
  }): void {
    this.summary.className = "summary";
    this.summary.innerHTML = "";
    this.summary.appendChild(el("div", "summary-title", `第 ${p.waveId} 波 结算`));
    const list = el("div", "summary-list");
    list.append(
      this.summaryRow("击杀收入", p.killIncome.toString(), true),
      this.summaryRow("偷取收入", p.stealIncome.toString(), true),
      this.summaryRow("波次奖励", p.bonus.toString(), true),
      this.summaryRow("漏怪数", `${p.leaks} / ${Balance.leakLimit}`),
      this.summaryRow("当前金币", p.gold.toString(), true)
    );
    this.summary.appendChild(list);
    this.summary.appendChild(el("div", "summary-hint", "📣 " + p.nextHint));
    if (!p.isLast) {
      const btn = el("button", "btn btn-primary");
      btn.append(svgIcon("play"), document.createTextNode("立即开始下一波"));
      btn.addEventListener("click", () => {
        this.summary.classList.add("hidden");
        this.waves.requestStart();
      });
      this.summary.appendChild(btn);
    }
    this.summary.classList.remove("hidden");
  }

  private showGameOver(won: boolean, wavesCleared: number, leaks: number): void {
    this.summary.innerHTML = "";
    this.summary.className = "summary " + (won ? "win" : "lose");
    this.summary.appendChild(el("div", "summary-title", won ? "🏆 胜利！" : "💀 防线失守"));
    this.summary.appendChild(
      el(
        "div",
        "summary-hint",
        won
          ? `守住全部 ${Balance.totalWaves} 波，漏怪 ${leaks}/${Balance.leakLimit}！`
          : `坚持到第 ${wavesCleared} 波，漏怪已达 ${leaks}。`
      )
    );
    const btn = el("button", "btn btn-primary", "再玩一局");
    btn.addEventListener("click", () => location.reload());
    this.summary.appendChild(btn);
    this.summary.classList.remove("hidden");
  }

  private refreshHud(): void {
    const gold = Math.floor(this.ctx.state.gold);
    this.goldEl.textContent = gold.toString();
    if (this.lastGold >= 0 && gold !== this.lastGold) {
      this.goldCapsule.classList.remove("bump");
      void this.goldCapsule.offsetWidth;
      this.goldCapsule.classList.add("bump");
    }
    this.lastGold = gold;
    this.waveEl.textContent = `${this.waves.currentWave}/${this.waves.totalWaves}`;
    this.leakEl.textContent = `${this.ctx.state.leaks}/${Balance.leakLimit}`;
    // bug fix: add/remove danger by threshold instead of add-only
    this.leakCapsule.classList.toggle("is-danger", this.ctx.state.leaks >= Balance.leakLimit * 0.75);
  }

  tick(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.add("hidden");
    }
    // next-wave button shows auto-start countdown as secondary text
    const cd = this.waves.autoStartIn;
    if (this.waves.canStartNow) {
      this.nextBtn.disabled = false;
      this.nextLabel.textContent = "下一波";
      this.nextCd.textContent = cd >= 0 ? `${Math.ceil(cd)}s` : "";
    } else {
      this.nextBtn.disabled = true;
      this.nextLabel.textContent = this.ctx.state.status === "won" ? "已通关" : "进行中…";
      this.nextCd.textContent = "";
    }
  }
}
