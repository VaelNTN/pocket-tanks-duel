import './style.css';
import {
  fetchGlobalPocketTanksHighscores,
  GlobalPocketTanksEntry,
  submitGlobalPocketTanksScore,
} from './api/highscores';
import { TANK_SKINS, WEAPONS, WeaponId } from './data/tanks';
import { SoundFX } from './game/SoundFX';
import { GameMode, HudSnapshot, MatchEndInfo, TanksStage } from './game/TanksStage';
import {
  loadPocketTanksState,
  PocketTanksState,
  recordPocketTanksMatch,
  resolveDeviceId,
  savePocketTanksState,
} from './storage/state';

type ScreenId = 'home' | 'game' | 'highscores' | 'options';
type HsTab = 'global' | 'local';

let appState: PocketTanksState;
const sfx = new SoundFX();
let stage: TanksStage | null = null;
let hsTab: HsTab = 'global';
let selectedMode: GameMode = 'ai';

const root = document.getElementById('app') as HTMLElement;

root.innerHTML = `
  <section id="screen-home" class="screen home-screen">
    <div class="home-hero">
      <div class="emblem">💣</div>
      <h1 class="game-title">Pocket Tanks Duel</h1>
      <p class="game-subtitle">10 weapons, wind &amp; craters</p>
      <div id="home-best" class="best-pill">🏆 Best Score: 0</div>
    </div>
    <div class="home-actions">
      <button id="btn-play-ai" class="btn btn-primary">🤖 1P vs CPU</button>
      <button id="btn-play-pvp" class="btn btn-secondary">⚔️ 2P Duel</button>
      <button id="btn-highscores" class="btn btn-secondary">🏆 Leaderboard</button>
      <button id="btn-options" class="btn btn-secondary">⚙️ Tank Setup</button>
    </div>
  </section>

  <section id="screen-game" class="screen game-screen hidden">
    <div class="arena-wrap">
      <canvas id="tanks-canvas" class="game-canvas"></canvas>
      <div class="game-top-bar">
        <button id="btn-game-home" class="btn-small">← Menu</button>
        <div class="hud-badges">
          <span id="hud-turn" class="hud-pill">Turn: YOU</span>
          <span id="hud-wind" class="hud-pill">🌬️ 0.0</span>
          <span id="hud-round" class="hud-pill">Round 1 · 0 pt</span>
        </div>
        <button id="btn-game-sound" class="btn-small">🔊</button>
      </div>

      <div id="gameover-card" class="gameover-card hidden">
        <h2 id="go-title" style="margin:0;color:#fde047;">Victory!</h2>
        <div id="go-sub" style="font-size:0.95rem;color:#cbd5e1;"></div>
        <button id="btn-next-round" class="btn btn-primary">➡️ Next Round</button>
        <button id="btn-retry-match" class="btn btn-secondary">🔄 Retry</button>
        <button id="btn-go-hs" class="btn btn-secondary">🏆 Leaderboard</button>
        <button id="btn-go-menu" class="btn btn-secondary">🏠 Menu</button>
      </div>
    </div>

    <div class="controls-dock">
      <div id="weapon-strip" class="weapon-strip"></div>
      <div id="weapon-info" class="weapon-info"></div>
      <div class="control-grid">
        <div class="ctrl-box">
          <div class="ctrl-head"><span>Angle</span><span id="lbl-angle">45°</span></div>
          <div class="ctrl-row">
            <button id="btn-ang-down" class="ctrl-step" aria-label="Decrease angle">-</button>
            <input id="rng-angle" class="ctrl-range" type="range" min="5" max="175" value="45" />
            <button id="btn-ang-up" class="ctrl-step" aria-label="Increase angle">+</button>
          </div>
        </div>
        <div class="ctrl-box">
          <div class="ctrl-head"><span>Power</span><span id="lbl-power">68%</span></div>
          <div class="ctrl-row">
            <button id="btn-pwr-down" class="ctrl-step" aria-label="Decrease power">-</button>
            <input id="rng-power" class="ctrl-range" type="range" min="15" max="100" value="68" />
            <button id="btn-pwr-up" class="ctrl-step" aria-label="Increase power">+</button>
          </div>
        </div>
        <div class="fire-col">
          <div class="move-row">
            <button id="btn-move-left" class="btn-move" aria-label="Move left">◀</button>
            <button id="btn-move-right" class="btn-move" aria-label="Move right">▶</button>
          </div>
          <button id="btn-fire" class="btn-fire">🔥 Fire!</button>
        </div>
      </div>
    </div>
  </section>

  <section id="screen-highscores" class="screen hidden">
    <div class="top-nav">
      <button id="btn-hs-back" class="btn-small">← Back</button>
      <h2 id="hs-heading" class="screen-heading">🏆 Leaderboard</h2>
      <button id="btn-hs-refresh" class="btn-small">↻</button>
    </div>
    <div id="hs-status-banner" class="hs-status-banner">📱 Offline Mode — Local Highscores</div>
    <div class="hs-tabs">
      <button id="tab-global" class="hs-tab active">🌍 Global</button>
      <button id="tab-local" class="hs-tab">📱 Local</button>
    </div>
    <div id="dev-server-row" class="server-box hidden">
      <label class="section-label" style="margin:0;">Developer Endpoint URL</label>
      <div style="display:flex;gap:8px;">
        <input id="inp-api-url" class="name-input" type="url" placeholder="https://example.com" />
        <button id="btn-save-url" class="btn-small">Save</button>
      </div>
    </div>
    <div id="hs-list" class="hs-list"></div>
  </section>

  <section id="screen-options" class="screen hidden">
    <div class="top-nav">
      <button id="btn-opt-back" class="btn-small">← Back</button>
      <h2 class="screen-heading">⚙️ Tank Setup</h2>
      <span style="width:52px;"></span>
    </div>
    <div class="options-scroll">
      <div>
        <label class="section-label" for="inp-player-name">Commander Name</label>
        <input id="inp-player-name" class="name-input" type="text" maxlength="20" placeholder="TankCommander" />
      </div>
      <div>
        <label class="section-label">Tank Armor</label>
        <div id="skin-grid" class="skin-grid"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface);padding:12px 14px;border-radius:14px;border:1px solid var(--border);">
        <span style="font-weight:700;">🔊 Sound Effects</span>
        <button id="btn-opt-sound" class="btn-small">On</button>
      </div>
    </div>
  </section>
`;

let hsHeadingTapCount = 0;
let hsHeadingTapTimer: number | null = null;

function showScreen(id: ScreenId): void {
  (['home', 'game', 'highscores', 'options'] as ScreenId[]).forEach((s) => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('hidden', s !== id);
  });
  if (id !== 'game' && stage) {
    stage.stop();
  }
  if (id === 'home') updateHomePill();
  if (id === 'highscores') renderHighscores();
  if (id === 'options') renderOptions();
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updateHomePill(): void {
  const pill = document.getElementById('home-best');
  if (pill) {
    pill.textContent = `🏆 Best: ${appState.bestScore} pt · ${appState.totalWins} wins`;
  }
}

function renderWeaponStrip(activeId: WeaponId): void {
  const strip = document.getElementById('weapon-strip');
  const infoEl = document.getElementById('weapon-info');
  if (infoEl) {
    const active = WEAPONS.find((w) => w.id === activeId) || WEAPONS[0];
    infoEl.textContent = `${active.icon} ${active.name} · DMG ${active.damage} — ${active.desc}`;
  }
  if (!strip) return;
  strip.innerHTML = WEAPONS.map(
    (w) =>
      `<button class="weapon-chip ${w.id === activeId ? 'active' : ''}" data-weapon="${w.id}" title="${escapeHtml(w.desc)}">${w.icon} ${escapeHtml(w.shortName)}</button>`
  ).join('');
  strip.querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach((btn) => {
    btn.onclick = () => {
      const wid = btn.dataset.weapon as WeaponId;
      stage?.setWeapon(wid);
      renderWeaponStrip(wid);
    };
  });
}

function updateHud(hud: HudSnapshot): void {
  const turnEl = document.getElementById('hud-turn');
  const windEl = document.getElementById('hud-wind');
  const roundEl = document.getElementById('hud-round');
  const angLbl = document.getElementById('lbl-angle');
  const pwrLbl = document.getElementById('lbl-power');
  const rngAngle = document.getElementById('rng-angle') as HTMLInputElement | null;
  const rngPower = document.getElementById('rng-power') as HTMLInputElement | null;
  const btnFire = document.getElementById('btn-fire') as HTMLButtonElement | null;

  if (turnEl) {
    turnEl.textContent =
      hud.turn === 0
        ? `Turn: YOU (${hud.p1Hp}%)`
        : `Turn: ${hud.mode === 'ai' ? 'CPU' : 'P2'} (${hud.p2Hp}%)`;
  }
  if (windEl) {
    const arrow = hud.wind > 0.3 ? '→' : hud.wind < -0.3 ? '←' : '•';
    windEl.textContent = `🌬️ ${arrow} ${Math.abs(hud.wind).toFixed(1)}`;
  }
  if (roundEl) {
    roundEl.textContent = `Round ${hud.round} · ${hud.score} pt`;
  }
  if (angLbl) angLbl.textContent = `${hud.angle}°`;
  if (pwrLbl) pwrLbl.textContent = `${hud.power}%`;
  if (rngAngle) rngAngle.value = String(hud.angle);
  if (rngPower) rngPower.value = String(hud.power);
  if (btnFire) btnFire.disabled = hud.busy || (hud.mode === 'ai' && hud.turn === 1);
}

function handleMatchEnd(info: MatchEndInfo): void {
  const card = document.getElementById('gameover-card');
  const title = document.getElementById('go-title');
  const sub = document.getElementById('go-sub');
  const nextBtn = document.getElementById('btn-next-round');
  if (!card || !title || !sub || !nextBtn) return;

  const won = info.winner === 0;
  if (info.mode === 'ai') {
    recordPocketTanksMatch(appState, info.score, won, info.streak);
    if (appState.apiBaseUrl && info.score > 0) {
      submitGlobalPocketTanksScore(appState.apiBaseUrl, {
        deviceId: appState.deviceId,
        playerName: appState.playerName,
        score: info.score,
        wins: appState.totalWins,
        bestStreak: appState.bestStreak,
        tankSkin: appState.tankSkin,
      });
    }
    title.textContent = won ? `🎉 Round ${info.round} Won!` : '💥 Defeated!';
    sub.textContent = `Score: ${info.score} pt · Win streak: ${info.streak}`;
    nextBtn.classList.toggle('hidden', !won);
  } else {
    title.textContent = won ? '🏆 Player 1 Wins!' : '🏆 Player 2 Wins!';
    sub.textContent = 'Great artillery duel!';
    nextBtn.classList.remove('hidden');
  }
  card.classList.remove('hidden');
}

function syncGameSoundBtn(): void {
  const sndBtn = document.getElementById('btn-game-sound');
  if (sndBtn) sndBtn.textContent = appState.soundEnabled ? '🔊' : '🔇';
}

function startGame(mode: GameMode): void {
  selectedMode = mode;
  document.getElementById('gameover-card')?.classList.add('hidden');
  showScreen('game');
  syncGameSoundBtn();
  renderWeaponStrip('standard');

  const canvas = document.getElementById('tanks-canvas') as HTMLCanvasElement;
  if (!stage) {
    stage = new TanksStage(canvas, sfx, updateHud, handleMatchEnd);
  }
  stage.setWeapon('standard');
  stage.startNewCampaign(mode, appState.tankSkin);
}

function renderOptions(): void {
  const nameInp = document.getElementById('inp-player-name') as HTMLInputElement | null;
  if (nameInp) nameInp.value = appState.playerName;

  const grid = document.getElementById('skin-grid');
  if (grid) {
    grid.innerHTML = TANK_SKINS.map(
      (s) => `
      <button class="skin-card ${appState.tankSkin === s.id ? 'selected' : ''}" data-skin="${s.id}">
        <span class="swatch" style="background:${s.turret};"></span>
        <span>${escapeHtml(s.name)}</span>
      </button>`
    ).join('');
    grid.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((btn) => {
      btn.onclick = () => {
        appState.tankSkin = Number(btn.dataset.skin);
        savePocketTanksState(appState);
        renderOptions();
      };
    });
  }

  const sndBtn = document.getElementById('btn-opt-sound');
  if (sndBtn) sndBtn.textContent = appState.soundEnabled ? 'On' : 'Off';
}

function updateHsStatusBanner(online: boolean): void {
  const banner = document.getElementById('hs-status-banner');
  if (!banner) return;
  banner.textContent = online ? '🌐 Online Leaderboard' : '📱 Offline Mode — Local Highscores';
}

async function renderHighscores(): Promise<void> {
  const list = document.getElementById('hs-list');
  const urlInp = document.getElementById('inp-api-url') as HTMLInputElement | null;
  if (urlInp) urlInp.value = appState.apiBaseUrl;
  document.getElementById('tab-global')?.classList.toggle('active', hsTab === 'global');
  document.getElementById('tab-local')?.classList.toggle('active', hsTab === 'local');
  if (!list) return;

  if (hsTab === 'local') {
    updateHsStatusBanner(Boolean(appState.apiBaseUrl));
    if (appState.highscores.length === 0) {
      list.innerHTML = `<div class="hs-row"><span class="hs-meta">No scores recorded yet. Start a duel!</span></div>`;
      return;
    }
    list.innerHTML = appState.highscores
      .map(
        (h, i) => `
      <div class="hs-row me">
        <div class="hs-left">
          <span class="hs-rank">#${i + 1}</span>
          <div>
            <div class="hs-name">${escapeHtml(h.playerName)}</div>
            <div class="hs-meta">${h.wins} wins · Streak ${h.bestStreak}</div>
          </div>
        </div>
        <span class="hs-score">${h.score} pt</span>
      </div>`
      )
      .join('');
    return;
  }

  if (!appState.apiBaseUrl) {
    updateHsStatusBanner(false);
    list.innerHTML = `<div class="hs-row"><span class="hs-meta">Playing offline. Switch to Local to view your personal bests!</span></div>`;
    return;
  }

  list.innerHTML = `<div class="hs-row"><span class="hs-meta">Loading leaderboard...</span></div>`;
  try {
    const res = await fetchGlobalPocketTanksHighscores(appState.apiBaseUrl, appState.deviceId);
    updateHsStatusBanner(true);
    if (!res.entries.length) {
      list.innerHTML = `<div class="hs-row"><span class="hs-meta">No global scores yet — set the first record!</span></div>`;
      return;
    }
    list.innerHTML = res.entries
      .map((e: GlobalPocketTanksEntry) => {
        const isMe = e.deviceId === appState.deviceId;
        return `
        <div class="hs-row ${isMe ? 'me' : ''}">
          <div class="hs-left">
            <span class="hs-rank">#${e.rank}</span>
            <div>
              <div class="hs-name">${escapeHtml(e.playerName)} ${isMe ? '(You)' : ''}</div>
              <div class="hs-meta">${e.wins} wins · Streak ${e.bestStreak}</div>
            </div>
          </div>
          <span class="hs-score">${e.score} pt</span>
        </div>`;
      })
      .join('');
  } catch {
    updateHsStatusBanner(false);
    list.innerHTML = `<div class="hs-row"><span class="hs-meta">Leaderboard unreachable right now. Showing offline mode — switch to Local anytime.</span></div>`;
  }
}

async function init(): Promise<void> {
  const deviceId = await resolveDeviceId();
  appState = loadPocketTanksState(deviceId);
  sfx.enabled = appState.soundEnabled;
  updateHomePill();

  document.getElementById('btn-play-ai')?.addEventListener('click', () => startGame('ai'));
  document.getElementById('btn-play-pvp')?.addEventListener('click', () => startGame('pvp'));
  document.getElementById('btn-highscores')?.addEventListener('click', () => showScreen('highscores'));
  document.getElementById('btn-options')?.addEventListener('click', () => showScreen('options'));
  document.getElementById('btn-game-home')?.addEventListener('click', () => showScreen('home'));
  document.getElementById('btn-hs-back')?.addEventListener('click', () => showScreen('home'));
  document.getElementById('btn-opt-back')?.addEventListener('click', () => showScreen('home'));
  document.getElementById('btn-hs-refresh')?.addEventListener('click', () => renderHighscores());

  document.getElementById('hs-heading')?.addEventListener('click', () => {
    hsHeadingTapCount += 1;
    if (hsHeadingTapTimer !== null) window.clearTimeout(hsHeadingTapTimer);
    hsHeadingTapTimer = window.setTimeout(() => {
      hsHeadingTapCount = 0;
    }, 1500);
    if (hsHeadingTapCount >= 5) {
      hsHeadingTapCount = 0;
      document.getElementById('dev-server-row')?.classList.toggle('hidden');
    }
  });

  document.getElementById('tab-global')?.addEventListener('click', () => {
    hsTab = 'global';
    renderHighscores();
  });
  document.getElementById('tab-local')?.addEventListener('click', () => {
    hsTab = 'local';
    renderHighscores();
  });

  document.getElementById('btn-save-url')?.addEventListener('click', () => {
    const inp = document.getElementById('inp-api-url') as HTMLInputElement | null;
    appState.apiBaseUrl = (inp?.value || '').trim().replace(/\/+$/, '');
    savePocketTanksState(appState);
    renderHighscores();
  });

  const nameInput = document.getElementById('inp-player-name') as HTMLInputElement | null;
  nameInput?.addEventListener('input', (e) => {
    appState.playerName = (e.target as HTMLInputElement).value;
    savePocketTanksState(appState);
  });
  nameInput?.addEventListener('blur', (e) => {
    const clean = (e.target as HTMLInputElement).value.trim() || 'TankCommander';
    appState.playerName = clean;
    (e.target as HTMLInputElement).value = clean;
    savePocketTanksState(appState);
  });

  document.getElementById('btn-opt-sound')?.addEventListener('click', () => {
    appState.soundEnabled = !appState.soundEnabled;
    sfx.enabled = appState.soundEnabled;
    savePocketTanksState(appState);
    renderOptions();
  });

  document.getElementById('btn-game-sound')?.addEventListener('click', () => {
    appState.soundEnabled = !appState.soundEnabled;
    sfx.enabled = appState.soundEnabled;
    savePocketTanksState(appState);
    syncGameSoundBtn();
  });

  // Cannon controls
  document.getElementById('btn-ang-down')?.addEventListener('click', () => stage?.adjustAngle(-2));
  document.getElementById('btn-ang-up')?.addEventListener('click', () => stage?.adjustAngle(2));
  document.getElementById('rng-angle')?.addEventListener('input', (e) => {
    stage?.setAngle(Number((e.target as HTMLInputElement).value));
  });
  document.getElementById('btn-pwr-down')?.addEventListener('click', () => stage?.adjustPower(-3));
  document.getElementById('btn-pwr-up')?.addEventListener('click', () => stage?.adjustPower(3));
  document.getElementById('rng-power')?.addEventListener('input', (e) => {
    stage?.setPower(Number((e.target as HTMLInputElement).value));
  });
  document.getElementById('btn-move-left')?.addEventListener('click', () => stage?.moveTank(-1));
  document.getElementById('btn-move-right')?.addEventListener('click', () => stage?.moveTank(1));
  document.getElementById('btn-fire')?.addEventListener('click', () => stage?.fireCurrentWeapon());

  document.getElementById('btn-next-round')?.addEventListener('click', () => {
    document.getElementById('gameover-card')?.classList.add('hidden');
    stage?.nextRound();
  });
  document.getElementById('btn-retry-match')?.addEventListener('click', () => startGame(selectedMode));
  document.getElementById('btn-go-hs')?.addEventListener('click', () => showScreen('highscores'));
  document.getElementById('btn-go-menu')?.addEventListener('click', () => showScreen('home'));
}

init();
