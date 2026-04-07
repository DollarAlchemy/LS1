/* ═══════════════════════════════════════════════════════════════
   LUCKY SCRATCH — ARCADE LOTTERY
   script.js — Full game engine
   ═══════════════════════════════════════════════════════════════
   Sections:
   1. AUDIO ENGINE
   2. TICKET DEFINITIONS  (data-driven, add new ones easily)
   3. ECONOMY / GAME STATE
   4. RESULT GENERATION   (RNG logic per ticket type)
   5. SCRATCH CANVAS      (canvas masking + pointer events)
   6. UI / SCREEN MANAGER
   7. SHOP SCREEN
   8. SCRATCH SCREEN
   9. MODALS & OVERLAYS
  10. PARTICLES / JUICE
  11. BOOT
═══════════════════════════════════════════════════════════════ */


/* ════════════════════════════════════════════════════════════
   1. AUDIO ENGINE
   Uses Web Audio API to generate placeholder sounds without
   any external files. All tones are synthesized in-browser.
═══════════════════════════════════════════════════════════ */
const Audio = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  // Play a tone: freq, type, duration, volume, optional fade
  function tone(freq, type = 'sine', duration = 0.15, vol = 0.25, startFade = 0.05) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration + 0.02);
    } catch(e) { /* silently skip if audio blocked */ }
  }

  // Chord = multiple tones at once
  function chord(freqs, type = 'sine', duration = 0.3, vol = 0.15) {
    freqs.forEach((f, i) => setTimeout(() => tone(f, type, duration, vol), i * 20));
  }

  return {
    shopEnter: () => tone(440, 'triangle', 0.2, 0.15),
    click:     () => tone(880, 'square',   0.06, 0.08),
    buy:       () => { tone(523, 'triangle', 0.12, 0.2); setTimeout(() => tone(659, 'triangle', 0.15, 0.2), 80); },
    scratch:   () => {
      // White noise burst for scratch feel
      try {
        const c = getCtx();
        const bufSize = c.sampleRate * 0.04;
        const buf = c.createBuffer(1, bufSize, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        const gain = c.createGain();
        src.buffer = buf;
        src.connect(gain);
        gain.connect(c.destination);
        gain.gain.setValueAtTime(0.06, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
        src.start();
      } catch(e) {}
    },
    smallWin: () => chord([523, 659, 784], 'triangle', 0.25, 0.18),
    bigWin:   () => {
      const seq = [523, 659, 784, 1047];
      seq.forEach((f, i) => setTimeout(() => tone(f, 'triangle', 0.22, 0.22), i * 80));
      setTimeout(() => chord([523, 659, 784, 1047], 'triangle', 0.5, 0.15), 400);
    },
    loss: () => { tone(330, 'sawtooth', 0.15, 0.12); setTimeout(() => tone(220, 'sawtooth', 0.2, 0.1), 120); },
    back: () => tone(330, 'triangle', 0.1, 0.12),
  };
})();


/* ════════════════════════════════════════════════════════════
   2. TICKET DEFINITIONS
   Each ticket is a plain object. Add more objects to TICKETS[]
   to expand the game with zero other code changes.
═══════════════════════════════════════════════════════════ */
const TICKETS = [

  /* ── TICKET 1: Lucky 7s (Cheap) ────────────────────── */
  {
    id: 'lucky7',
    name: 'Lucky 7s',
    theme: 'Neon Casino',
    emoji: '🎰',
    tier: 'cheap',
    tierLabel: 'CLASSIC',
    price: 1,
    cssTheme: 'theme-lucky7',
    bgClass: 'bg-lucky7',
    accentClass: 'accent-lucky7',
    gridClass: 'grid-3x3',
    /* Prize table shown in buy modal */
    prizeTable: [
      '🍒 Three SEVENS   → $7',
      '⭐ Three STARS    → $3',
      '🎰 Three BARS     → $2',
      '✨ Any two match  → $1',
    ],
    /* Symbols used in cells */
    symbols: ['7️⃣','7️⃣','⭐','⭐','🎰','🎰','🍒','🍒','💎'],
    /* generateResult: returns { cells[], winAmount, winLabel, winType }
       Called once at buy time — result is pre-determined, then hidden */
    generateResult(price) {
      const syms = ['7️⃣','⭐','🎰','🍒','💎','🃏','🔔'];
      const cells = Array.from({length: 9}, () => syms[Math.floor(Math.random() * syms.length)]);

      // Count symbol frequencies
      const freq = {};
      cells.forEach(s => freq[s] = (freq[s] || 0) + 1);
      const maxCount = Math.max(...Object.values(freq));

      let winAmount = 0, winLabel = '', winType = 'loss';

      if (freq['7️⃣'] >= 3) { winAmount = 7; winLabel = 'THREE 7s!'; winType = 'big'; }
      else if (freq['⭐'] >= 3) { winAmount = 3; winLabel = 'THREE STARS!'; winType = 'win'; }
      else if (freq['🎰'] >= 3) { winAmount = 2; winLabel = 'THREE BARS!'; winType = 'win'; }
      else if (maxCount >= 2) { winAmount = 1; winLabel = 'MATCH!'; winType = 'win'; }

      return { cells, winAmount, winLabel, winType, layout: 'grid3x3' };
    }
  },

  /* ── TICKET 2: Pirate Gold (Mid) ────────────────────── */
  {
    id: 'pirate',
    name: "Pirate's Plunder",
    theme: 'Treasure Hunt',
    emoji: '🏴‍☠️',
    tier: 'mid',
    tierLabel: 'ADVENTURE',
    price: 3,
    cssTheme: 'theme-pirate',
    bgClass: 'bg-pirate',
    accentClass: 'accent-pirate',
    gridClass: 'grid-3x3',
    prizeTable: [
      '💎 Diamond chest  → $15',
      '🗺 Three maps     → $6',
      '⚓ Anchor bonus   → $3',
      '💰 Gold coin      → $2',
      '⭐ Bonus star      → 2× multiplier!',
    ],
    symbols: ['💰','🗺','⚓','💎','💀','🦜','⚔️'],
    generateResult(price) {
      const syms = ['💰','🗺','⚓','💎','💀','🦜','⚔️'];
      const weights = [3, 2, 2, 1, 3, 2, 3]; // lower weight = rarer
      function weightedPick() {
        const total = weights.reduce((a,b) => a+b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < syms.length; i++) {
          r -= weights[i];
          if (r <= 0) return syms[i];
        }
        return syms[0];
      }

      const cells = Array.from({length: 9}, weightedPick);
      const hasStar = Math.random() < 0.25; // bonus star on separate zone
      const bonusCells = [hasStar ? '⭐' : '🏴‍☠️', Math.random() < 0.4 ? '💰' : '💀'];

      const freq = {};
      cells.forEach(s => freq[s] = (freq[s] || 0) + 1);

      let winAmount = 0, winLabel = '', winType = 'loss';
      let multiplier = hasStar ? 2 : 1;

      if (freq['💎'] >= 3) { winAmount = 15; winLabel = 'DIAMOND CHEST!'; winType = 'big'; }
      else if (freq['🗺'] >= 3) { winAmount = 6;  winLabel = 'THREE MAPS!';   winType = 'win'; }
      else if (freq['⚓'] >= 3) { winAmount = 3;  winLabel = 'ANCHOR BONUS!'; winType = 'win'; }
      else if (freq['💰'] >= 2) { winAmount = 2;  winLabel = 'GOLD COINS!';   winType = 'win'; }

      if (multiplier > 1 && winAmount > 0) {
        winAmount *= multiplier;
        winLabel += ' × 2 STAR BONUS!';
        winType = winAmount >= 10 ? 'big' : 'win';
      }

      return { cells, bonusCells, hasStar, winAmount, winLabel, winType, layout: 'pirate' };
    }
  },

  /* ── TICKET 3: Frost Gems (Advanced) ────────────────── */
  {
    id: 'winter',
    name: 'Frost Gems',
    theme: 'Winter Wonder',
    emoji: '❄️',
    tier: 'advanced',
    tierLabel: 'COMBO',
    price: 5,
    cssTheme: 'theme-winter',
    bgClass: 'bg-winter',
    accentClass: 'accent-winter',
    gridClass: 'grid-3x4',
    prizeTable: [
      '💙 Full row match  → $20',
      '❄ Two rows match  → $10',
      '💎 Diamond row    → $25',
      '⭐ Any row match   → $5',
      '🔮 Four of a kind → $8',
    ],
    symbols: ['❄️','💎','🔮','🌟','🧊','💙','🎄'],
    generateResult(price) {
      const syms = ['❄️','💎','🔮','🌟','🧊','💙','🎄'];
      // 4×3 grid = 12 cells (4 columns, 3 rows)
      const cells = Array.from({length: 12}, () => syms[Math.floor(Math.random() * syms.length)]);

      // Check rows (4 cols each, 3 rows)
      const rows = [
        [cells[0],cells[1],cells[2],cells[3]],
        [cells[4],cells[5],cells[6],cells[7]],
        [cells[8],cells[9],cells[10],cells[11]],
      ];

      const winRows = [];
      rows.forEach((row, i) => {
        const allSame = row.every(c => c === row[0]);
        if (allSame) winRows.push({ rowIndex: i, symbol: row[0] });
      });

      // Four-of-a-kind check
      const freq = {};
      cells.forEach(s => freq[s] = (freq[s] || 0) + 1);
      const fourOfAKind = Object.entries(freq).find(([,v]) => v >= 4);

      let winAmount = 0, winLabel = '', winType = 'loss';

      if (winRows.length >= 2 && winRows.some(r => r.symbol === '💎')) {
        winAmount = 25; winLabel = 'DIAMOND ROWS!'; winType = 'big';
      } else if (winRows.length >= 2) {
        winAmount = 10; winLabel = 'DOUBLE MATCH ROW!'; winType = 'big';
      } else if (winRows.length === 1 && winRows[0].symbol === '💎') {
        winAmount = 20; winLabel = 'DIAMOND ROW!'; winType = 'big';
      } else if (winRows.length === 1) {
        winAmount = 5; winLabel = 'ROW MATCH!'; winType = 'win';
      } else if (fourOfAKind) {
        winAmount = 8; winLabel = `FOUR ${fourOfAKind[0]}!`; winType = 'win';
      }

      // Mark winning cell indices
      const winCellIndices = new Set();
      winRows.forEach(r => {
        for (let c = 0; c < 4; c++) winCellIndices.add(r.rowIndex * 4 + c);
      });

      return { cells, winRows, winCellIndices: [...winCellIndices], winAmount, winLabel, winType, layout: 'winter' };
    }
  },

  /* ── TICKET 4: Space Jackpot (Advanced) ─────────────── */
  {
    id: 'space',
    name: 'Space Jackpot',
    theme: 'Galactic Spin',
    emoji: '🚀',
    tier: 'advanced',
    tierLabel: 'GALACTIC',
    price: 5,
    cssTheme: 'theme-space',
    bgClass: 'bg-space',
    accentClass: 'accent-space',
    gridClass: 'grid-3x3',
    prizeTable: [
      '🌟 Three suns     → $20',
      '🚀 Three rockets  → $10',
      '🪐 Three planets  → $8',
      '👾 Alien trio     → $6',
      '☄ Combo chain    → up to $30!',
      '💫 Any pair + UFO → $4',
    ],
    symbols: ['🌟','🚀','🪐','👾','🛸','☄️','💫'],
    generateResult(price) {
      const syms = ['🌟','🚀','🪐','👾','🛸','☄️','💫'];
      const cells = Array.from({length: 9}, () => syms[Math.floor(Math.random() * syms.length)]);

      const freq = {};
      cells.forEach(s => freq[s] = (freq[s] || 0) + 1);

      // Combo chain bonus: count distinct symbols that appear 2+ times
      const comboCount = Object.values(freq).filter(v => v >= 2).length;

      let winAmount = 0, winLabel = '', winType = 'loss';

      if (comboCount >= 3) {
        winAmount = 30; winLabel = 'COSMIC CHAIN!'; winType = 'big';
      } else if (freq['🌟'] >= 3) {
        winAmount = 20; winLabel = 'TRIPLE SUNS!'; winType = 'big';
      } else if (freq['🚀'] >= 3) {
        winAmount = 10; winLabel = 'TRIPLE ROCKETS!'; winType = 'win';
      } else if (freq['🪐'] >= 3) {
        winAmount = 8; winLabel = 'TRIPLE PLANETS!'; winType = 'win';
      } else if (freq['👾'] >= 3) {
        winAmount = 6; winLabel = 'ALIEN TRIO!'; winType = 'win';
      } else if (freq['💫'] >= 2 && freq['🛸'] >= 1) {
        winAmount = 4; winLabel = 'UFO SIGNAL!'; winType = 'win';
      } else if (comboCount === 2) {
        winAmount = 3; winLabel = 'DOUBLE COMBO!'; winType = 'win';
      }

      return { cells, freq, comboCount, winAmount, winLabel, winType, layout: 'grid3x3' };
    }
  },

  /* ── TICKET 5: Monster Mash (Premium) ───────────────── */
  {
    id: 'monster',
    name: 'Monster Mash',
    theme: 'Spooky Bonus',
    emoji: '👾',
    tier: 'premium',
    tierLabel: 'PREMIUM',
    price: 10,
    cssTheme: 'theme-monster',
    bgClass: 'bg-monster',
    accentClass: 'accent-monster',
    gridClass: 'grid-4x4',
    prizeTable: [
      '💚 Four monsters  → $50 JACKPOT',
      '🧟 Three zombies  → $25',
      '🎃 Three pumpkins → $15',
      '👻 Three ghosts   → $10',
      '🦇 Bat bonus cell → +$5 bonus',
      '🕷 Any trio       → $8',
    ],
    symbols: ['💚','🧟','🎃','👻','🦇','🕷','🧙','⚗️'],
    generateResult(price) {
      const syms = ['💚','🧟','🎃','👻','🦇','🕷','🧙','⚗️'];
      const weights = [1, 2, 3, 3, 2, 3, 2, 4];
      function weightedPick() {
        const total = weights.reduce((a,b) => a+b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < syms.length; i++) {
          r -= weights[i];
          if (r <= 0) return syms[i];
        }
        return syms[0];
      }

      const cells = Array.from({length: 16}, weightedPick);
      const freq = {};
      cells.forEach(s => freq[s] = (freq[s] || 0) + 1);

      const batBonus = (freq['🦇'] || 0) >= 2 ? 5 : 0;

      let winAmount = 0, winLabel = '', winType = 'loss';

      if (freq['💚'] >= 4) {
        winAmount = 50; winLabel = '💚 MONSTER JACKPOT!!'; winType = 'big';
      } else if (freq['🧟'] >= 3) {
        winAmount = 25; winLabel = 'ZOMBIE HORDE!'; winType = 'big';
      } else if (freq['🎃'] >= 3) {
        winAmount = 15; winLabel = 'TRIPLE PUMPKINS!'; winType = 'win';
      } else if (freq['👻'] >= 3) {
        winAmount = 10; winLabel = 'GHOST TRIO!'; winType = 'win';
      } else {
        // any trio
        const trio = Object.entries(freq).find(([s, v]) => v >= 3 && s !== '🦇');
        if (trio) { winAmount = 8; winLabel = `TRIPLE ${trio[0]}!`; winType = 'win'; }
      }

      if (batBonus > 0 && winAmount > 0) {
        winAmount += batBonus;
        winLabel += ' +BAT BONUS!';
      } else if (batBonus > 0 && winAmount === 0) {
        winAmount = batBonus; winLabel = 'BAT BONUS!'; winType = 'win';
      }

      winType = winAmount >= 25 ? 'big' : winAmount > 0 ? 'win' : 'loss';

      return { cells, freq, batBonus, winAmount, winLabel, winType, layout: 'grid4x4' };
    }
  },

  /* ── TICKET 6: Cherry Diner (Premium) ───────────────── */
  {
    id: 'diner',
    name: 'Cherry Diner',
    theme: 'Retro Arcade',
    emoji: '🍒',
    tier: 'premium',
    tierLabel: 'JACKPOT',
    price: 10,
    cssTheme: 'theme-diner',
    bgClass: 'bg-diner',
    accentClass: 'accent-diner',
    gridClass: 'grid-3x3',
    prizeTable: [
      '🍒 Cherries × 5   → $75 MEGA POT',
      '🍋 Lemons × 4     → $40',
      '🔔 Bells × 3      → $25',
      '💎 Diamond × 2    → $15',
      '🍉 Watermelon × 3 → $12',
      '🍒 Cherries × 3   → $10',
      '✨ Any two wild   → $5',
    ],
    symbols: ['🍒','🍒','🍋','🍋','🔔','💎','🍉','⭐','🃏'],
    generateResult(price) {
      const syms = ['🍒','🍋','🔔','💎','🍉','⭐','🃏','🎲','🌈'];
      const weights = [5, 4, 3, 2, 3, 3, 4, 3, 1]; // cherries most common

      function weightedPick() {
        const total = weights.reduce((a,b) => a+b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < syms.length; i++) {
          r -= weights[i];
          if (r <= 0) return syms[i];
        }
        return syms[0];
      }

      // 3×3 grid of reels — each column can have a reel feel
      const cells = Array.from({length: 9}, weightedPick);
      const freq = {};
      cells.forEach(s => freq[s] = (freq[s] || 0) + 1);

      let winAmount = 0, winLabel = '', winType = 'loss';

      if (freq['🍒'] >= 5) {
        winAmount = 75; winLabel = '🍒🍒🍒🍒🍒 MEGA POT!!'; winType = 'big';
      } else if (freq['🍋'] >= 4) {
        winAmount = 40; winLabel = 'LEMON QUARTET!'; winType = 'big';
      } else if (freq['🔔'] >= 3) {
        winAmount = 25; winLabel = 'TRIPLE BELLS!'; winType = 'big';
      } else if (freq['💎'] >= 2) {
        winAmount = 15; winLabel = 'DIAMOND PAIR!'; winType = 'win';
      } else if (freq['🍉'] >= 3) {
        winAmount = 12; winLabel = 'WATERMELON ROW!'; winType = 'win';
      } else if (freq['🍒'] >= 3) {
        winAmount = 10; winLabel = 'TRIPLE CHERRIES!'; winType = 'win';
      } else if (freq['⭐'] >= 2 || freq['🌈'] >= 1) {
        winAmount = 5; winLabel = 'WILD WIN!'; winType = 'win';
      }

      return { cells, freq, winAmount, winLabel, winType, layout: 'grid3x3' };
    }
  }

]; // end TICKETS[]


/* ════════════════════════════════════════════════════════════
   3. ECONOMY / GAME STATE
   Single source of truth — all mutations go through here.
═══════════════════════════════════════════════════════════ */
const State = {
  bankroll:   50,
  totalWon:   0,
  totalSpent: 0,
  biggestWin: 0,
  ticketsPlayed: 0,
  currentTicket: null,   // TICKET definition
  currentResult: null,   // generated result object
};

function spendMoney(amount) {
  State.bankroll -= amount;
  State.totalSpent += amount;
  updateStats();
}

function earnMoney(amount) {
  State.bankroll += amount;
  State.totalWon += amount;
  if (amount > State.biggestWin) State.biggestWin = amount;
  updateStats();
}

function resetGame() {
  State.bankroll = 50;
  State.totalWon = 0;
  State.totalSpent = 0;
  State.biggestWin = 0;
  State.ticketsPlayed = 0;
  State.currentTicket = null;
  State.currentResult = null;
  updateStats();
  closeModal('broke-modal');
  showScreen('shop');
  renderShop();
}

function updateStats() {
  const fmt = n => '$' + n.toFixed(2);
  setText('stat-bankroll', fmt(State.bankroll));
  setText('stat-won',      fmt(State.totalWon));
  setText('stat-played',   State.ticketsPlayed);
  setText('stat-spent',    fmt(State.totalSpent));
  setText('stat-biggest',  fmt(State.biggestWin));
  // Bump animation on bankroll
  const el = document.getElementById('stat-bankroll');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 300);
}


/* ════════════════════════════════════════════════════════════
   4. SCRATCH CANVAS
   The canvas is layered exactly on top of the ticket-face div.
   We draw a solid grey coating, then erase it with destination-out
   compositing as the user drags. A threshold check reveals the
   result once enough area is cleared.
═══════════════════════════════════════════════════════════ */
const Scratch = (() => {
  let canvas, ctx;
  let isDown = false;
  let scratchInterval = null;
  let revealCallback = null;
  let revealed = false;
  let brushSize = 36;
  const REVEAL_THRESHOLD = 0.55; // 55% cleared = auto-reveal

  function init(onReveal) {
    canvas = document.getElementById('scratch-canvas');
    ctx = canvas.getContext('2d');
    revealCallback = onReveal;
    revealed = false;
    isDown = false;

    // Size canvas to match its display size
    resize();

    // Draw the scratch coating
    drawCoating();

    // Pointer events (works for mouse + touch)
    canvas.addEventListener('pointerdown',  onDown,  { passive: true });
    canvas.addEventListener('pointermove',  onMove,  { passive: true });
    canvas.addEventListener('pointerup',    onUp,    { passive: true });
    canvas.addEventListener('pointerleave', onUp,    { passive: true });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  || 560;
    canvas.height = rect.height || 360;
    // Adapt brush size to canvas size
    brushSize = Math.max(28, canvas.width * 0.065);
  }

  function drawCoating() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Use globalCompositeOperation source-over for the initial coating
    ctx.globalCompositeOperation = 'source-over';

    // Metallic grey gradient with subtle noise feel
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0,   '#7a8ba0');
    grad.addColorStop(0.3, '#8a9bb0');
    grad.addColorStop(0.6, '#6a7b90');
    grad.addColorStop(1,   '#9aaabf');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 20);
    ctx.fill();

    // Instruction text on coating
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `bold ${Math.floor(canvas.width * 0.032)}px 'Russo One', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCRATCH HERE 🪙', canvas.width / 2, canvas.height / 2 - 12);
    ctx.font = `${Math.floor(canvas.width * 0.022)}px 'Share Tech Mono', monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillText('use mouse or finger', canvas.width / 2, canvas.height / 2 + 18);
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  function erase(x, y) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    // Soft circular eraser
    const grad = ctx.createRadialGradient(x, y, 0, x, y, brushSize);
    grad.addColorStop(0,   'rgba(0,0,0,1)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.9)');
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
  }

  function onDown(e) {
    if (revealed) return;
    isDown = true;
    const pos = getPos(e);
    erase(pos.x, pos.y);
    Audio.scratch();
    // Throttled reveal check
    scratchInterval = setInterval(checkReveal, 300);
  }

  function onMove(e) {
    if (!isDown || revealed) return;
    const pos = getPos(e);
    erase(pos.x, pos.y);
    // Occasional scratch sound (every ~80ms)
    if (Math.random() < 0.15) Audio.scratch();
  }

  function onUp() {
    isDown = false;
    if (scratchInterval) { clearInterval(scratchInterval); scratchInterval = null; }
    if (!revealed) checkReveal();
  }

  function checkReveal() {
    if (revealed) return;
    const ratio = getRevealRatio();
    const hint = document.getElementById('scratch-hint');
    const pct = Math.floor(ratio * 100);
    hint.textContent = pct < 30
      ? '🪙 Keep scratching…'
      : pct < REVEAL_THRESHOLD * 100
        ? `🪙 ${pct}% revealed — almost there!`
        : '✨ Revealing…';

    if (ratio >= REVEAL_THRESHOLD) {
      revealAll(() => {
        if (revealCallback) revealCallback();
      });
    }
  }

  function getRevealRatio() {
    // Sample every 4th pixel for performance
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    let transparent = 0, total = 0;
    for (let i = 3; i < data.length; i += 16) { // alpha channel, every 4th pixel
      if (data[i] < 128) transparent++;
      total++;
    }
    return transparent / total;
  }

  function revealAll(cb) {
    if (revealed) return;
    revealed = true;
    if (scratchInterval) { clearInterval(scratchInterval); scratchInterval = null; }

    // Fade out the remaining coating
    let alpha = 1;
    const fade = setInterval(() => {
      alpha -= 0.08;
      if (alpha <= 0) {
        clearInterval(fade);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (cb) cb();
        return;
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${0.08})`;
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, 20);
      ctx.fill();
    }, 30);
  }

  function forceReveal(cb) {
    revealAll(cb);
  }

  function destroy() {
    if (scratchInterval) clearInterval(scratchInterval);
    canvas.removeEventListener('pointerdown',  onDown);
    canvas.removeEventListener('pointermove',  onMove);
    canvas.removeEventListener('pointerup',    onUp);
    canvas.removeEventListener('pointerleave', onUp);
  }

  return { init, forceReveal, destroy, resize };
})();


/* ════════════════════════════════════════════════════════════
   5. TICKET FACE BUILDER
   Renders the hidden prize grid inside ticket-face, then
   the canvas scratch layer is painted on top.
═══════════════════════════════════════════════════════════ */
function buildTicketFace(ticket, result) {
  const face = document.getElementById('ticket-face');
  face.className = `ticket-face ${ticket.bgClass} ${ticket.accentClass}`;

  // Top decorative label
  const topLabel = document.createElement('div');
  topLabel.className = 'ticket-top-label';
  topLabel.style.color = getTicketAccentColor(ticket.id);
  topLabel.textContent = `— ${ticket.name.toUpperCase()} —`;
  face.appendChild(topLabel);

  // Build grid based on layout type
  if (result.layout === 'grid3x3' || result.layout === 'pirate') {
    buildStandardGrid(face, ticket, result, 3);
  } else if (result.layout === 'winter') {
    buildWinterGrid(face, ticket, result);
  } else if (result.layout === 'grid4x4') {
    buildStandardGrid(face, ticket, result, 4);
  }

  // Pirate bonus zone
  if (result.layout === 'pirate' && result.bonusCells) {
    buildBonusZone(face, result);
  }

  // Bottom serial number (decoration)
  const note = document.createElement('div');
  note.className = 'ticket-bottom-note';
  note.textContent = `TICKET #${String(Math.floor(Math.random()*99999)).padStart(5,'0')} · NOT A REAL TICKET`;
  face.appendChild(note);
}

function buildStandardGrid(face, ticket, result, cols) {
  const grid = document.createElement('div');
  grid.className = `prize-grid ${cols === 4 ? 'grid-4x4' : 'grid-3x3'}`;

  result.cells.forEach((sym, i) => {
    const cell = document.createElement('div');
    cell.className = 'prize-cell';
    cell.dataset.index = i;

    const symEl = document.createElement('div');
    symEl.className = 'cell-symbol';
    symEl.textContent = sym;

    cell.appendChild(symEl);
    grid.appendChild(cell);
  });

  face.appendChild(grid);
}

function buildWinterGrid(face, ticket, result) {
  // 4-column, 3-row grid
  const grid = document.createElement('div');
  grid.className = 'prize-grid grid-3x4';

  result.cells.forEach((sym, i) => {
    const cell = document.createElement('div');
    cell.className = 'prize-cell';
    if (result.winCellIndices && result.winCellIndices.includes(i)) {
      cell.classList.add('winning');
    }
    cell.dataset.index = i;

    const symEl = document.createElement('div');
    symEl.className = 'cell-symbol';
    symEl.textContent = sym;

    cell.appendChild(symEl);
    grid.appendChild(cell);
  });

  face.appendChild(grid);
}

function buildBonusZone(face, result) {
  const wrap = document.createElement('div');
  wrap.className = 'bonus-zone-wrap';

  const label = document.createElement('div');
  label.className = 'bonus-zone-label';
  label.textContent = '⚡ BONUS ZONE';
  wrap.appendChild(label);

  const row = document.createElement('div');
  row.className = 'bonus-row';

  result.bonusCells.forEach(sym => {
    const cell = document.createElement('div');
    cell.className = 'bonus-cell';
    cell.textContent = sym;
    row.appendChild(cell);
  });

  wrap.appendChild(row);
  face.appendChild(wrap);
}

function getTicketAccentColor(id) {
  const map = {
    lucky7: '#f5c842', pirate: '#e8724a', winter: '#7ecfff',
    space: '#b06eff', monster: '#39e87a', diner: '#ff4d6a'
  };
  return map[id] || '#e8eaf0';
}


/* ════════════════════════════════════════════════════════════
   6. UI / SCREEN MANAGER
═══════════════════════════════════════════════════════════ */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(`screen-${name}`);
  if (el) el.classList.remove('hidden');
  window.scrollTo(0, 0);
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmt(n) { return '$' + n.toFixed(2); }


/* ════════════════════════════════════════════════════════════
   7. SHOP SCREEN
═══════════════════════════════════════════════════════════ */
function renderShop() {
  const rack = document.getElementById('ticket-rack');
  rack.innerHTML = '';

  TICKETS.forEach(ticket => {
    const card = document.createElement('div');
    card.className = `ticket-card ${ticket.cssTheme}`;
    if (State.bankroll < ticket.price) card.classList.add('cant-afford');
    card.style.setProperty('--ticket-accent', getTicketAccentColor(ticket.id));

    card.innerHTML = `
      <div class="ticket-banner">${ticket.emoji}</div>
      <div class="ticket-card-body">
        <div class="ticket-card-name">${ticket.name}</div>
        <div class="ticket-card-theme">${ticket.theme}</div>
        <div class="ticket-card-footer">
          <div class="ticket-card-price">${fmt(ticket.price)}</div>
          <div class="ticket-card-tier tier-${ticket.tier}">${ticket.tierLabel}</div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      Audio.click();
      if (State.bankroll < ticket.price) {
        shakeBroke();
        return;
      }
      openBuyModal(ticket);
    });

    rack.appendChild(card);
  });
}

function shakeBroke() {
  const bankEl = document.getElementById('stat-bankroll');
  bankEl.style.animation = 'none';
  void bankEl.offsetWidth;
  bankEl.style.animation = 'shake 0.4s ease';
  bankEl.style.color = 'var(--accent-red)';
  setTimeout(() => {
    bankEl.style.animation = '';
    bankEl.style.color = '';
  }, 600);
}


/* ════════════════════════════════════════════════════════════
   8. BUY MODAL
═══════════════════════════════════════════════════════════ */
function openBuyModal(ticket) {
  setText('modal-preview-emoji', ticket.emoji);
  setText('modal-ticket-name',   ticket.name);
  setText('modal-ticket-theme',  ticket.theme);
  setText('modal-price',         fmt(ticket.price));
  setText('modal-balance',       fmt(State.bankroll));

  // Build prize table
  const prizeEl = document.getElementById('modal-prize-table');
  prizeEl.innerHTML = ticket.prizeTable.map(line => `<div>${line}</div>`).join('');

  // Wire confirm button
  const confirmBtn = document.getElementById('btn-confirm-buy');
  confirmBtn.onclick = () => {
    Audio.buy();
    closeModal('buy-modal');
    buyTicket(ticket);
  };

  document.getElementById('btn-cancel-buy').onclick = () => {
    Audio.click();
    closeModal('buy-modal');
  };

  openModal('buy-modal');
}

function buyTicket(ticket) {
  spendMoney(ticket.price);
  State.ticketsPlayed++;
  State.currentTicket = ticket;
  State.currentResult = ticket.generateResult(ticket.price);
  openScratchScreen(ticket, State.currentResult);
}


/* ════════════════════════════════════════════════════════════
   9. SCRATCH SCREEN
═══════════════════════════════════════════════════════════ */
function openScratchScreen(ticket, result) {
  // Set header
  setText('scratch-ticket-title', ticket.name);
  setText('scratch-cost-badge', fmt(ticket.price));

  // Hide result overlay
  document.getElementById('result-overlay').classList.add('hidden');

  // Clear and rebuild ticket face
  const face = document.getElementById('ticket-face');
  face.innerHTML = '';
  buildTicketFace(ticket, result);

  // Show scratch screen
  showScreen('scratch');

  // Small delay so layout is painted before we init canvas
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      Scratch.init(() => {
        // Called when reveal threshold is met
        showResult(ticket, result);
      });
    });
  });

  // Hint text reset
  setText('scratch-hint', '🪙 Scratch to reveal your prizes!');

  // Wire buttons
  document.getElementById('btn-back').onclick = () => {
    Audio.back();
    Scratch.destroy();
    showScreen('shop');
    renderShop();
  };

  document.getElementById('btn-reveal-all').onclick = () => {
    Audio.click();
    Scratch.forceReveal(() => showResult(ticket, result));
  };

  document.getElementById('btn-continue').onclick = () => {
    Audio.click();
    Scratch.destroy();
    showScreen('shop');
    renderShop();
  };

  Audio.shopEnter();
}


/* ════════════════════════════════════════════════════════════
  10. RESULT REVEAL
═══════════════════════════════════════════════════════════ */
function showResult(ticket, result) {
  // Highlight winning cells (for winter row-match type)
  if (result.winRows && result.winRows.length > 0) {
    result.winRows.forEach(row => {
      for (let c = 0; c < 4; c++) {
        const idx = row.rowIndex * 4 + c;
        const cell = document.querySelector(`[data-index="${idx}"]`);
        if (cell) cell.classList.add('winning');
      }
    });
  }

  // Show result overlay
  const overlay = document.getElementById('result-overlay');
  const card    = document.getElementById('result-card');
  overlay.classList.remove('hidden');

  if (result.winAmount > 0) {
    earnMoney(result.winAmount);

    const isBig = result.winType === 'big' || result.winAmount >= 15;

    document.getElementById('result-emoji').textContent  = isBig ? '🎉' : '✨';
    document.getElementById('result-title').textContent  = isBig ? 'BIG WIN!' : 'YOU WIN!';
    document.getElementById('result-title').className    = `result-title ${isBig ? 'big' : 'win'}`;
    document.getElementById('result-amount').textContent = '+' + fmt(result.winAmount);
    document.getElementById('result-amount').className   = 'result-amount';
    document.getElementById('result-detail').textContent = result.winLabel;

    if (isBig) {
      Audio.bigWin();
      spawnParticles(30);
      card.classList.add('big-win-flash');
    } else {
      Audio.smallWin();
      spawnParticles(12);
    }

  } else {
    document.getElementById('result-emoji').textContent  = '😔';
    document.getElementById('result-title').textContent  = 'NO LUCK';
    document.getElementById('result-title').className    = 'result-title loss';
    document.getElementById('result-amount').textContent = 'Better luck next time!';
    document.getElementById('result-amount').className   = 'result-amount loss';
    document.getElementById('result-detail').textContent = `Spent: ${fmt(ticket.price)}`;
    Audio.loss();
  }

  // Check broke
  if (State.bankroll < Math.min(...TICKETS.map(t => t.price))) {
    setTimeout(() => openModal('broke-modal'), 2200);
  }
}


/* ════════════════════════════════════════════════════════════
  11. PARTICLES (WIN CELEBRATION)
═══════════════════════════════════════════════════════════ */
function spawnParticles(count) {
  const container = document.getElementById('particles');
  const colors = ['#f5c842','#39e87a','#38b2f5','#b06eff','#ff4d6a','#fff'];

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = 6 + Math.random() * 10;
      p.style.cssText = `
        left: ${10 + Math.random() * 80}%;
        top: 0;
        width: ${size}px;
        height: ${size}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        animation-duration: ${1.5 + Math.random() * 1.5}s;
        animation-delay: ${Math.random() * 0.3}s;
      `;
      container.appendChild(p);
      setTimeout(() => p.remove(), 3500);
    }, i * 40);
  }
}


/* ════════════════════════════════════════════════════════════
  12. BOOT
═══════════════════════════════════════════════════════════ */
function boot() {
  updateStats();
  renderShop();
  showScreen('shop');

  // Shake CSS for bankroll
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20%      { transform: translateX(-6px); }
      40%      { transform: translateX(6px); }
      60%      { transform: translateX(-4px); }
      80%      { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(style);

  // Reformat canvas on window resize
  window.addEventListener('resize', () => {
    const scratchScreen = document.getElementById('screen-scratch');
    if (!scratchScreen.classList.contains('hidden')) {
      Scratch.resize();
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);
