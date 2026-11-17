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
    return {
      deviceId,
      apiBaseUrl:
        typeof p.apiBaseUrl === 'string' && p.apiBaseUrl.trim()
          ? p.apiBaseUrl.trim().replace(/\/+$/, '')
          : defaultApi,
      playerName:
        typeof p.playerName === 'string' && p.playerName.trim()
          ? p.playerName.trim()
          : 'TankCommander',
      tankSkin: typeof p.tankSkin === 'number' ? p.tankSkin : 0,
      soundEnabled: p.soundEnabled !== false,
      bestScore: Math.max(0, Number(p.bestScore || 0)),
      totalWins: Math.max(0, Number(p.totalWins || 0)),
      bestStreak: Math.max(0, Number(p.bestStreak || 0)),
      highscores: Array.isArray(p.highscores) ? p.highscores : [],
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
  if (wonMatch) state.totalWins += 1;
  if (streak > state.bestStreak) state.bestStreak = streak;
  if (score > state.bestScore) state.bestScore = score;
  if (score > 0) {
    const entry: PocketTanksHighscore = {
      id: `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      playerName: state.playerName.trim() || 'TankCommander',
      score,
      wins: state.totalWins,
      bestStreak: state.bestStreak,
      tankSkin: state.tankSkin,
      createdAt: new Date().toISOString(),
    };
    state.highscores = [entry, ...state.highscores].sort((a, b) => b.score - a.score).slice(0, 50);
  }
  savePocketTanksState(state);
}
