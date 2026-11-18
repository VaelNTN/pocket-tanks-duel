import { Device } from '@capacitor/device';

const SAVE_KEY = 'pocket_tanks_duel_save_v1';
const DEVICE_KEY = 'pocket_tanks_duel_device_v1';

export interface PocketTanksHighscore {
  id: string;
  playerName: string;
  score: number;
  wins: number;
  bestStreak: number;
  tankSkin: number;
  createdAt: string;
}

export interface PocketTanksState {
  deviceId: string;
  apiBaseUrl: string;
  playerName: string;
  tankSkin: number;
  soundEnabled: boolean;
  bestScore: number;
  totalWins: number;
  bestStreak: number;
  highscores: PocketTanksHighscore[];
}

function generateFallbackDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pt-${crypto.randomUUID()}`;
  }
  return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function resolveDeviceId(): Promise<string> {
  const cached = localStorage.getItem(DEVICE_KEY);
  try {
    const info = await Device.getId();
    if (info?.identifier && info.identifier.trim().length >= 4) {
      const id = `phone-${info.identifier.trim()}`;
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    }
  } catch {
    // Web fallback
  }
  if (cached && cached.trim().length >= 4) return cached;
  const fresh = generateFallbackDeviceId();
  localStorage.setItem(DEVICE_KEY, fresh);
  return fresh;
}

import { TANK_SKINS } from '../data/tanks';

function safeNonNegInt(val: unknown, fallback = 0): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function clampSkin(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(TANK_SKINS.length - 1, Math.floor(n)));
}

export function loadPocketTanksState(deviceId: string): PocketTanksState {
  const defaultApi = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL || '')
    .trim()
    .replace(/\/+$/, '');

  const base: PocketTanksState = {
    deviceId,
    apiBaseUrl: defaultApi,
    playerName: 'TankCommander',
    tankSkin: 0,
    soundEnabled: true,
    bestScore: 0,
    totalWins: 0,
    bestStreak: 0,
    highscores: [],
  };

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<PocketTanksState>;
    const rawHighscores = Array.isArray(p.highscores) ? p.highscores : [];
    const cleanHighscores: PocketTanksHighscore[] = [];
    for (const item of rawHighscores) {
      if (!item || typeof item !== 'object') continue;
      const sc = safeNonNegInt((item as Partial<PocketTanksHighscore>).score, -1);
      if (sc <= 0) continue;
      cleanHighscores.push({
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.slice(0, 64)
            : `pt-${cleanHighscores.length}`,
        playerName:
          typeof item.playerName === 'string' && item.playerName.trim()
            ? item.playerName.trim().slice(0, 24)
            : 'TankCommander',
        score: sc,
        wins: safeNonNegInt(item.wins, 0),
        bestStreak: safeNonNegInt(item.bestStreak, 0),
        tankSkin: clampSkin(item.tankSkin),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      });
    }
    return {
      deviceId,
      apiBaseUrl:
        typeof p.apiBaseUrl === 'string' && p.apiBaseUrl.trim()
          ? p.apiBaseUrl.trim().replace(/\/+$/, '')
          : defaultApi,
      playerName:
        typeof p.playerName === 'string' && p.playerName.trim()
          ? p.playerName.trim().slice(0, 24)
          : 'TankCommander',
      tankSkin: clampSkin(p.tankSkin),
      soundEnabled: p.soundEnabled !== false,
      bestScore: safeNonNegInt(p.bestScore, 0),
      totalWins: safeNonNegInt(p.totalWins, 0),
      bestStreak: safeNonNegInt(p.bestStreak, 0),
      highscores: cleanHighscores.sort((a, b) => b.score - a.score).slice(0, 50),
    };
  } catch {
    return base;
  }
}

export function savePocketTanksState(state: PocketTanksState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage issues
  }
}

export function recordPocketTanksMatch(
  state: PocketTanksState,
  score: number,
  wonMatch: boolean,
  streak: number
): void {
  const safeScore = safeNonNegInt(score, 0);
  const safeStreak = safeNonNegInt(streak, 0);
  if (wonMatch) state.totalWins += 1;
  if (safeStreak > state.bestStreak) state.bestStreak = safeStreak;
  if (safeScore > state.bestScore) state.bestScore = safeScore;
  if (safeScore > 0) {
    const entry: PocketTanksHighscore = {
      id: `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      playerName: (state.playerName || '').trim().slice(0, 24) || 'TankCommander',
      score: safeScore,
      wins: state.totalWins,
      bestStreak: state.bestStreak,
      tankSkin: clampSkin(state.tankSkin),
      createdAt: new Date().toISOString(),
    };
    state.highscores = [entry, ...state.highscores].sort((a, b) => b.score - a.score).slice(0, 50);
  }
  savePocketTanksState(state);
}
