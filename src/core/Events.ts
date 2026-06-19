// Minimal typed event bus for decoupling systems <-> UI.
export type EventMap = {
  goldChanged: { gold: number };
  waveStart: { waveId: number; hint: string };
  waveEnd: {
    waveId: number;
    killIncome: number;
    stealIncome: number;
    bonus: number;
    leaks: number;
    gold: number;
    nextHint: string;
    isLast: boolean;
  };
  leaksChanged: { leaks: number; limit: number };
  enemyKilled: { goldReward: number; worldX: number; worldZ: number; worldY: number };
  goldStolen: { amount: number; big: boolean; worldX: number; worldZ: number; worldY: number };
  towerSelected: { towerUid: number | null };
  buildPointSelected: { index: number | null };
  techChanged: Record<string, never>;
  gameOver: { won: boolean; wavesCleared: number; leaks: number };
  hudRefresh: Record<string, never>;
  bossSpawn: { name: string };
};

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<keyof EventMap, Handler<unknown>[]>();

  on<K extends keyof EventMap>(type: K, fn: Handler<EventMap[K]>): () => void {
    let list = this.handlers.get(type);
    if (!list) {
      list = [];
      this.handlers.set(type, list);
    }
    list.push(fn as Handler<unknown>);
    return () => this.off(type, fn);
  }

  off<K extends keyof EventMap>(type: K, fn: Handler<EventMap[K]>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const i = list.indexOf(fn as Handler<unknown>);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
    const list = this.handlers.get(type);
    if (!list) return;
    for (const fn of list.slice()) (fn as Handler<EventMap[K]>)(payload);
  }
}

export const bus = new EventBus();
