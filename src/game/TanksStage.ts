import {
  MANA_REGEN_PER_TURN,
  MAX_MANA_PER_ROUND,
  START_MANA,
  TANK_SKINS,
  WEAPONS,
  WeaponDef,
  WeaponId,
} from '../data/tanks';
import { SoundFX } from './SoundFX';

export type GameMode = 'ai' | 'pvp';

interface TankEntity {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  angleDeg: number; // 0..180 where 0 is right, 90 is up, 180 is left
  power: number; // 15..100
  fuel: number;
  skinId: number;
  label: string;
  isAi: boolean;
  recoil: number;
  muzzleFlash: number;
  wheelSpin: number;
  hitFlash: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  weaponId: WeaponId;
  owner: number;
  bouncesLeft: number;
  splitDone: boolean;
  digging: number;
  age: number;
  smokeAcc: number;
  trail: { x: number; y: number }[];
}

interface Explosion {
  x: number;
  y: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
  isMound?: boolean;
}

interface Shockwave {
  x: number;
  y: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface LaserBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  life: number;
  maxLife: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  kind?: 'spark' | 'smoke';
  grow?: number;
}

interface DebrisChunk {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  big?: boolean;
}

interface CloudPuff {
  x: number;
  y: number;
  scale: number;
  speed: number;
  alpha: number;
}

interface WindStreak {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

interface RockFleck {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  color: string;
}

export interface HudSnapshot {
  turn: number;
  turnLabel: string;
  isPlayerTurn: boolean;
  mode: GameMode;
  wind: number;
  activeHp: number;
  activeMana: number;
  maxMana: number;
  aliveCount: number;
  totalTanks: number;
  angle: number;
  power: number;
  fuel: number;
  weaponId: WeaponId;
  round: number;
  score: number;
  streak: number;
  busy: boolean;
}

export interface MatchEndInfo {
  winner: number;
  winnerLabel: string;
  score: number;
  streak: number;
  mode: GameMode;
  round: number;
}

const TANK_COUNT = 5;
const WORLD_W = 1040;
const WORLD_H = 520;
const GRAVITY = 270;
const WIND_ACCEL = 6.8;

export class TanksStage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sfx: SoundFX;
  private onHud: (hud: HudSnapshot) => void;
  private onMatchEnd: (info: MatchEndInfo) => void;

  private terrain = new Float32Array(WORLD_W);
  private scorch = new Float32Array(WORLD_W);
  private stars: { x: number; y: number; r: number; a: number; phase: number; speed: number }[] = [];
  private clouds: CloudPuff[] = [];
  private windStreaks: WindStreak[] = [];
  private rockFlecks: RockFleck[] = [];
  private tanks: TankEntity[] = [];
  private projectiles: Projectile[] = [];
  private explosions: Explosion[] = [];
  private shockwaves: Shockwave[] = [];
  private laserBeams: LaserBeam[] = [];
  private particles: Particle[] = [];
  private debris: DebrisChunk[] = [];
  private floats: FloatText[] = [];

  private mode: GameMode = 'ai';
  private turn = 0;
  private wind = 6.5;
  private selectedWeapon: WeaponId = 'standard';
  private round = 1;
  private score = 0;
  private streak = 0;
  private shake = 0;
  private matchOver = false;
  private aiTimer = 0;
  private draggingAim = false;
  private activePointerId: number | null = null;
  private elapsed = 0;

  private rafId: number | null = null;
  private lastTs = 0;
  private playerSkinId = 0;
  private cleanupListeners: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    sfx: SoundFX,
    onHud: (hud: HudSnapshot) => void,
    onMatchEnd: (info: MatchEndInfo) => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D context missing');
    this.ctx = context;
    this.sfx = sfx;
    this.onHud = onHud;
    this.onMatchEnd = onMatchEnd;

    for (let i = 0; i < 120; i++) {
      this.stars.push({
        x: Math.random() * WORLD_W,
        y: -650 + Math.random() * (WORLD_H * 0.68 + 650),
        r: 0.7 + Math.random() * 1.8,
        a: 0.35 + Math.random() * 0.65,
        phase: Math.random() * Math.PI * 2,
        speed: 1.4 + Math.random() * 2.6,
      });
    }

    for (let i = 0; i < 8; i++) {
      this.clouds.push({
        x: (i / 8) * (WORLD_W + 180) - 90,
        y: 36 + (i % 3) * 44 + Math.random() * 22,
        scale: 0.75 + Math.random() * 0.65,
        speed: 4 + Math.random() * 6,
        alpha: 0.1 + Math.random() * 0.1,
      });
    }

    for (let i = 0; i < 18; i++) {
      this.windStreaks.push({
        x: Math.random() * WORLD_W,
        y: 28 + Math.random() * 220,
        len: 28 + Math.random() * 44,
        speed: 0.75 + Math.random() * 0.55,
        alpha: 0.14 + Math.random() * 0.22,
      });
    }

    const fleckPalette = ['rgba(120,113,108,0.34)', 'rgba(68,64,60,0.42)', 'rgba(168,162,158,0.22)'];
    for (let i = 0; i < 160; i++) {
      this.rockFlecks.push({
        x: Math.random() * WORLD_W,
        y: 165 + Math.random() * (WORLD_H - 170),
        rx: 2 + Math.random() * 6,
        ry: 1.5 + Math.random() * 3.5,
        rot: Math.random() * Math.PI,
        color: fleckPalette[i % fleckPalette.length],
      });
    }

    this.setupRound();
    this.attachPointerAim();
  }

  private makeTank(
    x: number,
    y: number,
    angleDeg: number,
    skinId: number,
    label: string,
    isAi: boolean
  ): TankEntity {
    return {
      x,
      y,
      hp: 100,
      maxHp: 100,
      mana: START_MANA,
      maxMana: MAX_MANA_PER_ROUND,
      angleDeg,
      power: 68,
      fuel: 100,
      skinId,
      label,
      isAi,
      recoil: 0,
      muzzleFlash: 0,
      wheelSpin: 0,
      hitFlash: 0,
    };
  }

  /**
   * Always rolls a noticeable non-zero wind (|wind| between 3.5 and 16.0)
   * that shifts clearly from the previous turn so players must adjust every turn!
   */
  private rollNewWind(prevWind: number | null): number {
    for (let attempt = 0; attempt < 20; attempt++) {
      const sign = Math.random() < 0.5 ? -1 : 1;
      const mag = 3.5 + Math.random() * 12.5;
      const candidate = Math.round(sign * mag * 10) / 10;
      if (prevWind === null || Math.abs(candidate - prevWind) >= 4.0) {
        return candidate;
      }
    }
    return prevWind && prevWind > 0 ? -8.5 : 8.5;
  }

  public startNewCampaign(mode: GameMode, playerSkinId: number): void {
    this.mode = mode;
    this.playerSkinId = Math.max(0, Math.min(TANK_SKINS.length - 1, Math.floor(playerSkinId) || 0));
    this.round = 1;
    this.score = 0;
    this.streak = 0;
    this.setupRound();
    this.startLoop();
  }

  public nextRound(): void {
    this.round += 1;
    this.setupRound();
    if (this.rafId === null) this.startLoop();
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.draggingAim = false;
    this.activePointerId = null;
  }

  public destroy(): void {
    this.stop();
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
  }

  public setWeapon(id: WeaponId): void {
    const active = this.tanks[this.turn];
    const def = WEAPONS.find((w) => w.id === id);
    if (!def) return;
    if (active && def.manaCost > active.mana) {
      return;
    }
    this.selectedWeapon = id;
    this.emitHud();
  }

  private isHumanControlledTurn(): boolean {
    const active = this.tanks[this.turn];
    return Boolean(active && !active.isAi && active.hp > 0);
  }

  public adjustAngle(delta: number): void {
    if (this.isBusy() || !this.isHumanControlledTurn() || this.matchOver) return;
    if (!Number.isFinite(delta)) return;
    const t = this.tanks[this.turn];
    t.angleDeg = Math.max(5, Math.min(175, Math.round(t.angleDeg + delta)));
    this.emitHud();
  }

  public setAngle(deg: number): void {
    if (this.isBusy() || !this.isHumanControlledTurn() || this.matchOver) return;
    if (!Number.isFinite(deg)) return;
    const t = this.tanks[this.turn];
    t.angleDeg = Math.max(5, Math.min(175, Math.round(deg)));
    this.emitHud();
  }

  public adjustPower(delta: number): void {
    if (this.isBusy() || !this.isHumanControlledTurn() || this.matchOver) return;
    if (!Number.isFinite(delta)) return;
    const t = this.tanks[this.turn];
    t.power = Math.max(15, Math.min(100, Math.round(t.power + delta)));
    this.emitHud();
  }

  public setPower(pwr: number): void {
    if (this.isBusy() || !this.isHumanControlledTurn() || this.matchOver) return;
    if (!Number.isFinite(pwr)) return;
    const t = this.tanks[this.turn];
    t.power = Math.max(15, Math.min(100, Math.round(pwr)));
    this.emitHud();
  }

  public moveTank(dir: -1 | 1): void {
    if (this.isBusy() || !this.isHumanControlledTurn() || this.matchOver) return;
    const t = this.tanks[this.turn];
    if (t.fuel <= 0) return;
    const nextX = Math.max(32, Math.min(WORLD_W - 32, t.x + dir * 16));
    const currentGround = this.sampleTerrain(t.x);
    const nextGround = this.sampleTerrain(nextX);
    if (currentGround - nextGround > 26) return;
    t.wheelSpin += (nextX - t.x) * 0.18;
    t.x = nextX;
    t.y = nextGround;
    t.fuel = Math.max(0, t.fuel - 15);
    this.emitHud();
  }

  public fireCurrentWeapon(): void {
    if (this.isBusy() || this.matchOver) return;
    if (!this.isHumanControlledTurn()) return;
    const active = this.tanks[this.turn];
    const def = WEAPONS.find((w) => w.id === this.selectedWeapon) || WEAPONS[0];
    const weaponToFire: WeaponId = def.manaCost <= active.mana ? def.id : 'standard';
    this.selectedWeapon = weaponToFire;
    this.launchWeapon(this.turn, weaponToFire);
  }

  private setupRound(): void {
    this.generateTerrain();

    // Always spawn 5 distinct tanks evenly distributed across the terrain!
    this.tanks = [];
    const margin = 72;
    const usableW = WORLD_W - margin * 2;
    const slotW = usableW / (TANK_COUNT - 1);

    for (let i = 0; i < TANK_COUNT; i++) {
      const jitter = (Math.random() - 0.5) * 46;
      const x = Math.max(46, Math.min(WORLD_W - 46, margin + i * slotW + jitter));
      const defaultAngle = i < 2 ? 48 : i === 2 ? 78 : 132;
      const skinId = (this.playerSkinId + i) % TANK_SKINS.length;
      const isAi = this.mode === 'ai' && i > 0;
      const label =
        this.mode === 'ai'
          ? i === 0
            ? 'YOU'
            : `CPU ${i}`
          : `P${i + 1}`;
      this.tanks.push(this.makeTank(x, this.sampleTerrain(x), defaultAngle, skinId, label, isAi));
    }

    this.projectiles = [];
    this.explosions = [];
    this.shockwaves = [];
    this.laserBeams = [];
    this.particles = [];
    this.debris = [];
    this.floats = [];
    this.turn = 0;
    this.selectedWeapon = 'standard';
    this.matchOver = false;
    this.aiTimer = 0;
    this.shake = 0;
    this.draggingAim = false;
    this.activePointerId = null;
    this.wind = this.rollNewWind(null);
    this.emitHud();
  }

  private generateTerrain(): void {
    const base = 315 + Math.random() * 42;
    const amp1 = 52 + Math.random() * 44;
    const amp2 = 22 + Math.random() * 28;
    const ph1 = Math.random() * Math.PI * 2;
    const ph2 = Math.random() * Math.PI * 2;
    const midPeak = (Math.random() - 0.35) * 70;

    for (let x = 0; x < WORLD_W; x++) {
      const nx = x / WORLD_W;
      const hill = Math.sin(nx * Math.PI * 2.4 + ph1) * amp1 + Math.sin(nx * Math.PI * 5.6 + ph2) * amp2;
      const centerBump = Math.exp(-Math.pow((nx - 0.5) / 0.18, 2)) * midPeak;
      const y = Math.max(150, Math.min(WORLD_H - 36, base - hill - centerBump));
      this.terrain[x] = y;
      this.scorch[x] = 0;
    }
  }

  private sampleTerrain(x: number): number {
    if (!Number.isFinite(x)) return WORLD_H - 36;
    const ix = Math.max(0, Math.min(WORLD_W - 1, Math.round(x)));
    return this.terrain[ix];
  }

  private isBusy(): boolean {
    return this.projectiles.length > 0 || this.aiTimer > 0;
  }

  private launchWeapon(owner: number, weaponId: WeaponId): void {
    const t = this.tanks[owner];
    const def = WEAPONS.find((w) => w.id === weaponId) || WEAPONS[0];
    // Deduct weapon mana cost (Standard Shell costs 0!)
    if (def.manaCost > t.mana) {
      weaponId = 'standard';
    } else {
      t.mana = Math.max(0, t.mana - def.manaCost);
    }

    const rad = (t.angleDeg * Math.PI) / 180;
    const barrelLen = 25;
    const mx = t.x + Math.cos(rad) * barrelLen;
    const my = t.y - 13 - Math.sin(rad) * barrelLen;

    t.recoil = 1;
    t.muzzleFlash = 0.14;
    this.draggingAim = false;
    this.activePointerId = null;

    if (def.manaCost > 0) {
      this.floats.push({
        x: t.x,
        y: t.y - 52,
        vy: -38,
        text: `-${def.manaCost} 💎`,
        color: '#38bdf8',
        life: 0.9,
        maxLife: 0.9,
      });
    }

    // Muzzle blast smoke & sparks
    for (let i = 0; i < 8; i++) {
      const spread = rad + (Math.random() - 0.5) * 0.55;
      const spd = 35 + Math.random() * 90;
      this.pushParticle({
        x: mx,
        y: my,
        vx: Math.cos(spread) * spd,
        vy: -Math.sin(spread) * spd - 10,
        color: i < 4 ? '#fde047' : 'rgba(203,213,225,0.65)',
        size: i < 4 ? 2.4 : 4 + Math.random() * 3,
        life: 0.25 + Math.random() * 0.2,
        maxLife: 0.45,
        kind: i < 4 ? 'spark' : 'smoke',
        grow: i < 4 ? 0 : 14,
      });
    }

    if (weaponId === 'laser') {
      this.sfx.laser();
      this.fireLaserRay(mx, my, rad, owner);
      return;
    }

    const speed = weaponId === 'firerain' ? t.power * 6.5 : t.power * 7.0;
    const count = weaponId === 'firerain' ? 5 : 1;
    this.sfx.fire(weaponId === 'nuke' || weaponId === 'quake');

    for (let i = 0; i < count; i++) {
      const spreadAngle = count > 1 ? rad + (i - 2) * 0.045 : rad;
      const spreadSpeed = count > 1 ? speed * (0.94 + i * 0.03) : speed;
      this.projectiles.push({
        x: mx,
        y: my,
        vx: Math.cos(spreadAngle) * spreadSpeed,
        vy: -Math.sin(spreadAngle) * spreadSpeed,
        weaponId,
        owner,
        bouncesLeft: weaponId === 'bouncer' ? 3 : 0,
        splitDone: false,
        digging: 0,
        age: 0,
        smokeAcc: 0,
        trail: [],
      });
    }
    this.emitHud();
  }

  private findNearestEnemy(owner: number, fromX: number, fromY: number): TankEntity | null {
    let best: TankEntity | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.tanks.length; i++) {
      if (i === owner) continue;
      const tk = this.tanks[i];
      if (tk.hp <= 0) continue;
      const d = Math.hypot(tk.x - fromX, tk.y - fromY);
      if (d < bestDist) {
        bestDist = d;
        best = tk;
      }
    }
    return best;
  }

  private traceLaserHit(sx: number, sy: number, rad: number, owner: number): { hx: number; hy: number } {
    const dx = Math.cos(rad);
    const dy = -Math.sin(rad);
    let hx = sx;
    let hy = sy;
    for (let step = 4; step < 1250; step += 4) {
      const cx = sx + dx * step;
      const cy = sy + dy * step;
      if (cx < 0 || cx >= WORLD_W || cy > WORLD_H) {
        hx = cx;
        hy = cy;
        break;
      }
      let hitEnemy = false;
      for (let i = 0; i < this.tanks.length; i++) {
        if (i === owner || this.tanks[i].hp <= 0) continue;
        if (Math.hypot(cx - this.tanks[i].x, cy - (this.tanks[i].y - 10)) < 18) {
          hitEnemy = true;
          break;
        }
      }
      if (hitEnemy || (cy >= 0 && cy >= this.sampleTerrain(cx))) {
        hx = cx;
        hy = cy;
        break;
      }
      hx = cx;
      hy = cy;
    }
    return { hx, hy };
  }

  private fireLaserRay(sx: number, sy: number, rad: number, owner: number): void {
    const { hx, hy } = this.traceLaserHit(sx, sy, rad, owner);

    this.laserBeams.push({
      x1: sx,
      y1: sy,
      x2: hx,
      y2: hy,
      color: '#60a5fa',
      life: 0.34,
      maxLife: 0.34,
    });

    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const px = sx + ((hx - sx) * i) / steps;
      const py = sy + ((hy - sy) * i) / steps;
      this.pushParticle({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 42,
        vy: (Math.random() - 0.5) * 42,
        color: i % 2 === 0 ? '#93c5fd' : '#e0f2fe',
        size: 2.5 + Math.random() * 1.5,
        life: 0.35,
        maxLife: 0.35,
        kind: 'spark',
      });
    }

    const def = WEAPONS.find((w) => w.id === 'laser') as WeaponDef;
    this.detonateAt(hx, hy, def, owner);
    this.endTurnAfterDelay();
  }

  private startLoop(): void {
    this.stop();
    this.lastTs = performance.now();
    const tick = (ts: number) => {
      const dt = Math.min(0.033, Math.max(0.001, (ts - this.lastTs) / 1000));
      this.lastTs = ts;
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private pushParticle(p: Particle): void {
    if (this.particles.length >= 420) this.particles.shift();
    this.particles.push(p);
  }

  private update(dt: number): void {
    this.elapsed += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);

    // Drift clouds & visible wind streaks with current wind!
    const cloudDrift = this.wind * 2.1;
    for (const c of this.clouds) {
      c.x += (c.speed * 0.25 * Math.sign(this.wind || 1) + cloudDrift) * dt;
      if (c.x > WORLD_W + 140) c.x = -140;
      if (c.x < -150) c.x = WORLD_W + 130;
    }

    for (const ws of this.windStreaks) {
      ws.x += this.wind * 16 * ws.speed * dt;
      if (ws.x > WORLD_W + 80) ws.x = -80;
      if (ws.x < -80) ws.x = WORLD_W + 80;
    }

    // Settle tanks & decay recoil / flashes
    for (const t of this.tanks) {
      const gy = this.sampleTerrain(t.x);
      if (t.y < gy) t.y = Math.min(gy, t.y + 180 * dt);
      else t.y = gy;
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 5.2);
      if (t.muzzleFlash > 0) t.muzzleFlash = Math.max(0, t.muzzleFlash - dt);
      if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - dt);
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) {
        this.projectiles.splice(i, 1);
        if (this.projectiles.length === 0) this.endTurnAfterDelay();
        continue;
      }

      p.age += dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 24) p.trail.shift();

      p.smokeAcc += dt;
      if (p.smokeAcc >= 0.024) {
        p.smokeAcc = 0;
        const def = WEAPONS.find((w) => w.id === p.weaponId) || WEAPONS[0];
        this.pushParticle({
          x: p.x + (Math.random() - 0.5) * 2,
          y: p.y + (Math.random() - 0.5) * 2,
          vx: -p.vx * 0.04 + this.wind * 1.8,
          vy: -p.vy * 0.04 - 10,
          color: p.weaponId === 'firerain' || p.weaponId === 'nuke' ? def.color : 'rgba(203, 213, 225, 0.55)',
          size: p.weaponId === 'nuke' ? 4.2 : 2.6,
          life: 0.38,
          maxLife: 0.38,
          kind: 'smoke',
          grow: 10,
        });
      }

      if (p.digging > 0) {
        p.x += p.vx * 0.45 * dt;
        p.y += p.vy * 0.45 * dt;
        p.vy += GRAVITY * 0.4 * dt;
        p.digging -= dt;
        if (p.digging <= 0) {
          this.triggerExplosion(p);
          this.projectiles.splice(i, 1);
          if (this.projectiles.length === 0) this.endTurnAfterDelay();
        }
        continue;
      }

      // Meaningful Wind & Gravity
      p.vx += this.wind * WIND_ACCEL * dt;
      p.vy += GRAVITY * dt;

      // Seeker homing on descent toward nearest living enemy
      if (p.weaponId === 'seeker' && p.vy > 0) {
        const target = this.findNearestEnemy(p.owner, p.x, p.y);
        if (target) {
          const dx = target.x - p.x;
          p.vx += Math.sign(dx) * Math.min(190, Math.abs(dx) * 1.5) * dt;
        }
      }

      // Splitter at apex
      if (p.weaponId === 'splitter' && !p.splitDone && p.vy > 10 && p.age > 0.25 && this.projectiles.length < 24) {
        p.splitDone = true;
        this.sfx.bounce();
        for (const dvx of [-75, 75]) {
          this.projectiles.push({
            x: p.x,
            y: p.y,
            vx: p.vx + dvx,
            vy: p.vy - 25,
            weaponId: 'splitter',
            owner: p.owner,
            bouncesLeft: 0,
            splitDone: true,
            digging: 0,
            age: p.age,
            smokeAcc: 0,
            trail: [],
          });
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < -30 || p.x > WORLD_W + 30 || p.y > WORLD_H + 40) {
        this.projectiles.splice(i, 1);
        if (this.projectiles.length === 0) this.endTurnAfterDelay();
        continue;
      }

      // Direct collision check across all 5 living tanks
      let hitTank = false;
      for (let ti = 0; ti < this.tanks.length; ti++) {
        const tk = this.tanks[ti];
        if (tk.hp <= 0) continue;
        if (p.age < 0.14 && ti === p.owner) continue;
        if (Math.hypot(p.x - tk.x, p.y - (tk.y - 10)) <= 18) {
          hitTank = true;
          break;
        }
      }

      const groundY = this.sampleTerrain(Math.max(0, Math.min(WORLD_W - 1, p.x)));
      if (hitTank || p.y >= groundY) {
        if (p.bouncesLeft > 0 && !hitTank) {
          p.bouncesLeft -= 1;
          p.y = groundY - 3;
          p.vy = -Math.abs(p.vy) * 0.62 - 60;
          p.vx *= 0.85;
          this.sfx.bounce();
        } else if (p.weaponId === 'digger' && !hitTank && p.digging === 0) {
          p.digging = 0.28;
          this.sfx.bounce();
        } else {
          this.triggerExplosion(p);
          this.projectiles.splice(i, 1);
          if (this.projectiles.length === 0) this.endTurnAfterDelay();
        }
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].life -= dt;
      if (this.explosions[i].life <= 0) this.explosions.splice(i, 1);
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      this.shockwaves[i].life -= dt;
      if (this.shockwaves[i].life <= 0) this.shockwaves.splice(i, 1);
    }

    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      this.laserBeams[i].life -= dt;
      if (this.laserBeams[i].life <= 0) this.laserBeams.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.kind === 'smoke') {
        pt.vy -= 18 * dt;
        pt.vx *= Math.pow(0.45, dt);
        if (pt.grow) pt.size += pt.grow * dt;
      } else {
        pt.vy += 140 * dt;
      }
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += GRAVITY * 0.95 * dt;
      d.rot += d.vrot * dt;
      d.life -= dt;
      if (d.life <= 0 || d.y > WORLD_H + 20) this.debris.splice(i, 1);
    }

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.35, dt);
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    // AI Turn timer
    const active = this.tanks[this.turn];
    if (!this.matchOver && active && active.isAi && this.aiTimer > 0 && this.projectiles.length === 0) {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.executeAiShot();
      }
    }
  }

  private triggerExplosion(p: Projectile): void {
    const def = WEAPONS.find((w) => w.id === p.weaponId) || WEAPONS[0];
    this.detonateAt(p.x, Math.min(WORLD_H - 12, p.y), def, p.owner);
  }

  private detonateAt(cx: number, cy: number, def: WeaponDef, attacker: number): void {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    const isMound = def.id === 'mound';
    const big = def.radius >= 50;
    this.sfx.explode(big);
    this.shake = Math.max(this.shake, big ? 13 : 6.5);

    if (this.explosions.length < 40) {
      this.explosions.push({
        x: cx,
        y: cy,
        radius: def.radius,
        color: def.color,
        life: 0.46,
        maxLife: 0.46,
        isMound,
      });
    }

    if (this.shockwaves.length < 30) {
      this.shockwaves.push({
        x: cx,
        y: cy,
        maxRadius: def.radius * (big ? 1.85 : 1.55),
        color: def.color,
        life: big ? 0.48 : 0.34,
        maxLife: big ? 0.48 : 0.34,
      });
    }

    const sparkCount = big ? 34 : 18;
    for (let i = 0; i < sparkCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * (big ? 225 : 140);
      this.pushParticle({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 48,
        color: i % 3 === 0 ? '#ffffff' : i % 2 === 0 ? def.color : '#fb923c',
        size: 2.2 + Math.random() * 3.8,
        life: 0.38 + Math.random() * 0.42,
        maxLife: 0.8,
        kind: 'spark',
      });
    }
    for (let i = 0; i < (big ? 12 : 6); i++) {
      this.pushParticle({
        x: cx + (Math.random() - 0.5) * def.radius * 0.6,
        y: cy + (Math.random() - 0.5) * def.radius * 0.3,
        vx: (Math.random() - 0.5) * 45 + this.wind * 2,
        vy: -25 - Math.random() * 55,
        color: 'rgba(51, 65, 85, 0.72)',
        size: 6 + Math.random() * (big ? 10 : 6),
        life: 0.65 + Math.random() * 0.45,
        maxLife: 1.1,
        kind: 'smoke',
        grow: 14,
      });
    }

    const debrisCount = isMound ? 8 : big ? 18 : 10;
    const debrisColors = isMound ? ['#d97706', '#fcd34d', '#b45309'] : ['#78716c', '#57534e', '#4d7c0f', '#292524'];
    for (let i = 0; i < debrisCount && this.debris.length < 140; i++) {
      const ang = -Math.PI * (0.12 + Math.random() * 0.76);
      const spd = 95 + Math.random() * (big ? 240 : 155);
      this.debris.push({
        x: cx + (Math.random() - 0.5) * 14,
        y: cy - 3,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 14,
        size: 2.5 + Math.random() * (big ? 4.2 : 3),
        color: debrisColors[i % debrisColors.length],
        life: 0.75 + Math.random() * 0.5,
        maxLife: 1.25,
      });
    }

    // Deform terrain
    const r = def.radius;
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(WORLD_W - 1, Math.ceil(cx + r));
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const span = Math.sqrt(Math.max(0, r * r - dx * dx));
      if (isMound) {
        this.terrain[x] = Math.max(95, this.terrain[x] - span * 0.85);
        this.scorch[x] = Math.max(0, this.scorch[x] - 0.5);
      } else {
        const craterBottom = cy + span * 0.92;
        if (craterBottom > this.terrain[x]) {
          this.terrain[x] = Math.min(WORLD_H - 14, craterBottom);
          this.scorch[x] = 1;
        } else if (Math.abs(dx) < r * 1.05) {
          this.scorch[x] = Math.max(this.scorch[x], 0.55);
        }
      }
    }

    // Damage all living tanks within blast radius
    const blastRange = def.radius + 18;
    for (let ti = 0; ti < this.tanks.length; ti++) {
      const tk = this.tanks[ti];
      if (tk.hp <= 0) continue;
      const dist = Math.hypot(tk.x - cx, tk.y - 10 - cy);
      if (dist <= blastRange) {
        const falloff = Math.max(0.25, 1 - dist / (blastRange + 8));
        const dmg = Math.max(4, Math.round(def.damage * falloff));
        const wasAlive = tk.hp > 0;
        tk.hp = Math.max(0, tk.hp - dmg);
        tk.hitFlash = 0.18;
        if (this.floats.length < 40) {
          this.floats.push({
            x: tk.x,
            y: tk.y - 38,
            vy: -52,
            text: tk.hp <= 0 && wasAlive ? `💥 KO! -${dmg}` : `-${dmg}`,
            color: ti !== 0 ? '#fde047' : '#f87171',
            life: 1.2,
            maxLife: 1.2,
            big: dmg >= 35 || tk.hp <= 0,
          });
        }
        if (!this.matchOver && attacker === 0 && ti !== 0) {
          this.score += dmg * 10 + (tk.hp <= 0 ? 150 : 0);
        }
      }
    }

    // Check match end: In AI mode, Player loses immediately if YOU dies, or wins if all 4 CPUs die.
    // In 5P mode, last tank standing wins!
    if (!this.matchOver) {
      const living = this.tanks.map((t, idx) => ({ t, idx })).filter((x) => x.t.hp > 0);
      if (this.mode === 'ai' && this.tanks[0].hp <= 0) {
        this.matchOver = true;
        this.streak = 0;
        const survivor = living[0];
        this.onMatchEnd({
          winner: survivor ? survivor.idx : 1,
          winnerLabel: survivor ? survivor.t.label : 'CPU',
          score: this.score,
          streak: this.streak,
          mode: this.mode,
          round: this.round,
        });
      } else if (living.length <= 1) {
        this.matchOver = true;
        const winIdx = living[0] ? living[0].idx : 0;
        const winLabel = living[0] ? living[0].t.label : 'DRAW';
        if (this.mode === 'ai' && winIdx === 0) {
          this.streak += 1;
          this.score += 400 + this.tanks[0].hp * 3 + this.round * 150;
          this.sfx.victory();
        }
        this.onMatchEnd({
          winner: winIdx,
          winnerLabel: winLabel,
          score: this.score,
          streak: this.streak,
          mode: this.mode,
          round: this.round,
        });
      }
    }
    this.emitHud();
  }

  private endTurnAfterDelay(): void {
    if (this.matchOver) {
      this.emitHud();
      return;
    }

    // Advance turn to next living tank in the 5-tank ring!
    let nextTurn = this.turn;
    for (let step = 1; step <= this.tanks.length; step++) {
      const candidate = (this.turn + step) % this.tanks.length;
      if (this.tanks[candidate].hp > 0) {
        nextTurn = candidate;
        break;
      }
    }

    this.turn = nextTurn;
    const active = this.tanks[this.turn];
    active.fuel = 100;
    // Regenerate Mana at start of tank's turn, capped at MAX_MANA_PER_ROUND (100)!
    active.mana = Math.min(active.maxMana, active.mana + MANA_REGEN_PER_TURN);

    // Every single turn gets a brand-new, noticeable wind value!
    this.wind = this.rollNewWind(this.wind);

    // If current selected weapon costs more than the active tank's mana, fallback to free Standard Shell
    const curWeapon = WEAPONS.find((w) => w.id === this.selectedWeapon) || WEAPONS[0];
    if (curWeapon.manaCost > active.mana) {
      this.selectedWeapon = 'standard';
    }

    if (active.isAi) {
      this.aiTimer = 0.72;
    }
    this.emitHud();
  }

  private executeAiShot(): void {
    if (this.matchOver) return;
    const ai = this.tanks[this.turn];
    if (!ai || ai.hp <= 0) {
      this.endTurnAfterDelay();
      return;
    }

    // Pick a living target (prefer Player 55% of the time, or nearest rival tank 45% for real 5-tank chaos!)
    const enemies = this.tanks.filter((t, idx) => idx !== this.turn && t.hp > 0);
    if (enemies.length === 0) return;
    const target =
      this.tanks[0].hp > 0 && Math.random() < 0.55
        ? this.tanks[0]
        : enemies.sort((a, b) => Math.abs(a.x - ai.x) - Math.abs(b.x - ai.x))[0];

    const shootRight = target.x >= ai.x;
    const minAng = shootRight ? 22 : 112;
    const maxAng = shootRight ? 74 : 158;

    let bestAngle = shootRight ? 46 : 134;
    let bestPower = 68;
    let bestDist = Infinity;

    for (let angle = minAng; angle <= maxAng; angle += 4) {
      for (let power = 32; power <= 96; power += 4) {
        const rad = (angle * Math.PI) / 180;
        let x = ai.x + Math.cos(rad) * 25;
        let y = ai.y - 13 - Math.sin(rad) * 25;
        let vx = Math.cos(rad) * power * 7.0;
        let vy = -Math.sin(rad) * power * 7.0;

        for (let step = 0; step < 120; step++) {
          const dt = 0.03;
          vx += this.wind * WIND_ACCEL * dt;
          vy += GRAVITY * dt;
          x += vx * dt;
          y += vy * dt;
          if (x < 0 || x >= WORLD_W || y >= WORLD_H) break;
          if (y >= this.sampleTerrain(x)) {
            const d = Math.hypot(x - target.x, y - target.y);
            if (d < bestDist) {
              bestDist = d;
              bestAngle = angle;
              bestPower = power;
            }
            break;
          }
        }
      }
    }

    const jitterScale = Math.max(0.3, 1.35 - this.round * 0.14);
    ai.angleDeg = Math.max(10, Math.min(170, Math.round(bestAngle + (Math.random() - 0.5) * 9 * jitterScale)));
    ai.power = Math.max(20, Math.min(100, Math.round(bestPower + (Math.random() - 0.5) * 11 * jitterScale)));

    // AI obeys the exact same Mana cost rules!
    const affordable = WEAPONS.filter((w) => w.manaCost <= ai.mana && w.id !== 'mound');
    const special = affordable.filter((w) => w.manaCost > 0);
    let chosen: WeaponId =
      special.length > 0 && Math.random() < 0.55
        ? special[Math.floor(Math.random() * special.length)].id
        : 'standard';

    // If AI considers Sniper Laser (ignores wind/gravity), verify clear direct line-of-sight first!
    if (chosen === 'laser') {
      const dx = target.x - ai.x;
      const dy = (ai.y - 13) - (target.y - 12);
      const directDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      let clearLos = directDeg >= 5 && directDeg <= 175;
      if (clearLos) {
        const steps = 28;
        for (let s = 2; s < steps - 1; s++) {
          const t = s / steps;
          const sx = ai.x + dx * t;
          const sy = (ai.y - 13) - dy * t;
          if (sy >= this.sampleTerrain(sx) - 4) {
            clearLos = false;
            break;
          }
        }
      }
      if (clearLos) {
        ai.angleDeg = Math.max(5, Math.min(175, directDeg));
        ai.power = 100;
      } else {
        const alt = special.filter((w) => w.id !== 'laser');
        chosen = alt.length > 0 ? alt[Math.floor(Math.random() * alt.length)].id : 'standard';
      }
    }

    this.launchWeapon(this.turn, chosen);
  }

  private emitHud(): void {
    const active = this.tanks[this.turn] || this.tanks[0];
    const aliveCount = this.tanks.filter((t) => t.hp > 0).length;
    this.onHud({
      turn: this.turn,
      turnLabel: active.label,
      isPlayerTurn: !active.isAi && active.hp > 0,
      mode: this.mode,
      wind: this.wind,
      activeHp: active.hp,
      activeMana: active.mana,
      maxMana: active.maxMana,
      aliveCount,
      totalTanks: this.tanks.length,
      angle: active.angleDeg,
      power: active.power,
      fuel: active.fuel,
      weaponId: this.selectedWeapon,
      round: this.round,
      score: this.score,
      streak: this.streak,
      busy: this.isBusy() || this.matchOver,
    });
  }

  private getViewTransform(cssW: number, cssH: number) {
    const safeW = Math.max(1, cssW);
    const safeH = Math.max(1, cssH);
    const scaleX = safeW / WORLD_W;
    const scaleY = safeH / WORLD_H;
    const scale = Math.max(0.01, Math.min(scaleX, scaleY));
    const offsetX = (safeW - WORLD_W * scale) * 0.5;
    const offsetY = safeH - WORLD_H * scale;
    const skyTopWorldY = -offsetY / scale;
    const leftWorldX = -offsetX / scale;
    const viewWorldW = safeW / scale;
    const viewWorldH = safeH / scale;
    return { scale, offsetX, offsetY, skyTopWorldY, leftWorldX, viewWorldW, viewWorldH };
  }

  private attachPointerAim(): void {
    const toWorld = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const t = this.getViewTransform(rect.width, rect.height);
      const x = (clientX - rect.left - t.offsetX) / t.scale;
      const y = (clientY - rect.top - t.offsetY) / t.scale;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    };

    const aimAt = (clientX: number, clientY: number) => {
      if (this.isBusy() || !this.isHumanControlledTurn() || this.matchOver) return;
      const w = toWorld(clientX, clientY);
      if (!w) return;
      const t = this.tanks[this.turn];
      const dx = w.x - t.x;
      const dy = t.y - 13 - w.y;
      if (dy < -10) return;
      const deg = Math.round((Math.atan2(Math.max(4, dy), dx) * 180) / Math.PI);
      const dist = Math.hypot(dx, dy);
      if (!Number.isFinite(deg) || !Number.isFinite(dist)) return;
      t.angleDeg = Math.max(5, Math.min(175, deg));
      t.power = Math.max(18, Math.min(100, Math.round((dist / 250) * 100)));
      this.emitHud();
    };

    const stopDrag = () => {
      this.draggingAim = false;
      this.activePointerId = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (this.activePointerId !== null) return;
      this.activePointerId = e.pointerId;
      this.draggingAim = true;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      aimAt(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.draggingAim) return;
      if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
      aimAt(e.clientX, e.clientY);
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      stopDrag();
    };

    const onVisibility = () => {
      if (document.hidden) stopDrag();
      else this.lastTs = performance.now();
    };

    const onResize = () => {
      this.render();
    };

    this.canvas.addEventListener('pointerdown', onPointerDown);
    this.canvas.addEventListener('lostpointercapture', stopDrag);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUpOrCancel);
    window.addEventListener('pointercancel', onPointerUpOrCancel);
    window.addEventListener('blur', stopDrag);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    this.cleanupListeners = () => {
      this.canvas.removeEventListener('pointerdown', onPointerDown);
      this.canvas.removeEventListener('lostpointercapture', stopDrag);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUpOrCancel);
      window.removeEventListener('pointercancel', onPointerUpOrCancel);
      window.removeEventListener('blur', stopDrag);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  private render(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    const vt = this.getViewTransform(w, h);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(vt.offsetX, vt.offsetY);
    ctx.scale(vt.scale, vt.scale);

    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    const skyTop = Math.min(0, vt.skyTopWorldY) - 20;
    const skyLeft = vt.leftWorldX - 24;
    const skyW = vt.viewWorldW + 48;

    // 1. Rotating round biome sky gradient (Twilight, Golden Desert, Arctic Aurora, Volcanic Dusk)
    const biomeIdx = (this.round - 1) % 4;
    const skyPalettes: Array<[string, string, string, string, string]> = [
      ['#040814', '#0c1836', '#1b2948', '#362c4a', '#553a4e'], // Twilight Valley
      ['#1a1230', '#4a2346', '#9a3412', '#d97706', '#f59e0b'], // Golden Desert Dusk
      ['#02101d', '#06283d', '#0f4c5c', '#14b8a6', '#67e8f9'], // Arctic Aurora
      ['#0c060c', '#2a0a18', '#5c1420', '#9a241c', '#ea580c'], // Volcanic Ash
    ];
    const pal = skyPalettes[biomeIdx];
    const sky = ctx.createLinearGradient(0, skyTop, 0, WORLD_H);
    sky.addColorStop(0, pal[0]);
    sky.addColorStop(0.32, pal[1]);
    sky.addColorStop(0.65, pal[2]);
    sky.addColorStop(0.86, pal[3]);
    sky.addColorStop(1, pal[4]);
    ctx.fillStyle = sky;
    ctx.fillRect(skyLeft, skyTop, skyW, WORLD_H - skyTop + 40);

    // 2. Twinkling stars + moon
    for (const s of this.stars) {
      if (s.y < skyTop) continue;
      const twinkle = 0.55 + 0.45 * Math.sin(this.elapsed * s.speed + s.phase);
      ctx.fillStyle = `rgba(241, 245, 249, ${(s.a * twinkle).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const moonX = WORLD_W * 0.84;
    const moonY = Math.max(skyTop + 62, 66);
    const moonGlow = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, 54);
    moonGlow.addColorStop(0, 'rgba(254, 243, 199, 0.32)');
    moonGlow.addColorStop(1, 'rgba(254, 243, 199, 0)');
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 54, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101d3b';
    ctx.beginPath();
    ctx.arc(moonX + 6, moonY - 4, 13.5, 0, Math.PI * 2);
    ctx.fill();

    // 3. Clouds & Animated Wind Streaks!
    for (const c of this.clouds) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.scale, c.scale);
      ctx.fillStyle = `rgba(226, 232, 240, ${c.alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.arc(-20, 4, 15, 0, Math.PI * 2);
      ctx.arc(22, 5, 16, 0, Math.PI * 2);
      ctx.arc(8, -8, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.lineCap = 'round';
    for (const ws of this.windStreaks) {
      const dir = Math.sign(this.wind || 1);
      const streakLen = ws.len * (0.55 + Math.abs(this.wind) / 14);
      ctx.strokeStyle = `rgba(186, 230, 253, ${ws.alpha.toFixed(2)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ws.x, ws.y);
      ctx.lineTo(ws.x + dir * streakLen, ws.y);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Mountain layers
    this.drawMountainLayer(skyLeft, skyW, 225, 0.0085, 0.019, 44, 18, 'rgba(15, 23, 42, 0.42)');
    this.drawMountainLayer(skyLeft, skyW, 255, 0.013, 0.027, 36, 20, 'rgba(24, 33, 56, 0.62)');
    this.drawMountainLayer(skyLeft, skyW, 290, 0.019, 0.041, 24, 14, 'rgba(30, 41, 59, 0.78)');

    // 5. Destructible terrain
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H + 24);
    for (let x = 0; x < WORLD_W; x++) {
      ctx.lineTo(x, this.terrain[x]);
    }
    ctx.lineTo(WORLD_W, WORLD_H + 24);
    ctx.closePath();
    ctx.clip();

    const groundGrad = ctx.createLinearGradient(0, 150, 0, WORLD_H);
    groundGrad.addColorStop(0, '#57534e');
    groundGrad.addColorStop(0.28, '#44403c');
    groundGrad.addColorStop(0.62, '#292524');
    groundGrad.addColorStop(1, '#141210');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, 110, WORLD_W, WORLD_H - 90);

    const strata = [
      { y: 260, amp: 14, freq: 0.014, color: 'rgba(120, 113, 108, 0.22)' },
      { y: 335, amp: 16, freq: 0.018, color: 'rgba(87, 83, 78, 0.34)' },
      { y: 405, amp: 12, freq: 0.022, color: 'rgba(28, 25, 23, 0.45)' },
    ];
    for (const st of strata) {
      ctx.fillStyle = st.color;
      ctx.beginPath();
      ctx.moveTo(0, WORLD_H + 20);
      for (let x = 0; x <= WORLD_W; x += 24) {
        ctx.lineTo(x, st.y + Math.sin(x * st.freq) * st.amp);
      }
      ctx.lineTo(WORLD_W, WORLD_H + 20);
      ctx.closePath();
      ctx.fill();
    }

    for (const rf of this.rockFlecks) {
      ctx.save();
      ctx.translate(rf.x, rf.y);
      ctx.rotate(rf.rot);
      ctx.fillStyle = rf.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, rf.rx, rf.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = '#3f6212';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let x = 0; x < WORLD_W; x += 2) {
      if (x === 0) ctx.moveTo(0, this.terrain[0] + 4);
      else ctx.lineTo(x, this.terrain[x] + 4);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(28, 25, 23, 0.92)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    let inScorch = false;
    for (let x = 0; x < WORLD_W; x += 2) {
      if (this.scorch[x] > 0.35) {
        if (!inScorch) {
          ctx.moveTo(x, this.terrain[x] + 3);
          inScorch = true;
        } else {
          ctx.lineTo(x, this.terrain[x] + 3);
        }
      } else {
        inScorch = false;
      }
    }
    ctx.stroke();
    ctx.restore();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    let inGrass = false;
    for (let x = 0; x < WORLD_W; x += 2) {
      if (this.scorch[x] <= 0.4) {
        if (!inGrass) {
          ctx.moveTo(x, this.terrain[x]);
          inGrass = true;
        } else {
          ctx.lineTo(x, this.terrain[x]);
        }
      } else {
        inGrass = false;
      }
    }
    ctx.stroke();

    ctx.strokeStyle = '#bef264';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = 8; x < WORLD_W - 8; x += 11) {
      if (this.scorch[x] > 0.35) continue;
      const slope = Math.abs(this.terrain[x + 2] - this.terrain[x - 2]);
      if (slope > 5.5) continue;
      const gy = this.terrain[x];
      const sway = Math.sin(this.elapsed * 2 + x * 0.15) * 1.4 + this.wind * 0.22;
      ctx.moveTo(x, gy);
      ctx.lineTo(x - 2 + sway, gy - 5);
      ctx.moveTo(x + 2, gy);
      ctx.lineTo(x + 3 + sway, gy - 6);
    }
    ctx.stroke();

    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let inChar = false;
    for (let x = 0; x < WORLD_W; x += 2) {
      if (this.scorch[x] > 0.4) {
        if (!inChar) {
          ctx.moveTo(x, this.terrain[x]);
          inChar = true;
        } else {
          ctx.lineTo(x, this.terrain[x]);
        }
      } else {
        inChar = false;
      }
    }
    ctx.stroke();

    // 6. Short Aim Preview (intentionally short so wind still challenges your shot!)
    if (!this.isBusy() && !this.matchOver && this.isHumanControlledTurn()) {
      const active = this.tanks[this.turn];
      const rad = (active.angleDeg * Math.PI) / 180;
      const recoilOff = active.recoil * 5;
      const sx = active.x + Math.cos(rad) * (25 - recoilOff);
      const sy = active.y - 13 - Math.sin(rad) * (25 - recoilOff);
      const pulse = 0.8 + 0.2 * Math.sin(this.elapsed * 6);

      if (this.selectedWeapon === 'laser') {
        const hit = this.traceLaserHit(sx, sy, rad, this.turn);
        ctx.save();
        ctx.strokeStyle = `rgba(96, 165, 250, ${(0.5 * pulse).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(hit.hx, hit.hy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      } else {
        const speedMult = this.selectedWeapon === 'firerain' ? 6.5 : 7.0;
        const vx = Math.cos(rad) * active.power * speedMult;
        const vy = -Math.sin(rad) * active.power * speedMult;
        for (let step = 1; step <= 8; step++) {
          const t = step * 0.068;
          const px = sx + vx * t + 0.5 * this.wind * WIND_ACCEL * t * t;
          const py = sy + vy * t + 0.5 * GRAVITY * t * t;
          const a = Math.max(0.12, (0.9 - step * 0.1) * pulse);
          const radDot = Math.max(1.4, 3.4 - step * 0.24);
          ctx.fillStyle = `rgba(254, 240, 138, ${a.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(px, py, radDot, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 7. Draw all 5 tanks (destroyed tanks render as darkened smoking wrecks)
    for (let i = 0; i < this.tanks.length; i++) {
      const tk = this.tanks[i];
      const facing: 1 | -1 = tk.angleDeg <= 90 ? 1 : -1;
      this.drawTank(tk, i === this.turn && !this.matchOver && tk.hp > 0, facing);
    }

    // 8. Laser beams
    for (const lb of this.laserBeams) {
      const p = lb.life / lb.maxLife;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = Math.max(0, p);
      ctx.strokeStyle = lb.color;
      ctx.lineWidth = 10 * p;
      ctx.beginPath();
      ctx.moveTo(lb.x1, lb.y1);
      ctx.lineTo(lb.x2, lb.y2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5 * p;
      ctx.beginPath();
      ctx.moveTo(lb.x1, lb.y1);
      ctx.lineTo(lb.x2, lb.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 9. Projectiles & trails
    for (const p of this.projectiles) {
      const def = WEAPONS.find((w) => w.id === p.weaponId) || WEAPONS[0];
      if (p.trail.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        p.trail.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = def.color;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6.2, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(1.5, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 10. Shockwaves
    for (const sw of this.shockwaves) {
      const prog = 1 - sw.life / sw.maxLife;
      const r = sw.maxRadius * (0.18 + 0.82 * Math.sqrt(prog));
      ctx.save();
      ctx.globalAlpha = Math.max(0, (1 - prog) * 0.82);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 3.5 * (1 - prog) + 1;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 11. Explosions
    for (const ex of this.explosions) {
      const p = ex.life / ex.maxLife;
      const grow = 1.24 - p * 0.48;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p * 0.55);
      ctx.fillStyle = ex.color;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius * grow * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.max(0, p * 0.85);
      ctx.fillStyle = ex.isMound ? '#fde68a' : '#f97316';
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius * grow * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.max(0, p);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius * 0.42 * p, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 12. Particles
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, (pt.life / pt.maxLife) * (pt.kind === 'smoke' ? 0.65 : 1));
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(0.5, pt.size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 13. Debris chunks
    for (const d of this.debris) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, d.life / d.maxLife));
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.size * 0.5, -d.size * 0.4, d.size, d.size * 0.8);
      ctx.restore();
    }

    // 14. Float texts
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const a = Math.max(0, Math.min(1, f.life / (f.maxLife * 0.4)));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = f.big ? '900 22px sans-serif' : '800 18px sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawMountainLayer(
    leftX: number,
    width: number,
    baseY: number,
    f1: number,
    f2: number,
    a1: number,
    a2: number,
    color: string
  ): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(leftX, WORLD_H + 24);
    const step = 36;
    for (let x = leftX; x <= leftX + width + step; x += step) {
      const mh = baseY + Math.sin(x * f1) * a1 + Math.cos(x * f2) * a2;
      ctx.lineTo(x, mh);
    }
    ctx.lineTo(leftX + width + step, WORLD_H + 24);
    ctx.closePath();
    ctx.fill();
  }

  private drawTank(tank: TankEntity, activeTurn: boolean, facing: 1 | -1): void {
    const skin = TANK_SKINS[tank.skinId] || TANK_SKINS[0];
    const dead = tank.hp <= 0;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(tank.x, tank.y);
    if (dead) ctx.globalAlpha = 0.42;

    // Ground contact shadow
    ctx.fillStyle = 'rgba(2, 6, 23, 0.48)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 20, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Active turn pulsing halo
    if (activeTurn && !dead) {
      const pulse = 0.65 + 0.35 * Math.sin(this.elapsed * 5);
      ctx.strokeStyle = `rgba(250, 204, 21, ${(0.8 * pulse).toFixed(2)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, -11, 25, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Swaying whip antenna blown by wind
    const antX = -facing * 7;
    const antSway = Math.sin(this.elapsed * 4 + tank.x * 0.1) * 1.4 + this.wind * 0.32;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(antX, -20);
    ctx.quadraticCurveTo(antX + antSway * 0.5, -28, antX + antSway, -34);
    ctx.stroke();

    // Cannon barrel
    const rad = (tank.angleDeg * Math.PI) / 180;
    const recoilOffset = tank.recoil * 5.2;
    ctx.save();
    ctx.translate(0, -14);
    ctx.rotate(-rad);
    ctx.translate(-recoilOffset, 0);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(5, -3.4, 18, 6.8);
    ctx.fillStyle = dead ? '#475569' : skin.accent;
    ctx.fillRect(5, -2.3, 18, 4.6);
    if (tank.muzzleFlash > 0) {
      const f = tank.muzzleFlash / 0.14;
      ctx.fillStyle = `rgba(254, 240, 138, ${f.toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(30, 0, 9 * f + 2, 5 * f + 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Turret dome
    ctx.fillStyle = dead ? '#334155' : skin.turret;
    ctx.beginPath();
    ctx.arc(0, -14, 9, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Hull
    ctx.fillStyle = dead ? '#1e293b' : skin.body;
    ctx.beginPath();
    ctx.moveTo(-15, -7);
    ctx.lineTo(-13, -14);
    ctx.lineTo(13, -14);
    ctx.lineTo(16, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tracks
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-18, -7.2, 36, 8.2, 4);
    ctx.fill();

    for (let wi = -2; wi <= 2; wi++) {
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(wi * 6.5, -3, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }

    if (tank.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.65, tank.hitFlash * 4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-19, -25, 38, 26, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (!dead) {
      // HP bar + Mana bar + nameplate above living tank
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(-20, -42, 40, 6.2, 3);
      ctx.fill();
      ctx.fillStyle = tank.hp > 50 ? '#22c55e' : tank.hp > 25 ? '#f59e0b' : '#ef4444';
      const hpW = Math.max(0, 36 * (tank.hp / tank.maxHp));
      if (hpW > 0) {
        ctx.beginPath();
        ctx.roundRect(-18, -40.8, hpW, 3.8, 2);
        ctx.fill();
      }

      // Slim cyan Mana bar underneath HP bar
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(-18, -35.2, 36, 3);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-18, -35.2, 36 * (tank.mana / tank.maxMana), 3);

      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
      ctx.strokeText(tank.label, 0, -46);
      ctx.fillStyle = activeTurn ? '#fde047' : '#f8fafc';
      ctx.fillText(tank.label, 0, -46);

      // Clear bobbing turn indicator arrow above active tank
      if (activeTurn) {
        const bob = Math.sin(this.elapsed * 6.5) * 3.5;
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(0, -56 + bob);
        ctx.lineTo(-6, -65 + bob);
        ctx.lineTo(6, -65 + bob);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // Rising smoke wisps from destroyed tank wreck
      for (let sm = 0; sm < 3; sm++) {
        const phase = (this.elapsed * 0.7 + sm * 0.33 + tank.x * 0.01) % 1;
        const sx = Math.sin(this.elapsed * 2 + sm * 2) * 4 + this.wind * phase * 1.4;
        const sy = -14 - phase * 26;
        ctx.fillStyle = `rgba(148, 163, 184, ${(0.34 * (1 - phase)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2 + phase * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.8;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('💀', 0, -24);
    }

    ctx.restore();
  }
}
