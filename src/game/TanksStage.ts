import { TANK_SKINS, WEAPONS, WeaponDef, WeaponId } from '../data/tanks';
import { SoundFX } from './SoundFX';

export type GameMode = 'ai' | 'pvp';

interface TankEntity {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  angleDeg: number; // 0..180 where 0 is right, 90 is up, 180 is left
  power: number; // 15..100
  fuel: number;
  skinId: number;
  label: string;
  recoil: number; // 0..1 barrel recoil kick
  muzzleFlash: number; // seconds left
  wheelSpin: number; // radians for roadwheel spokes
  hitFlash: number; // seconds left
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  weaponId: WeaponId;
  owner: 0 | 1;
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

interface RockFleck {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  color: string;
}

export interface HudSnapshot {
  turn: 0 | 1;
  mode: GameMode;
  wind: number;
  p1Hp: number;
  p2Hp: number;
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
  winner: 0 | 1;
  score: number;
  streak: number;
  mode: GameMode;
  round: number;
}

const WORLD_W = 900;
const WORLD_H = 520;
const GRAVITY = 270;

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
  private rockFlecks: RockFleck[] = [];
  private tanks: [TankEntity, TankEntity];
  private projectiles: Projectile[] = [];
  private explosions: Explosion[] = [];
  private shockwaves: Shockwave[] = [];
  private laserBeams: LaserBeam[] = [];
  private particles: Particle[] = [];
  private debris: DebrisChunk[] = [];
  private floats: FloatText[] = [];

  private mode: GameMode = 'ai';
  private turn: 0 | 1 = 0;
  private wind = 0;
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

    for (let i = 0; i < 7; i++) {
      this.clouds.push({
        x: (i / 7) * (WORLD_W + 180) - 90,
        y: 36 + (i % 3) * 44 + Math.random() * 22,
        scale: 0.75 + Math.random() * 0.65,
        speed: 4 + Math.random() * 6,
        alpha: 0.1 + Math.random() * 0.1,
      });
    }

    const fleckPalette = ['rgba(120,113,108,0.34)', 'rgba(68,64,60,0.42)', 'rgba(168,162,158,0.22)'];
    for (let i = 0; i < 140; i++) {
      this.rockFlecks.push({
        x: Math.random() * WORLD_W,
        y: 165 + Math.random() * (WORLD_H - 170),
        rx: 2 + Math.random() * 6,
        ry: 1.5 + Math.random() * 3.5,
        rot: Math.random() * Math.PI,
        color: fleckPalette[i % fleckPalette.length],
      });
    }

    this.tanks = [
      this.makeTank(140, 300, 42, 0, 'P1'),
      this.makeTank(760, 300, 138, 3, 'CPU'),
    ];

    this.attachPointerAim();
  }

  private makeTank(x: number, y: number, angleDeg: number, skinId: number, label: string): TankEntity {
    return {
      x,
      y,
      hp: 100,
      maxHp: 100,
      angleDeg,
      power: 68,
      fuel: 100,
      skinId,
      label,
      recoil: 0,
      muzzleFlash: 0,
      wheelSpin: 0,
      hitFlash: 0,
    };
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
    this.selectedWeapon = id;
    this.emitHud();
  }

  public adjustAngle(delta: number): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1) || this.matchOver) return;
    if (!Number.isFinite(delta)) return;
    const t = this.tanks[this.turn];
    t.angleDeg = Math.max(5, Math.min(175, Math.round(t.angleDeg + delta)));
    this.emitHud();
  }

  public setAngle(deg: number): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1) || this.matchOver) return;
    if (!Number.isFinite(deg)) return;
    const t = this.tanks[this.turn];
    t.angleDeg = Math.max(5, Math.min(175, Math.round(deg)));
    this.emitHud();
  }

  public adjustPower(delta: number): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1) || this.matchOver) return;
    if (!Number.isFinite(delta)) return;
    const t = this.tanks[this.turn];
    t.power = Math.max(15, Math.min(100, Math.round(t.power + delta)));
    this.emitHud();
  }

  public setPower(pwr: number): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1) || this.matchOver) return;
    if (!Number.isFinite(pwr)) return;
    const t = this.tanks[this.turn];
    t.power = Math.max(15, Math.min(100, Math.round(pwr)));
    this.emitHud();
  }

  public moveTank(dir: -1 | 1): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1) || this.matchOver) return;
    const t = this.tanks[this.turn];
    if (t.fuel <= 0) return;
    const nextX = Math.max(32, Math.min(WORLD_W - 32, t.x + dir * 16));
    const currentGround = this.sampleTerrain(t.x);
    const nextGround = this.sampleTerrain(nextX);
    if (currentGround - nextGround > 26) return; // too steep
    t.wheelSpin += (nextX - t.x) * 0.18;
    t.x = nextX;
    t.y = nextGround;
    t.fuel = Math.max(0, t.fuel - 15);
    this.emitHud();
  }

  public fireCurrentWeapon(): void {
    if (this.isBusy() || this.matchOver) return;
    if (this.mode === 'ai' && this.turn === 1) return;
    this.launchWeapon(this.turn, this.selectedWeapon);
  }

  private setupRound(): void {
    this.generateTerrain();
    const aiSkin = (this.playerSkinId + 3) % TANK_SKINS.length;
    const x1 = 90 + Math.random() * 140;
    const x2 = WORLD_W - (90 + Math.random() * 140);
    this.tanks = [
      {
        ...this.makeTank(x1, this.sampleTerrain(x1), 45, this.playerSkinId, 'YOU'),
      },
      {
        ...this.makeTank(
          x2,
          this.sampleTerrain(x2),
          135,
          aiSkin,
          this.mode === 'ai' ? `CPU Lv.${this.round}` : 'P2'
        ),
      },
    ];
    this.projectiles = [];
    this.explosions = [];
    this.shockwaves = [];
    this.laserBeams = [];
    this.particles = [];
    this.debris = [];
    this.floats = [];
    this.turn = 0;
    this.matchOver = false;
    this.aiTimer = 0;
    this.shake = 0;
    this.draggingAim = false;
    this.activePointerId = null;
    this.wind = Math.round((Math.random() * 24 - 12) * 10) / 10;
    this.emitHud();
  }

  private generateTerrain(): void {
    const base = 315 + Math.random() * 45;
    const amp1 = 55 + Math.random() * 45;
    const amp2 = 24 + Math.random() * 30;
    const ph1 = Math.random() * Math.PI * 2;
    const ph2 = Math.random() * Math.PI * 2;
    const midPeak = (Math.random() - 0.3) * 75;

    for (let x = 0; x < WORLD_W; x++) {
      const nx = x / WORLD_W;
      const hill = Math.sin(nx * Math.PI * 2.2 + ph1) * amp1 + Math.sin(nx * Math.PI * 5.4 + ph2) * amp2;
      const centerBump = Math.exp(-Math.pow((nx - 0.5) / 0.16, 2)) * midPeak;
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

  private launchWeapon(owner: 0 | 1, weaponId: WeaponId): void {
    const t = this.tanks[owner];
    const rad = (t.angleDeg * Math.PI) / 180;
    const barrelLen = 25;
    const mx = t.x + Math.cos(rad) * barrelLen;
    const my = t.y - 13 - Math.sin(rad) * barrelLen;

    t.recoil = 1;
    t.muzzleFlash = 0.14;
    this.draggingAim = false;
    this.activePointerId = null;

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

    const speed = weaponId === 'firerain' ? t.power * 6.4 : t.power * 6.8;
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

  private traceLaserHit(sx: number, sy: number, rad: number, owner: 0 | 1): { hx: number; hy: number } {
    const dx = Math.cos(rad);
    const dy = -Math.sin(rad);
    let hx = sx;
    let hy = sy;
    const opp = this.tanks[owner === 0 ? 1 : 0];
    for (let step = 4; step < 1150; step += 4) {
      const cx = sx + dx * step;
      const cy = sy + dy * step;
      if (cx < 0 || cx >= WORLD_W || cy > WORLD_H) {
        hx = cx;
        hy = cy;
        break;
      }
      if (Math.hypot(cx - opp.x, cy - (opp.y - 10)) < 18 || (cy >= 0 && cy >= this.sampleTerrain(cx))) {
        hx = cx;
        hy = cy;
        break;
      }
      hx = cx;
      hy = cy;
    }
    return { hx, hy };
  }

  private fireLaserRay(sx: number, sy: number, rad: number, owner: 0 | 1): void {
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

    // Drift clouds gently with wind
    const cloudDrift = 4 + this.wind * 1.4;
    for (const c of this.clouds) {
      c.x += (c.speed * 0.4 + cloudDrift) * dt;
      if (c.x > WORLD_W + 140) c.x = -140;
      if (c.x < -150) c.x = WORLD_W + 130;
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

      // Smoky rocket/shell trail
      p.smokeAcc += dt;
      if (p.smokeAcc >= 0.024) {
        p.smokeAcc = 0;
        const def = WEAPONS.find((w) => w.id === p.weaponId) || WEAPONS[0];
        this.pushParticle({
          x: p.x + (Math.random() - 0.5) * 2,
          y: p.y + (Math.random() - 0.5) * 2,
          vx: -p.vx * 0.04 + this.wind * 1.4,
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

      // Wind & Gravity
      p.vx += this.wind * 5.2 * dt;
      p.vy += GRAVITY * dt;

      // Seeker homing on descent
      if (p.weaponId === 'seeker' && p.vy > 0) {
        const target = this.tanks[p.owner === 0 ? 1 : 0];
        const dx = target.x - p.x;
        p.vx += Math.sign(dx) * Math.min(180, Math.abs(dx) * 1.4) * dt;
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

      // Out of bounds
      if (p.x < -30 || p.x > WORLD_W + 30 || p.y > WORLD_H + 40) {
        this.projectiles.splice(i, 1);
        if (this.projectiles.length === 0) this.endTurnAfterDelay();
        continue;
      }

      // Tank direct collision check
      let hitTank = false;
      for (let ti = 0; ti < 2; ti++) {
        if (p.age < 0.14 && ti === p.owner) continue;
        const tk = this.tanks[ti];
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

    // Explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].life -= dt;
      if (this.explosions[i].life <= 0) this.explosions.splice(i, 1);
    }

    // Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      this.shockwaves[i].life -= dt;
      if (this.shockwaves[i].life <= 0) this.shockwaves.splice(i, 1);
    }

    // Laser beams
    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      this.laserBeams[i].life -= dt;
      if (this.laserBeams[i].life <= 0) this.laserBeams.splice(i, 1);
    }

    // Particles
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

    // Debris chunks
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += GRAVITY * 0.95 * dt;
      d.rot += d.vrot * dt;
      d.life -= dt;
      if (d.life <= 0 || d.y > WORLD_H + 20) this.debris.splice(i, 1);
    }

    // Float texts
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.35, dt);
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    // AI Turn timer
    if (!this.matchOver && this.mode === 'ai' && this.turn === 1 && this.aiTimer > 0 && this.projectiles.length === 0) {
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

  private detonateAt(cx: number, cy: number, def: WeaponDef, attacker: 0 | 1): void {
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

    // Sparks + smoke plume
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

    // Flying terrain debris chunks
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

    // Deform terrain & mark scorched rim
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

    // Damage tanks in blast radius
    const blastRange = def.radius + 18;
    for (let ti = 0; ti < 2; ti++) {
      const tk = this.tanks[ti];
      const dist = Math.hypot(tk.x - cx, tk.y - 10 - cy);
      if (dist <= blastRange) {
        const falloff = Math.max(0.25, 1 - dist / (blastRange + 8));
        const dmg = Math.max(4, Math.round(def.damage * falloff));
        tk.hp = Math.max(0, tk.hp - dmg);
        tk.hitFlash = 0.18;
        if (this.floats.length < 40) {
          this.floats.push({
            x: tk.x,
            y: tk.y - 38,
            vy: -52,
            text: `-${dmg}`,
            color: ti === 1 ? '#fde047' : '#f87171',
            life: 1.1,
            maxLife: 1.1,
            big: dmg >= 35,
          });
        }
        if (!this.matchOver && attacker === 0 && ti === 1) {
          this.score += dmg * 10;
        }
      }
    }

    // Check match end (guarded so multi-shell hits cannot fire onMatchEnd twice)
    if (!this.matchOver && (this.tanks[0].hp <= 0 || this.tanks[1].hp <= 0)) {
      this.matchOver = true;
      const winner: 0 | 1 = this.tanks[1].hp <= 0 ? 0 : 1;
      if (winner === 0) {
        this.streak += 1;
        this.score += 250 + this.tanks[0].hp * 3 + this.round * 100;
        this.sfx.victory();
      } else {
        this.streak = 0;
      }
      this.onMatchEnd({
        winner,
        score: this.score,
        streak: this.streak,
        mode: this.mode,
        round: this.round,
      });
    }
    this.emitHud();
  }

  private endTurnAfterDelay(): void {
    if (this.matchOver) {
      this.emitHud();
      return;
    }
    this.turn = this.turn === 0 ? 1 : 0;
    this.tanks[this.turn].fuel = 100;
    this.wind = Math.max(-12, Math.min(12, Math.round((this.wind + (Math.random() * 6 - 3)) * 10) / 10));
    if (this.mode === 'ai' && this.turn === 1) {
      this.aiTimer = 0.75;
    }
    this.emitHud();
  }

  private executeAiShot(): void {
    if (this.matchOver) return;
    const ai = this.tanks[1];
    const target = this.tanks[0];

    let bestAngle = 135;
    let bestPower = 68;
    let bestDist = Infinity;

    for (let angle = 112; angle <= 158; angle += 4) {
      for (let power = 35; power <= 96; power += 4) {
        const rad = (angle * Math.PI) / 180;
        let x = ai.x + Math.cos(rad) * 25;
        let y = ai.y - 13 - Math.sin(rad) * 25;
        let vx = Math.cos(rad) * power * 6.8;
        let vy = -Math.sin(rad) * power * 6.8;

        for (let step = 0; step < 120; step++) {
          const dt = 0.03;
          vx += this.wind * 5.2 * dt;
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

    const jitterScale = Math.max(0.25, 1.35 - this.round * 0.16);
    ai.angleDeg = Math.max(95, Math.min(172, Math.round(bestAngle + (Math.random() - 0.5) * 8 * jitterScale)));
    ai.power = Math.max(20, Math.min(100, Math.round(bestPower + (Math.random() - 0.5) * 10 * jitterScale)));

    const aiWeapons: WeaponId[] = ['standard', 'splitter', 'bouncer', 'firerain', 'seeker', 'nuke'];
    const pick = aiWeapons[Math.floor(Math.random() * Math.min(aiWeapons.length, 2 + this.round))];
    this.launchWeapon(1, pick);
  }

  private emitHud(): void {
    const active = this.tanks[this.turn];
    this.onHud({
      turn: this.turn,
      mode: this.mode,
      wind: this.wind,
      p1Hp: this.tanks[0].hp,
      p2Hp: this.tanks[1].hp,
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
      if (this.isBusy() || (this.mode === 'ai' && this.turn === 1) || this.matchOver) return;
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
      t.power = Math.max(18, Math.min(100, Math.round((dist / 240) * 100)));
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
        // ignore if unsupported
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
      if (document.hidden) {
        stopDrag();
      } else {
        this.lastTs = performance.now();
      }
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

    // 1. Multi-stop twilight atmospheric sky gradient
    const sky = ctx.createLinearGradient(0, skyTop, 0, WORLD_H);
    sky.addColorStop(0, '#040814');
    sky.addColorStop(0.32, '#0c1836');
    sky.addColorStop(0.65, '#1b2948');
    sky.addColorStop(0.86, '#362c4a');
    sky.addColorStop(1, '#553a4e');
    ctx.fillStyle = sky;
    ctx.fillRect(skyLeft, skyTop, skyW, WORLD_H - skyTop + 40);

    // 2. Twinkling stars + subtle crescent moon
    for (const s of this.stars) {
      if (s.y < skyTop) continue;
      const twinkle = 0.55 + 0.45 * Math.sin(this.elapsed * s.speed + s.phase);
      ctx.fillStyle = `rgba(241, 245, 249, ${(s.a * twinkle).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const moonX = WORLD_W * 0.82;
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

    // 3. Drifting parallax clouds
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

    // 4. Distant layered mountain silhouettes (3 depth bands)
    this.drawMountainLayer(skyLeft, skyW, 225, 0.0085, 0.019, 44, 18, 'rgba(15, 23, 42, 0.42)');
    this.drawMountainLayer(skyLeft, skyW, 255, 0.013, 0.027, 36, 20, 'rgba(24, 33, 56, 0.62)');
    this.drawMountainLayer(skyLeft, skyW, 290, 0.019, 0.041, 24, 14, 'rgba(30, 41, 59, 0.78)');

    // 5. Destructible terrain with geological strata & rock flecks
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H + 24);
    for (let x = 0; x < WORLD_W; x++) {
      ctx.lineTo(x, this.terrain[x]);
    }
    ctx.lineTo(WORLD_W, WORLD_H + 24);
    ctx.closePath();
    ctx.clip();

    // Base soil/rock gradient
    const groundGrad = ctx.createLinearGradient(0, 150, 0, WORLD_H);
    groundGrad.addColorStop(0, '#57534e');
    groundGrad.addColorStop(0.28, '#44403c');
    groundGrad.addColorStop(0.62, '#292524');
    groundGrad.addColorStop(1, '#141210');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, 110, WORLD_W, WORLD_H - 90);

    // Wavy geological strata bands
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

    // Embedded pebbles & mineral flecks
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

    // Topsoil thickness just under surface contour
    ctx.strokeStyle = '#3f6212';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let x = 0; x < WORLD_W; x += 2) {
      if (x === 0) ctx.moveTo(0, this.terrain[0] + 4);
      else ctx.lineTo(x, this.terrain[x] + 4);
    }
    ctx.stroke();

    // Charred scorch overlay on crater rims
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

    // Top lush grass rim & organic grass tufts (on un-scorched slopes)
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

    // Small grass blade tufts along intact gentle slopes
    ctx.strokeStyle = '#bef264';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = 8; x < WORLD_W - 8; x += 11) {
      if (this.scorch[x] > 0.35) continue;
      const slope = Math.abs(this.terrain[x + 2] - this.terrain[x - 2]);
      if (slope > 5.5) continue;
      const gy = this.terrain[x];
      const sway = Math.sin(this.elapsed * 2 + x * 0.15) * 1.4 + this.wind * 0.15;
      ctx.moveTo(x, gy);
      ctx.lineTo(x - 2 + sway, gy - 5);
      ctx.moveTo(x + 2, gy);
      ctx.lineTo(x + 3 + sway, gy - 6);
    }
    ctx.stroke();

    // Charred rim highlight on craters
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

    // 6. Glowing aiming preview (straight beam sight for Laser, glowing dots for ballistic)
    if (!this.isBusy() && !this.matchOver && !(this.mode === 'ai' && this.turn === 1)) {
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
        ctx.fillStyle = `rgba(147, 197, 253, ${(0.85 * pulse).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(hit.hx, hit.hy, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        const speedMult = this.selectedWeapon === 'firerain' ? 6.4 : 6.8;
        const vx = Math.cos(rad) * active.power * speedMult;
        const vy = -Math.sin(rad) * active.power * speedMult;
        for (let step = 1; step <= 10; step++) {
          const t = step * 0.075;
          const px = sx + vx * t + 0.5 * this.wind * 5.2 * t * t;
          const py = sy + vy * t + 0.5 * GRAVITY * t * t;
          const a = Math.max(0.12, (0.92 - step * 0.08) * pulse);
          const radDot = Math.max(1.4, 3.6 - step * 0.22);
          ctx.fillStyle = `rgba(250, 204, 21, ${(a * 0.3).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(px, py, radDot * 2.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(254, 240, 138, ${a.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(px, py, radDot, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 7. Draw detailed tanks
    this.drawTank(this.tanks[0], this.turn === 0 && !this.matchOver, 1);
    this.drawTank(this.tanks[1], this.turn === 1 && !this.matchOver, -1);

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

    // 9. Projectiles & glowing trails
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

      // Outer glow + shell head
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

    // 11. Dynamic expanding fireballs
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

    // 12. Particles (sparks & billowing smoke)
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, (pt.life / pt.maxLife) * (pt.kind === 'smoke' ? 0.65 : 1));
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(0.5, pt.size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 13. Flying tumbling debris chunks
    for (const d of this.debris) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, d.life / d.maxLife));
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.size * 0.5, -d.size * 0.4, d.size, d.size * 0.8);
      ctx.restore();
    }

    // 14. Bold outlined floating damage numbers
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
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(tank.x, tank.y);

    // Subtle ground contact shadow
    ctx.fillStyle = 'rgba(2, 6, 23, 0.48)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 22, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Active turn pulsing halo
    if (activeTurn) {
      const pulse = 0.65 + 0.35 * Math.sin(this.elapsed * 5);
      ctx.strokeStyle = `rgba(250, 204, 21, ${(0.75 * pulse).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -11, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Swaying whip antenna from turret rear
    const antX = -facing * 7;
    const antSway = Math.sin(this.elapsed * 4 + tank.x * 0.1) * 1.4 - this.wind * 0.25;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(antX, -20);
    ctx.quadraticCurveTo(antX + antSway * 0.5, -28, antX + antSway, -34);
    ctx.stroke();
    ctx.fillStyle = skin.accent;
    ctx.beginPath();
    ctx.arc(antX + antSway, -34, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Cannon barrel with recoil kick, bore evacuator & slotted muzzle brake
    const rad = (tank.angleDeg * Math.PI) / 180;
    const recoilOffset = tank.recoil * 5.2;
    ctx.save();
    ctx.translate(0, -14);
    ctx.rotate(-rad);
    ctx.translate(-recoilOffset, 0);

    // Trunnion collar
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, -4, 7, 8);
    // Main barrel tube with highlight
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(5, -3.5, 19, 7);
    ctx.fillStyle = skin.accent;
    ctx.fillRect(5, -2.5, 19, 4.8);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(5, -2.2, 18, 1.5);
    // Bore evacuator bulge
    ctx.fillStyle = skin.turret;
    ctx.fillRect(11, -3.4, 5, 6.8);
    // Muzzle brake
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(22, -3.8, 5, 7.6);
    ctx.fillStyle = skin.accent;
    ctx.fillRect(23, -3.2, 1.4, 6.4);

    // Muzzle flash
    if (tank.muzzleFlash > 0) {
      const f = tank.muzzleFlash / 0.14;
      ctx.fillStyle = `rgba(254, 240, 138, ${f.toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(31, 0, 9 * f + 2, 5 * f + 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Shaded cylindrical turret dome + commander cupola hatch
    const turretGrad = ctx.createLinearGradient(-10, -24, 10, -13);
    turretGrad.addColorStop(0, skin.accent);
    turretGrad.addColorStop(0.35, skin.turret);
    turretGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = turretGrad;
    ctx.beginPath();
    ctx.arc(0, -14, 9.5, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Commander cupola hatch & periscope visor
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.roundRect(-4.5, -25.5, 9, 3.5, 1.5);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(facing > 0 ? 1 : -3.5, -24.5, 2.5, 1.3);

    // Turret rivets
    ctx.fillStyle = 'rgba(248, 250, 252, 0.55)';
    for (const rx of [-5.5, 0, 5.5]) {
      ctx.beginPath();
      ctx.arc(rx, -16.2, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sloped armored hull + rear exhaust + front headlight
    const hullGrad = ctx.createLinearGradient(0, -16, 0, -5);
    hullGrad.addColorStop(0, skin.turret);
    hullGrad.addColorStop(0.55, skin.body);
    hullGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(-16, -7);
    ctx.lineTo(-14, -14);
    ctx.lineTo(14, -14);
    ctx.lineTo(17, -7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,0.85)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Side armor skirt + hull rivets
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.roundRect(-16.5, -10.5, 33, 4.5, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(248, 250, 252, 0.65)';
    for (let rx = -13; rx <= 13; rx += 6.5) {
      ctx.beginPath();
      ctx.arc(rx, -8.3, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Exhaust muffler & headlight
    ctx.fillStyle = '#334155';
    ctx.fillRect(-facing * 15 - 1.5, -16.5, 3, 4);
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(facing * 15, -11.5, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Articulated caterpillar tracks + tread teeth + 5 rotating roadwheels
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-19, -7.5, 38, 8.8, 4.4);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Tread blocks around belt
    ctx.fillStyle = '#334155';
    for (let tx = -15; tx <= 14; tx += 4.5) {
      ctx.fillRect(tx, -8.1, 2.2, 1.2);
      ctx.fillRect(tx, 0.4, 2.2, 1.2);
    }

    // 5 metallic roadwheels with spinning hub spokes
    for (let wi = -2; wi <= 2; wi++) {
      const wx = wi * 7;
      const wy = -3.1;
      const wr = Math.abs(wi) === 2 ? 2.8 : 3.2;
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(wx, wy, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(wx, wy, wr * 0.52, 0, Math.PI * 2);
      ctx.fill();
      // Wheel spoke glint
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(tank.wheelSpin) * wr * 0.8, wy + Math.sin(tank.wheelSpin) * wr * 0.8);
      ctx.stroke();
    }

    // Hit flash overlay
    if (tank.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.65, tank.hitFlash * 4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-20, -26, 40, 28, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // HP bar & nameplate above tank
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(-21, -40, 42, 7, 3);
    ctx.fill();
    ctx.fillStyle = tank.hp > 50 ? '#22c55e' : tank.hp > 25 ? '#f59e0b' : '#ef4444';
    const hpW = Math.max(0, 38 * (tank.hp / tank.maxHp));
    if (hpW > 0) {
      ctx.beginPath();
      ctx.roundRect(-19, -38.8, hpW, 4.6, 2);
      ctx.fill();
    }

    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.strokeText(tank.label, 0, -44);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(tank.label, 0, -44);

    ctx.restore();
  }
}
