import { bus } from "../core/Events";
import { Balance, buildableTowers, Tech, Items } from "../config";
import { upgradeTech, techCost } from "../systems/TechSystem";
import { buyAndEquip } from "../systems/ItemSystem";
import type { GameContext } from "../core/Context";
import type { WaveSystem } from "../systems/WaveSystem";
import type { CameraController } from "../core/CameraController";
import type { BuildPadRef } from "../map/SceneBuilder";
import type { Tower } from "../entities/Tower";
import type { TowerConfig } from "../config/types";

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

export class UI {
  private root: HTMLElement;
  private goldEl!: HTMLElement;
  private waveEl!: HTMLElement;
  private leakEl!: HTMLElement;
  private nextBtn!: HTMLButtonElement;
  private bannerEl!: HTMLElement;
  private bannerTimer = 0;

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
    this.buildBanner();
    this.buildBuildMenu();
    this.buildTowerPanel();
    this.buildTechPanel();
    this.buildSummary();
    this.wireEvents();
    this.refreshHud();
  }

  // ---- top bar -------------------------------------------------------------
  private buildTopBar(): void {
    const bar = el("div", "topbar");
    const gold = el("div", "stat gold");
    gold.appendChild(el("span", "stat-ico", "💰"));
    this.goldEl = el("span", "stat-val", "0");
    gold.appendChild(this.goldEl);

    const wave = el("div", "stat");
    wave.appendChild(el("span", "stat-ico", "🌊"));
    this.waveEl = el("span", "stat-val", "0/30");
    wave.appendChild(this.waveEl);

    const leak = el("div", "stat");
    leak.appendChild(el("span", "stat-ico", "💔"));
    this.leakEl = el("span", "stat-val", `0/${Balance.leakLimit}`);
    leak.appendChild(this.leakEl);

    const spacer = el("div", "spacer");

    const techBtn = el("button", "btn btn-secondary", "📜 科技");
    techBtn.onclick = () => this.toggleTech();
    const camBtn = el("button", "btn btn-secondary", "🎯 视角");
    camBtn.onclick = () => this.camera.reset();
    this.nextBtn = el("button", "btn btn-primary", "下一波");
    this.nextBtn.onclick = () => this.waves.requestStart();

    bar.append(gold, wave, leak, spacer, techBtn, camBtn, this.nextBtn);
    this.root.appendChild(bar);
  }

  private buildBanner(): void {
    this.bannerEl = el("div", "banner");
    this.bannerEl.style.display = "none";
    this.root.appendChild(this.bannerEl);
  }

  private showBanner(text: string, secs = 3): void {
    this.bannerEl.textContent = text;
    this.bannerEl.style.display = "block";
    this.bannerEl.classList.remove("show");
    void this.bannerEl.offsetWidth; // restart animation
    this.bannerEl.classList.add("show");
    this.bannerTimer = secs;
  }

  // ---- build menu ----------------------------------------------------------
  private buildBuildMenu(): void {
    this.buildMenu = el("div", "panel build-menu");
    this.buildMenu.style.display = "none";
    this.root.appendChild(this.buildMenu);
  }

  private openBuildMenu(pad: BuildPadRef): void {
    this.clearSelection();
    this.buildMenu.innerHTML = "";
    this.buildMenu.appendChild(el("div", "panel-title", "建造塔"));
    const grid = el("div", "build-grid");
    for (const cfg of buildableTowers) {
      const card = el("button", "build-card");
      card.style.borderColor = cfg.color;
      card.append(
        el("div", "build-name", cfg.name),
        el("div", "build-cost", `💰 ${cfg.cost}`),
        el("div", "build-desc", cfg.desc)
      );
      card.disabled = !this.ctx.state.canAfford(cfg.cost);
      card.onclick = () => this.tryBuild(cfg, pad);
      grid.appendChild(card);
    }
    this.buildMenu.appendChild(grid);
    const close = el("button", "btn btn-secondary close-btn", "关闭");
    close.onclick = () => this.clearSelection();
    this.buildMenu.appendChild(close);
    this.buildMenu.style.display = "block";
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

  // ---- tower panel ---------------------------------------------------------
  private buildTowerPanel(): void {
    this.towerPanel = el("div", "panel tower-panel");
    this.towerPanel.style.display = "none";
    this.root.appendChild(this.towerPanel);
  }

  private openTowerPanel(tower: Tower): void {
    this.clearSelection();
    this.selectedTower = tower;
    tower.setSelected(true);
    this.renderTowerPanel();
    this.towerPanel.style.display = "block";
  }

  private renderTowerPanel(): void {
    const t = this.selectedTower;
    if (!t) return;
    const ctx = this.ctx;
    this.towerPanel.innerHTML = "";
    this.towerPanel.appendChild(el("div", "panel-title", `${t.cfg.name}  ·  T${t.cfg.tier}`));

    const stats = el("div", "stat-list");
    const interval = t.effectiveAttackInterval(ctx);
    stats.append(
      this.statRow("伤害", t.cfg.damage.toString() + (t.cfg.damageType === "magic" ? " (魔法)" : " (物理)")),
      this.statRow("攻速", `${(1 / interval).toFixed(2)} /秒`),
      this.statRow("范围", t.cfg.range.toFixed(1)),
      this.statRow("索敌", t.targetMode)
    );
    if ((t.cfg.stealMultiplier ?? 0) > 0) {
      stats.append(this.statRow("偷钱倍率", `x${t.effectiveStealMultiplier(ctx).toFixed(2)} / 每${t.cfg.stealEveryHits}击`));
    }
    stats.append(this.statRow("特性", t.cfg.desc));
    if ((t.cfg.equipSlots ?? 0) > 0) {
      const eq = t.items.map((i) => `${i.icon}${i.name}`).join("、") || "（空）";
      stats.append(this.statRow(`装备 ${t.items.length}/${t.cfg.equipSlots}`, eq));
    }
    this.towerPanel.appendChild(stats);

    const btnRow = el("div", "btn-row");
    const next = ctx.towers.canUpgrade(t);
    if (next) {
      const up = el("button", "btn btn-primary", `升级 → ${next.name} (💰${next.cost})`);
      up.disabled = !ctx.state.canAfford(next.cost);
      up.onclick = () => {
        if (ctx.towers.upgrade(t, ctx)) this.renderTowerPanel();
        else this.showBanner("金币不足！", 1.5);
      };
      btnRow.appendChild(up);
    }
    const tgt = el("button", "btn btn-secondary", "切换索敌");
    tgt.onclick = () => {
      t.cycleTargetMode();
      this.renderTowerPanel();
    };
    btnRow.appendChild(tgt);

    const sell = el("button", "btn btn-danger", `出售 (+💰${Math.floor(t.investedGold * Balance.sellRefundRatio)})`);
    sell.onclick = () => {
      ctx.towers.sell(t, ctx.pads, ctx);
      this.clearSelection();
    };
    btnRow.appendChild(sell);
    this.towerPanel.appendChild(btnRow);

    // hero item shop
    if (t.cfg.category === "hero") {
      this.towerPanel.appendChild(el("div", "panel-subtitle", "装备商店（自动装备）"));
      const shop = el("div", "item-grid");
      for (const item of Object.values(Items)) {
        const b = el("button", "item-card");
        b.append(el("div", "item-ico", item.icon), el("div", "item-name", item.name), el("div", "item-cost", `💰${item.cost}`));
        b.title = item.desc;
        b.disabled = t.items.length >= (t.cfg.equipSlots ?? 0) || !ctx.state.canAfford(item.cost);
        b.onclick = () => {
          const r = buyAndEquip(item.id, t, ctx);
          if (!r.ok) this.showBanner(r.reason ?? "无法装备", 1.5);
          else this.renderTowerPanel();
        };
        shop.appendChild(b);
      }
      this.towerPanel.appendChild(shop);
    }

    const close = el("button", "btn btn-secondary close-btn", "关闭");
    close.onclick = () => this.clearSelection();
    this.towerPanel.appendChild(close);
  }

  private statRow(label: string, value: string): HTMLElement {
    const row = el("div", "stat-row");
    row.append(el("span", "stat-label", label), el("span", "stat-value", value));
    return row;
  }

  // ---- tech panel ----------------------------------------------------------
  private buildTechPanel(): void {
    this.techPanel = el("div", "panel tech-panel parchment");
    this.techPanel.style.display = "none";
    this.root.appendChild(this.techPanel);
  }

  private toggleTech(): void {
    if (this.techPanel.style.display === "block") {
      this.techPanel.style.display = "none";
      return;
    }
    this.renderTechPanel();
    this.techPanel.style.display = "block";
  }

  private renderTechPanel(): void {
    const ctx = this.ctx;
    this.techPanel.innerHTML = "";
    this.techPanel.appendChild(el("div", "panel-title", "📜 科技研究"));
    for (const cfg of Object.values(Tech)) {
      const level = ctx.state.techLevels[cfg.id] ?? 0;
      const row = el("div", "tech-row");
      const info = el("div", "tech-info");
      info.append(
        el("div", "tech-name", `${cfg.name}  Lv.${level}/${cfg.maxLevel}`),
        el("div", "tech-desc", cfg.desc)
      );
      row.appendChild(info);
      const cost = techCost(cfg.id, ctx.state);
      const btn = el("button", "btn btn-primary", cost === null ? "已满级" : `升级 💰${cost}`);
      btn.disabled = cost === null || !ctx.state.canAfford(cost);
      btn.onclick = () => {
        if (upgradeTech(cfg.id, ctx.state)) this.renderTechPanel();
        else this.showBanner("金币不足！", 1.5);
      };
      row.appendChild(btn);
      this.techPanel.appendChild(row);
    }
    const close = el("button", "btn btn-secondary close-btn", "关闭");
    close.onclick = () => (this.techPanel.style.display = "none");
    this.techPanel.appendChild(close);
  }

  // ---- wave summary (scroll) ----------------------------------------------
  private buildSummary(): void {
    this.summary = el("div", "summary scroll");
    this.summary.style.display = "none";
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
    this.buildMenu.style.display = "none";
    this.towerPanel.style.display = "none";
  }

  // ---- events + tick -------------------------------------------------------
  private wireEvents(): void {
    bus.on("goldChanged", () => this.refreshHud());
    bus.on("leaksChanged", () => this.refreshHud());
    bus.on("techChanged", () => {});
    bus.on("waveStart", (p) => {
      this.refreshHud();
      this.summary.style.display = "none";
      this.showBanner(`第 ${p.waveId} 波 — ${p.hint}`, 3.5);
    });
    bus.on("waveEnd", (p) => this.showSummary(p));
    bus.on("gameOver", (p) => this.showGameOver(p.won, p.wavesCleared, p.leaks));
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
    this.summary.innerHTML = "";
    this.summary.appendChild(el("div", "summary-title", `第 ${p.waveId} 波 结算`));
    const list = el("div", "summary-list");
    list.append(
      this.statRow("击杀收入", `💰 ${p.killIncome}`),
      this.statRow("偷取收入", `💰 ${p.stealIncome}`),
      this.statRow("波次奖励", `💰 ${p.bonus}`),
      this.statRow("漏怪数", `${p.leaks} / ${Balance.leakLimit}`),
      this.statRow("当前金币", `💰 ${p.gold}`)
    );
    this.summary.appendChild(list);
    this.summary.appendChild(el("div", "summary-hint", "📣 " + p.nextHint));
    if (!p.isLast) {
      const btn = el("button", "btn btn-primary", "立即开始下一波");
      btn.onclick = () => {
        this.summary.style.display = "none";
        this.waves.requestStart();
      };
      this.summary.appendChild(btn);
    }
    this.summary.style.display = "block";
  }

  private showGameOver(won: boolean, wavesCleared: number, leaks: number): void {
    this.summary.innerHTML = "";
    this.summary.className = "summary scroll " + (won ? "win" : "lose");
    this.summary.appendChild(el("div", "summary-title", won ? "🏆 胜利！" : "💀 防线失守"));
    this.summary.appendChild(
      el("div", "summary-hint", won ? `守住全部 ${Balance.totalWaves} 波，漏怪 ${leaks}/${Balance.leakLimit}！` : `坚持到第 ${wavesCleared} 波，漏怪已达 ${leaks}。`)
    );
    const btn = el("button", "btn btn-primary", "再玩一局");
    btn.onclick = () => location.reload();
    this.summary.appendChild(btn);
    this.summary.style.display = "block";
  }

  private refreshHud(): void {
    this.goldEl.textContent = Math.floor(this.ctx.state.gold).toString();
    this.waveEl.textContent = `${this.waves.currentWave}/${this.waves.totalWaves}`;
    this.leakEl.textContent = `${this.ctx.state.leaks}/${Balance.leakLimit}`;
    if (this.ctx.state.leaks >= Balance.leakLimit * 0.75) this.leakEl.classList.add("danger");
  }

  tick(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.style.display = "none";
    }
    // next-wave button shows auto-start countdown
    const cd = this.waves.autoStartIn;
    if (this.waves.canStartNow) {
      this.nextBtn.disabled = false;
      this.nextBtn.textContent = cd >= 0 ? `下一波 (${Math.ceil(cd)}s)` : "下一波";
    } else {
      this.nextBtn.disabled = true;
      this.nextBtn.textContent = this.ctx.state.status === "won" ? "已通关" : "进行中…";
    }
    // live-refresh open tower panel (afford states, stats)
    if (this.selectedTower && this.towerPanel.style.display === "block") {
      // light refresh of button disabled states only every frame is fine
    }
  }
}
