export interface TankSkin {
  id: number;
  name: string;
  body: string;
  turret: string;
  accent: string;
}

export const TANK_SKINS: TankSkin[] = [
  { id: 0, name: 'Olijf Staal', body: '#4d7c0f', turret: '#65a30d', accent: '#bef264' },
  { id: 1, name: 'Woestijn Storm', body: '#b45309', turret: '#d97706', accent: '#fde68a' },
  { id: 2, name: 'Kobalt Titan', body: '#1d4ed8', turret: '#2563eb', accent: '#93c5fd' },
  { id: 3, name: 'Magma Vuur', body: '#991b1b', turret: '#dc2626', accent: '#fca5a5' },
  { id: 4, name: 'Neon Cyber', body: '#6d28d9', turret: '#8b5cf6', accent: '#5eead4' },
  { id: 5, name: 'Goud Generaal', body: '#ca8a04', turret: '#eab308', accent: '#fef08a' },
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
    name: 'Standaard Granaat',
    shortName: 'Standaard',
    icon: '💣',
    damage: 34,
    radius: 34,
    color: '#fbbf24',
    desc: 'Betrouwbare artillerie-inslag met medium krater.',
  },
  {
    id: 'splitter',
    name: '3-Splitter Cluster',
    shortName: '3-Split',
    icon: '🔱',
    damage: 22,
    radius: 26,
    color: '#38bdf8',
    desc: 'Splitst op het hoogste punt in 3 granaten.',
  },
  {
    id: 'nuke',
    name: 'Mini Nuke',
    shortName: 'Mini Nuke',
    icon: '☢️',
    damage: 64,
    radius: 72,
    color: '#a3e635',
    desc: 'Enorme paddenstoel-explosie en diepe krater!',
  },
  {
    id: 'bouncer',
    name: 'Stuiterbom',
    shortName: 'Stuiter',
    icon: '🏀',
    damage: 38,
    radius: 34,
    color: '#fb923c',
    desc: 'Stuitert 3 keer over heuvels voor de klap.',
  },
  {
    id: 'firerain',
    name: 'Vuurregen',
    shortName: 'Vuurregen',
    icon: '🔥',
    damage: 16,
    radius: 22,
    color: '#f87171',
    desc: 'Laat 6 brandbommen neerdalen op het doelgebied.',
  },
  {
    id: 'quake',
    name: 'Aardbeving',
    shortName: 'Beving',
    icon: '🌋',
    damage: 45,
    radius: 58,
    color: '#c084fc',
    desc: 'Brede seismische schokgolf door de hele vallei.',
  },
  {
    id: 'seeker',
    name: 'Zoekraket',
    shortName: 'Zoekraket',
    icon: '🚀',
    damage: 30,
    radius: 28,
    color: '#2dd4bf',
    desc: 'Stuurt tijdens de daling licht richting vijand.',
  },
  {
    id: 'digger',
    name: 'Boorgranaat',
    shortName: 'Boor',
    icon: '🌀',
    damage: 48,
    radius: 40,
    color: '#f472b6',
    desc: 'Graaft door de grond omhoog en ontploft onderin.',
  },
  {
    id: 'laser',
    name: 'Sniper Laser',
    shortName: 'Laser',
    icon: '⚡',
    damage: 36,
    radius: 20,
    color: '#60a5fa',
    desc: 'Kaarsrechte straal zonder wind- of zwaartekracht.',
  },
  {
    id: 'mound',
    name: 'Zandheuvel',
    shortName: 'Heuvel',
    icon: '⛰️',
    damage: 18,
    radius: 46,
    color: '#fcd34d',
    desc: 'Bouwt een steile zandwal rond het inslagpunt!',
  },
];
