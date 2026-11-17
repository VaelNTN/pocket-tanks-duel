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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
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
  private stars: { x: number; y: number; r: number; a: number }[] = [];
  private tanks: [TankEntity, TankEntity];
  private projectiles: Projectile[] = [];
  private explosions: Explosion[] = [];
  private particles: Particle[] = [];
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

  private rafId: number | null = null;
  private lastTs = 0;
  private playerSkinId = 0;

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

    for (let i = 0; i < 110; i++) {
      this.stars.push({
        x: Math.random() * WORLD_W,
        y: -650 + Math.random() * (WORLD_H * 0.65 + 650),
        r: 0.8 + Math.random() * 1.8,
        a: 0.35 + Math.random() * 0.65,
      });
    }

    this.tanks = [
      { x: 140, y: 300, hp: 100, maxHp: 100, angleDeg: 42, power: 68, fuel: 100, skinId: 0, label: 'P1' },
      { x: 760, y: 300, hp: 100, maxHp: 100, angleDeg: 138, power: 68, fuel: 100, skinId: 3, label: 'CPU' },
    ];

    this.attachPointerAim();
  }

  public startNewCampaign(mode: GameMode, playerSkinId: number): void {
    this.mode = mode;
    this.playerSkinId = playerSkinId;
    this.round = 1;
    this.score = 0;
    this.streak = 0;
    this.setupRound();
    this.startLoop();
  }

  public nextRound(): void {
    this.round += 1;
    this.setupRound();
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public setWeapon(id: WeaponId): void {
    this.selectedWeapon = id;
    this.emitHud();
  }

  public adjustAngle(delta: number): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1)) return;
    const t = this.tanks[this.turn];
    t.angleDeg = Math.max(5, Math.min(175, Math.round(t.angleDeg + delta)));
    this.emitHud();
  }

  public setAngle(deg: number): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1)) return;
    const t = this.tanks[this.turn];
    t.angleDeg = Math.max(5, Math.min(175, Math.round(deg)));
    this.emitHud();
  }

  public adjustPower(delta: number): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1)) return;
    const t = this.tanks[this.turn];
    t.power = Math.max(15, Math.min(100, Math.round(t.power + delta)));
    this.emitHud();
  }

  public setPower(pwr: number): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1)) return;
    const t = this.tanks[this.turn];
    t.power = Math.max(15, Math.min(100, Math.round(pwr)));
    this.emitHud();
  }

  public moveTank(dir: -1 | 1): void {
    if (this.isBusy() || (this.mode === 'ai' && this.turn === 1)) return;
    const t = this.tanks[this.turn];
    if (t.fuel <= 0) return;
    const nextX = Math.max(32, Math.min(WORLD_W - 32, t.x + dir * 16));
    const currentGround = this.sampleTerrain(t.x);
    const nextGround = this.sampleTerrain(nextX);
    if (currentGround - nextGround > 26) return; // too steep
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
        x: x1,
        y: this.sampleTerrain(x1),
        hp: 100,
        maxHp: 100,
        angleDeg: 45,
        power: 68,
        fuel: 100,
        skinId: this.playerSkinId,
        label: 'YOU',
      },
      {
        x: x2,
        y: this.sampleTerrain(x2),
        hp: 100,
        maxHp: 100,
        angleDeg: 135,
        power: 68,
        fuel: 100,
        skinId: aiSkin,
        label: this.mode === 'ai' ? `CPU Lv.${this.round}` : 'P2',
      },
    ];
    this.projectiles = [];
    this.explosions = [];
    this.particles = [];
    this.floats = [];
    this.turn = 0;
    this.matchOver = false;
    this.aiTimer = 0;
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
    }
  }

  private sampleTerrain(x: number): number {
    const ix = Math.max(0, Math.min(WORLD_W - 1, Math.round(x)));
    return this.terrain[ix];
  }

  private isBusy(): boolean {
    return this.projectiles.length > 0 || this.aiTimer > 0;
  }

  private launchWeapon(owner: 0 | 1, weaponId: WeaponId): void {
    const t = this.tanks[owner];
    const rad = (t.angleDeg * Math.PI) / 180;
    const barrelLen = 24;
    const mx = t.x + Math.cos(rad) * barrelLen;
    const my = t.y - 12 - Math.sin(rad) * barrelLen;

    if (weaponId === 'laser') {
      this.sfx.fire(true);
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
        trail: [],
      });
    }
    this.emitHud();
  }

  private fireLaserRay(sx: number, sy: number, rad: number, owner: 0 | 1): void {
    const dx = Math.cos(rad);
    const dy = -Math.sin(rad);
    let hx = sx;
    let hy = sy;
    for (let step = 4; step < 1100; step += 4) {
      const cx = sx + dx * step;
      const cy = sy + dy * step;
      if (cx < 0 || cx >= WORLD_W || cy > WORLD_H) {
        hx = cx;
        hy = cy;
        break;
      }
      const opp = this.tanks[owner === 0 ? 1 : 0];
      if (Math.hypot(cx - opp.x, cy - (opp.y - 10)) < 18 || cy >= this.sampleTerrain(cx)) {
        hx = cx;
        hy = cy;
        break;
      }
      hx = cx;
      hy = cy;
    }

    // Draw beam particles
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const px = sx + ((hx - sx) * i) / steps;
      const py = sy + ((hy - sy) * i) / steps;
      this.particles.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 35,
        vy: (Math.random() - 0.5) * 35,
        color: '#60a5fa',
        size: 3.5,
        life: 0.35,
        maxLife: 0.35,
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

  private update(dt: number): void {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 28);

    // Settle tanks onto terrain
    for (const t of this.tanks) {
      const gy = this.sampleTerrain(t.x);
      if (t.y < gy) t.y = Math.min(gy, t.y + 180 * dt);
      else t.y = gy;
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 22) p.trail.shift();

      if (p.digging > 0) {
        p.x += p.vx * 0.45 * dt;
        p.y += p.vy * 0.45 * dt;
        p.vy += GRAVITY * 0.4 * dt;
        p.digging -= dt;
        if (p.digging <= 0) {
          this.triggerExplosion(p);
          this.projectiles.splice(i, 1);
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
      if (p.weaponId === 'splitter' && !p.splitDone && p.vy > 10 && p.age > 0.25) {
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

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 120 * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    // Float texts
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y += f.vy * dt;
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
    const isMound = def.id === 'mound';
    const big = def.radius >= 50;
    this.sfx.explode(big);
    this.shake = big ? 12 : 6;

    this.explosions.push({
      x: cx,
      y: cy,
      radius: def.radius,
      color: def.color,
      life: 0.42,
      maxLife: 0.42,
      isMound,
    });

    for (let i = 0; i < (big ? 34 : 18); i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * (big ? 210 : 130);
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 45,
        color: i % 2 === 0 ? def.color : '#ffffff',
        size: 2.5 + Math.random() * 4,
        life: 0.4 + Math.random() * 0.45,
        maxLife: 0.85,
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
        this.terrain[x] = Math.max(115, this.terrain[x] - span * 0.85);
      } else {
        const craterBottom = cy + span * 0.92;
        if (craterBottom > this.terrain[x]) {
          this.terrain[x] = Math.min(WORLD_H - 14, craterBottom);
        }
      }
    }

    // Damage tanks in blast radius
    const blastRange = def.radius + 18;
    for (let ti = 0; ti < 2; ti++) {
      const tk = this.tanks[ti];
      const dist = Math.hypot(tk.x - cx, (tk.y - 10) - cy);
      if (dist <= blastRange) {
        const falloff = Math.max(0.25, 1 - dist / (blastRange + 8));
        const dmg = Math.max(4, Math.round(def.damage * falloff));
        tk.hp = Math.max(0, tk.hp - dmg);
        this.floats.push({
          x: tk.x,
          y: tk.y - 34,
          vy: -38,
          text: `-${dmg}`,
          color: ti === 1 ? '#fde047' : '#f87171',
          life: 1.05,
        });
        if (attacker === 0 && ti === 1) {
          this.score += dmg * 10;
        }
      }
    }

    // Check match end
    if (this.tanks[0].hp <= 0 || this.tanks[1].hp <= 0) {
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

    // Ballistic solver across angles to find near-hit + slight human-like inaccuracy decreasing with round
    let bestAngle = 135;
    let bestPower = 68;
    let bestDist = Infinity;

    for (let angle = 112; angle <= 158; angle += 4) {
      for (let power = 35; power <= 96; power += 4) {
        const rad = (angle * Math.PI) / 180;
        let x = ai.x + Math.cos(rad) * 24;
        let y = ai.y - 12 - Math.sin(rad) * 24;
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
    const scaleX = cssW / WORLD_W;
    const scaleY = cssH / WORLD_H;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (cssW - WORLD_W * scale) * 0.5;
    const offsetY = cssH - WORLD_H * scale;
    const skyTopWorldY = -offsetY / scale;
    const leftWorldX = -offsetX / scale;
    const viewWorldW = cssW / scale;
    const viewWorldH = cssH / scale;
    return { scale, offsetX, offsetY, skyTopWorldY, leftWorldX, viewWorldW, viewWorldH };
  }

  private attachPointerAim(): void {
    const toWorld = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const t = this.getViewTransform(Math.max(1, rect.width), Math.max(1, rect.height));
      return {
        x: (clientX - rect.left - t.offsetX) / t.scale,
        y: (clientY - rect.top - t.offsetY) / t.scale,
      };
    };

    const aimAt = (clientX: number, clientY: number) => {
      if (this.isBusy() || (this.mode === 'ai' && this.turn === 1) || this.matchOver) return;
      const w = toWorld(clientX, clientY);
      const t = this.tanks[this.turn];
      const dx = w.x - t.x;
      const dy = (t.y - 12) - w.y;
      if (dy < -10) return;
      const deg = Math.round((Math.atan2(Math.max(4, dy), dx) * 180) / Math.PI);
      const dist = Math.hypot(dx, dy);
      t.angleDeg = Math.max(5, Math.min(175, deg));
      t.power = Math.max(18, Math.min(100, Math.round((dist / 240) * 100)));
      this.emitHud();
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      this.draggingAim = true;
      aimAt(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', (e) => {
      if (this.draggingAim) aimAt(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', () => {
      this.draggingAim = false;
    });
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

    // Sky gradient covering full visible height (including extended portrait sky)
    const skyTop = Math.min(0, vt.skyTopWorldY) - 20;
    const sky = ctx.createLinearGradient(0, skyTop, 0, WORLD_H);
    sky.addColorStop(0, '#070d1c');
    sky.addColorStop(0.55, '#172338');
    sky.addColorStop(1, '#334155');
    ctx.fillStyle = sky;
    ctx.fillRect(vt.leftWorldX - 20, skyTop, vt.viewWorldW + 40, WORLD_H - skyTop + 40);

    // Stars across full sky
    for (const s of this.stars) {
      if (s.y < skyTop) continue;
      ctx.fillStyle = `rgba(255,255,255,${s.a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant silhouette mountains
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H + 20);
    for (let x = 0; x <= WORLD_W; x += 60) {
      const mh = 250 + Math.sin(x * 0.012) * 45 + Math.cos(x * 0.024) * 25;
      ctx.lineTo(x, mh);
    }
    ctx.lineTo(WORLD_W, WORLD_H + 20);
    ctx.closePath();
    ctx.fill();

    // Foreground destructible terrain
    const groundGrad = ctx.createLinearGradient(0, 160, 0, WORLD_H);
    groundGrad.addColorStop(0, '#65a30d');
    groundGrad.addColorStop(0.18, '#3f6212');
    groundGrad.addColorStop(0.45, '#57534e');
    groundGrad.addColorStop(1, '#1c1917');
    ctx.fillStyle = groundGrad;
    ctx.beginPath();
    ctx.moveTo(0, WORLD_H + 20);
    for (let x = 0; x < WORLD_W; x++) {
      ctx.lineTo(x, this.terrain[x]);
    }
    ctx.lineTo(WORLD_W, WORLD_H + 20);
    ctx.closePath();
    ctx.fill();

    // Top turf rim
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < WORLD_W; x++) {
      if (x === 0) ctx.moveTo(0, this.terrain[0]);
      else ctx.lineTo(x, this.terrain[x]);
    }
    ctx.stroke();

    // Aim trajectory dots for active human player
    if (!this.isBusy() && !this.matchOver && !(this.mode === 'ai' && this.turn === 1)) {
      const active = this.tanks[this.turn];
      const rad = (active.angleDeg * Math.PI) / 180;
      const sx = active.x + Math.cos(rad) * 24;
      const sy = active.y - 12 - Math.sin(rad) * 24;
      const vx = Math.cos(rad) * active.power * 6.8;
      const vy = -Math.sin(rad) * active.power * 6.8;
      for (let step = 1; step <= 8; step++) {
        const t = step * 0.08;
        const px = sx + vx * t + 0.5 * this.wind * 5.2 * t * t;
        const py = sy + vy * t + 0.5 * GRAVITY * t * t;
        ctx.fillStyle = `rgba(250, 204, 21, ${0.85 - step * 0.08})`;
        ctx.beginPath();
        ctx.arc(px, py, 3.2 - step * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw tanks
    this.drawTank(this.tanks[0], this.turn === 0 && !this.matchOver);
    this.drawTank(this.tanks[1], this.turn === 1 && !this.matchOver);

    // Draw projectiles & trails
    for (const p of this.projectiles) {
      const def = WEAPONS.find((w) => w.id === p.weaponId) || WEAPONS[0];
      if (p.trail.length > 1) {
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        p.trail.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw explosions
    for (const ex of this.explosions) {
      const p = ex.life / ex.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p * 0.85);
      ctx.fillStyle = ex.color;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius * (1.2 - p * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius * 0.45 * p, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw particles
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Floating damage text
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  private drawTank(tank: TankEntity, activeTurn: boolean): void {
    const skin = TANK_SKINS[tank.skinId] || TANK_SKINS[0];
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(tank.x, tank.y);

    // Highlight ring if active turn
    if (activeTurn) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -10, 24, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cannon barrel
    const rad = (tank.angleDeg * Math.PI) / 180;
    ctx.strokeStyle = skin.accent;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(Math.cos(rad) * 23, -12 - Math.sin(rad) * 23);
    ctx.stroke();

    // Tracks
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(-17, -7, 34, 9, 4);
    ctx.fill();

    // Hull
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.roundRect(-15, -14, 30, 9, 3);
    ctx.fill();

    // Turret dome
    ctx.fillStyle = skin.turret;
    ctx.beginPath();
    ctx.arc(0, -14, 8, Math.PI, 0);
    ctx.fill();

    // HP bar above tank
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fillRect(-20, -34, 40, 6);
    ctx.fillStyle = tank.hp > 50 ? '#22c55e' : tank.hp > 25 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(-19, -33, 38 * (tank.hp / tank.maxHp), 4);

    // Label
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tank.label, 0, -39);

    ctx.restore();
  }
}
