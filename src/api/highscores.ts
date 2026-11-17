export interface GlobalPocketTanksEntry {
  rank: number;
  deviceId: string;
  playerName: string;
  score: number;
  wins: number;
  bestStreak: number;
  tankSkin: number;
  updatedAt: string;
}

export interface GlobalPocketTanksResponse {
  ok: boolean;
  entries: GlobalPocketTanksEntry[];
  player: GlobalPocketTanksEntry | null;
}

function cleanUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export async function fetchGlobalPocketTanksHighscores(
  baseUrl: string,
  deviceId: string,
  limit = 50
): Promise<GlobalPocketTanksResponse> {
  const base = cleanUrl(baseUrl);
  if (!base) throw new Error('NO_BACKEND_URL');
  const res = await fetch(
    `${base}/api/pocket-tanks/highscores?limit=${limit}&deviceId=${encodeURIComponent(deviceId)}`,
    { method: 'GET' }
  );
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return (await res.json()) as GlobalPocketTanksResponse;
}

export async function submitGlobalPocketTanksScore(
  baseUrl: string,
  payload: {
    deviceId: string;
    playerName: string;
    score: number;
    wins: number;
    bestStreak: number;
    tankSkin: number;
  }
): Promise<void> {
  const base = cleanUrl(baseUrl);
  if (!base || payload.score <= 0) return;

  try {
    await fetch(`${base}/api/pocket-tanks/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: payload.deviceId,
        playerName: payload.playerName.trim() || 'TankCommandant',
        score: payload.score,
        wins: payload.wins,
        bestStreak: payload.bestStreak,
        tankSkin: payload.tankSkin,
      }),
    });
  } catch {
    // Offline fallback stays silent
  }
}
