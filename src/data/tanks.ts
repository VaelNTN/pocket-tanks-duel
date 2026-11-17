export interface TankSkin {
  id: number;
  name: string;
  body: string;
  turret: string;
  accent: string;
}

export const TANK_SKINS: TankSkin[] = [
  { id: 0, name: 'Olive Steel', body: '#4d7c0f', turret: '#65a30d', accent: '#bef264' },
  { id: 1, name: 'Desert Storm', body: '#b45309', turret: '#d97706', accent: '#fde68a' },
  { id: 2, name: 'Cobalt Titan', body: '#1d4ed8', turret: '#2563eb', accent: '#93c5fd' },
  { id: 3, name: 'Magma Core', body: '#991b1b', turret: '#dc2626', accent: '#fca5a5' },
  { id: 4, name: 'Neon Cyber', body: '#6d28d9', turret: '#8b5cf6', accent: '#5eead4' },
  { id: 5, name: 'Gold General', body: '#ca8a04', turret: '#eab308', accent: '#fef08a' },
];

export type WeaponId =
  | 'standard'
  | 'splitter'
  | 'nuke'
  | 'bouncer'
  | 'firerain'
  | 'quake'
  | 'seeker'
  | 'digger'
  | 'laser'
  | 'mound';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  shortName: string;
  icon: string;
  damage: number;
  radius: number;
  color: string;
  desc: string;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'standard',
    name: 'Standard Shell',
    shortName: 'Standard',
    icon: '💣',
    damage: 34,
    radius: 34,
    color: '#fbbf24',
    desc: 'Reliable artillery shell with a medium crater.',
  },
  {
    id: 'splitter',
    name: '3-Way Cluster',
    shortName: '3-Split',
    icon: '🔱',
    damage: 22,
    radius: 26,
    color: '#38bdf8',
    desc: 'Splits at the peak into 3 warheads.',
  },
  {
    id: 'nuke',
    name: 'Mini Nuke',
    shortName: 'Mini Nuke',
    icon: '☢️',
    damage: 64,
    radius: 72,
    color: '#a3e635',
    desc: 'Massive mushroom blast and deep crater!',
  },
  {
    id: 'bouncer',
    name: 'Bouncer Bomb',
    shortName: 'Bouncer',
    icon: '🏀',
    damage: 38,
    radius: 34,
    color: '#fb923c',
    desc: 'Bounces 3 times across hills before detonation.',
  },
  {
    id: 'firerain',
    name: 'Fire Rain',
    shortName: 'Fire Rain',
    icon: '🔥',
    damage: 16,
    radius: 22,
    color: '#f87171',
    desc: 'Drops 5 fireballs across the target area.',
  },
  {
    id: 'quake',
    name: 'Earthquake',
    shortName: 'Quake',
    icon: '🌋',
    damage: 45,
    radius: 58,
    color: '#c084fc',
    desc: 'Wide seismic shockwave across the valley.',
  },
  {
    id: 'seeker',
    name: 'Homing Missile',
    shortName: 'Seeker',
    icon: '🚀',
    damage: 30,
    radius: 28,
    color: '#2dd4bf',
    desc: 'Steers gently toward the enemy while descending.',
  },
  {
    id: 'digger',
    name: 'Tunnel Digger',
    shortName: 'Digger',
    icon: '🌀',
    damage: 48,
    radius: 40,
    color: '#f472b6',
    desc: 'Burrows beneath the terrain and blasts from below.',
  },
  {
    id: 'laser',
    name: 'Sniper Laser',
    shortName: 'Laser',
    icon: '⚡',
    damage: 36,
    radius: 20,
    color: '#60a5fa',
    desc: 'Dead-straight beam unaffected by wind or gravity.',
  },
  {
    id: 'mound',
    name: 'Sand Shield',
    shortName: 'Mound',
    icon: '⛰️',
    damage: 18,
    radius: 46,
    color: '#fcd34d',
    desc: 'Raises a steep sand barrier on impact!',
  },
];
