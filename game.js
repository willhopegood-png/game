// ─── Constants ───────────────────────────────────────────────────────────────
const CANVAS_W = 700;
const CANVAS_H = 500;
const TILE = 40;
const COLS = Math.floor(CANVAS_W / TILE);
const ROWS = Math.floor(CANVAS_H / TILE);

const TANK_SPEED = 2;
const BULLET_SPEED = 6;
const ENEMY_SPEED = 1;
const ENEMY_SHOOT_INTERVAL = 120; // frames between enemy shots
const SHOOT_COOLDOWN = 20; // frames between player shots
const BASE_WALL_COUNT = 20;
const WALLS_PER_LEVEL = 5;
const ENEMY_MOVE_RATIO = ENEMY_SPEED / TANK_SPEED;

// ─── Colors ──────────────────────────────────────────────────────────────────
const COLORS = {
  grass:    '#1a472a',
  wall:     '#4a4a4a',
  steelWall:'#888',
  player:   '#4fc3f7',
  playerGun:'#0288d1',
  enemy:    '#ef5350',
  enemyGun: '#b71c1c',
  bullet:   '#fff176',
  enemyBullet: '#ff8a65',
};

// ─── Utility ─────────────────────────────────────────────────────────────────
function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Canvas setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ─── Input ───────────────────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  // Prevent page scroll on arrow keys / space
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ─── Game state ──────────────────────────────────────────────────────────────
let state;

function createMap(level) {
  // 0=open, 1=wall (destructible), 2=steel (indestructible)
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  // Border walls (steel)
  for (let c = 0; c < COLS; c++) {
    map[0][c] = 2;
    map[ROWS - 1][c] = 2;
  }
  for (let r = 0; r < ROWS; r++) {
    map[r][0] = 2;
    map[r][COLS - 1] = 2;
  }

  // Random destructible walls – more walls each level
  const wallCount = BASE_WALL_COUNT + level * WALLS_PER_LEVEL;
  for (let i = 0; i < wallCount; i++) {
    const r = randomInt(1, ROWS - 2);
    const c = randomInt(1, COLS - 2);
    // Keep center area and spawn areas clear
    if ((r < 3 && c >= Math.floor(COLS / 2) - 1 && c <= Math.floor(COLS / 2) + 1) ||
        (r > ROWS - 4 && c >= Math.floor(COLS / 2) - 1 && c <= Math.floor(COLS / 2) + 1)) {
      continue;
    }
    map[r][c] = 1;
  }

  return map;
}

function createPlayer() {
  const cx = Math.floor(COLS / 2) * TILE;
  const cy = (ROWS - 2) * TILE;
  return {
    x: cx, y: cy,
    w: TILE - 4, h: TILE - 4,
    dir: 'up',
    shootCooldown: 0,
  };
}

function spawnEnemies(level, map) {
  const count = Math.min(2 + level, 8);
  const enemies = [];
  const spawnCols = [1, 3, 5, Math.floor(COLS / 2) - 1, Math.floor(COLS / 2) + 1, COLS - 2, COLS - 4, COLS - 6];
  for (let i = 0; i < count; i++) {
    const col = spawnCols[i % spawnCols.length];
    const x = col * TILE + 2;
    const y = TILE + 2;
    // Clear spawn tile
    map[1][col] = 0;
    enemies.push({
      x, y,
      w: TILE - 4, h: TILE - 4,
      dir: 'down',
      shootTimer: randomInt(30, ENEMY_SHOOT_INTERVAL),
      moveTimer: randomInt(20, 60),
      alive: true,
    });
  }
  return enemies;
}

function initGame() {
  const level = (state && state.level) || 1;
  const lives = (state && state.lives !== undefined) ? state.lives : 3;
  const score = (state && state.score) || 0;

  const map = createMap(level);
  const player = createPlayer();
  const enemies = spawnEnemies(level, map);

  state = {
    map,
    player,
    enemies,
    bullets: [],        // player bullets
    enemyBullets: [],
    score,
    lives,
    level,
    running: true,
    frameCount: 0,
  };

  updateHUD();
}

// ─── HUD helpers ─────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score').textContent = state.score;
  document.getElementById('lives').textContent = state.lives;
  document.getElementById('level').textContent = state.level;
}

// ─── Map helpers ─────────────────────────────────────────────────────────────
function tileAt(x, y) {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 2;
  return state.map[r][c];
}

function tileRect(r, c) {
  return { x: c * TILE, y: r * TILE, w: TILE, h: TILE };
}

function wallCollides(obj) {
  // Check corners of the object
  const corners = [
    { x: obj.x,           y: obj.y },
    { x: obj.x + obj.w,   y: obj.y },
    { x: obj.x,           y: obj.y + obj.h },
    { x: obj.x + obj.w,   y: obj.y + obj.h },
  ];
  for (const pt of corners) {
    const t = tileAt(pt.x, pt.y);
    if (t === 1 || t === 2) return true;
  }
  return false;
}

// ─── Movement ────────────────────────────────────────────────────────────────
function move(obj, dx, dy) {
  obj.x += dx;
  if (wallCollides(obj)) obj.x -= dx;
  obj.y += dy;
  if (wallCollides(obj)) obj.y -= dy;
}

function dirDelta(dir) {
  switch (dir) {
    case 'up':    return { dx: 0,          dy: -TANK_SPEED };
    case 'down':  return { dx: 0,          dy:  TANK_SPEED };
    case 'left':  return { dx: -TANK_SPEED, dy: 0 };
    case 'right': return { dx:  TANK_SPEED, dy: 0 };
    default:      return { dx: 0, dy: 0 };
  }
}

// ─── Bullet factory ──────────────────────────────────────────────────────────
function fireBullet(tank, isEnemy) {
  const cx = tank.x + tank.w / 2;
  const cy = tank.y + tank.h / 2;
  const bw = 6, bh = 6;
  let bx, by, vx, vy;
  switch (tank.dir) {
    case 'up':    bx = cx - bw/2; by = tank.y - bh;    vx = 0;             vy = -BULLET_SPEED; break;
    case 'down':  bx = cx - bw/2; by = tank.y + tank.h; vx = 0;            vy =  BULLET_SPEED; break;
    case 'left':  bx = tank.x - bw; by = cy - bh/2;    vx = -BULLET_SPEED; vy = 0;             break;
    case 'right': bx = tank.x + tank.w; by = cy - bh/2; vx = BULLET_SPEED; vy = 0;             break;
    default:      bx = cx; by = cy; vx = 0; vy = -BULLET_SPEED;
  }
  return { x: bx, y: by, w: bw, h: bh, vx, vy, isEnemy };
}

// ─── Player update ───────────────────────────────────────────────────────────
function updatePlayer() {
  const p = state.player;
  if (!p) return;

  if (p.shootCooldown > 0) p.shootCooldown--;

  // Movement
  if (keys['ArrowUp']    || keys['KeyW']) { p.dir = 'up';    move(p, 0, -TANK_SPEED); }
  if (keys['ArrowDown']  || keys['KeyS']) { p.dir = 'down';  move(p, 0,  TANK_SPEED); }
  if (keys['ArrowLeft']  || keys['KeyA']) { p.dir = 'left';  move(p, -TANK_SPEED, 0); }
  if (keys['ArrowRight'] || keys['KeyD']) { p.dir = 'right'; move(p,  TANK_SPEED, 0); }

  // Shoot
  if (keys['Space'] && p.shootCooldown === 0) {
    state.bullets.push(fireBullet(p, false));
    p.shootCooldown = SHOOT_COOLDOWN;
  }
}

// ─── Enemy update ────────────────────────────────────────────────────────────
const DIRS = ['up', 'down', 'left', 'right'];

function updateEnemies() {
  const p = state.player;

  for (const e of state.enemies) {
    if (!e.alive) continue;

    // Shoot timer
    e.shootTimer--;
    if (e.shootTimer <= 0) {
      // Aim toward player roughly
      const dx = (p ? p.x - e.x : 0);
      const dy = (p ? p.y - e.y : 0);
      if (Math.abs(dx) > Math.abs(dy)) {
        e.dir = dx > 0 ? 'right' : 'left';
      } else {
        e.dir = dy > 0 ? 'down' : 'up';
      }
      state.enemyBullets.push(fireBullet(e, true));
      e.shootTimer = randomInt(ENEMY_SHOOT_INTERVAL / 2, ENEMY_SHOOT_INTERVAL);
    }

    // Move timer
    e.moveTimer--;
    if (e.moveTimer <= 0) {
      e.dir = DIRS[randomInt(0, 3)];
      e.moveTimer = randomInt(20, 60);
    }

    const { dx, dy } = dirDelta(e.dir);
    const prev = { x: e.x, y: e.y };
    move(e, dx * ENEMY_MOVE_RATIO, dy * ENEMY_MOVE_RATIO);

    // If stuck, pick new direction
    if (e.x === prev.x && e.y === prev.y) {
      e.dir = DIRS[randomInt(0, 3)];
      e.moveTimer = randomInt(10, 30);
    }
  }

  // Remove dead enemies
  state.enemies = state.enemies.filter(e => e.alive);
}

// ─── Bullet update ───────────────────────────────────────────────────────────
function updateBullets() {
  const p = state.player;

  // Player bullets
  state.bullets = state.bullets.filter(b => {
    b.x += b.vx;
    b.y += b.vy;

    // Hit wall
    const t = tileAt(b.x + b.w/2, b.y + b.h/2);
    if (t === 1) {
      // Destroy destructible wall
      const c = Math.floor((b.x + b.w/2) / TILE);
      const r = Math.floor((b.y + b.h/2) / TILE);
      state.map[r][c] = 0;
      return false;
    }
    if (t === 2) return false;

    // Out of bounds
    if (b.x < 0 || b.x > CANVAS_W || b.y < 0 || b.y > CANVAS_H) return false;

    // Hit enemy
    for (const e of state.enemies) {
      if (e.alive && rectOverlap(b, e)) {
        e.alive = false;
        state.score += 100;
        updateHUD();
        return false;
      }
    }

    return true;
  });

  // Enemy bullets
  state.enemyBullets = state.enemyBullets.filter(b => {
    b.x += b.vx;
    b.y += b.vy;

    // Hit wall
    const t = tileAt(b.x + b.w/2, b.y + b.h/2);
    if (t === 1) {
      const c = Math.floor((b.x + b.w/2) / TILE);
      const r = Math.floor((b.y + b.h/2) / TILE);
      state.map[r][c] = 0;
      return false;
    }
    if (t === 2) return false;

    // Out of bounds
    if (b.x < 0 || b.x > CANVAS_W || b.y < 0 || b.y > CANVAS_H) return false;

    // Hit player
    if (p && rectOverlap(b, p)) {
      state.lives--;
      updateHUD();
      if (state.lives <= 0) {
        gameOver();
      } else {
        // Respawn player
        const np = createPlayer();
        np.shootCooldown = 60;
        state.player = np;
      }
      return false;
    }

    return true;
  });
}

// ─── Level progression ───────────────────────────────────────────────────────
function checkLevelComplete() {
  if (state.enemies.length === 0) {
    state.level++;
    state.score += 500 * state.level;
    updateHUD();
    // Rebuild map but keep score and lives
    const level = state.level;
    const lives = state.lives;
    const score = state.score;
    state = null; // reset before initGame uses state.level
    state = { level, lives, score };
    initGame();
  }
}

// ─── Game over ───────────────────────────────────────────────────────────────
function gameOver() {
  state.running = false;
  document.getElementById('final-score').textContent = state.score;
  const overlay = document.getElementById('game-over');
  overlay.style.display = 'flex';
}

document.getElementById('restart-btn').addEventListener('click', () => {
  document.getElementById('game-over').style.display = 'none';
  state = null;
  initGame();
});

// ─── Drawing ─────────────────────────────────────────────────────────────────
function drawMap() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = state.map[r][c];
      ctx.fillStyle = t === 0 ? COLORS.grass : t === 1 ? COLORS.wall : COLORS.steelWall;
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      if (t !== 0) {
        // Draw grid lines on walls
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(c * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }
  }
}

function drawTank(tank, isPlayer) {
  const { x, y, w, h, dir } = tank;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  const angle = { up: -Math.PI/2, down: Math.PI/2, left: Math.PI, right: 0 }[dir] || 0;
  ctx.rotate(angle);

  // Body
  ctx.fillStyle = isPlayer ? COLORS.player : COLORS.enemy;
  ctx.fillRect(-w/2, -h/2, w, h);

  // Tracks (darker sides)
  ctx.fillStyle = isPlayer ? '#0288d1' : '#b71c1c';
  ctx.fillRect(-w/2, -h/2, w/5, h);
  ctx.fillRect(w/2 - w/5, -h/2, w/5, h);

  // Gun barrel
  ctx.fillStyle = isPlayer ? COLORS.playerGun : COLORS.enemyGun;
  const barrelW = w / 5;
  const barrelH = h / 2;
  ctx.fillRect(-barrelW/2, -h/2 - barrelH, barrelW, barrelH);

  // Turret
  ctx.fillStyle = isPlayer ? '#039be5' : '#c62828';
  ctx.beginPath();
  ctx.arc(0, 0, w / 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBullet(b, isEnemy) {
  ctx.fillStyle = isEnemy ? COLORS.enemyBullet : COLORS.bullet;
  ctx.beginPath();
  ctx.arc(b.x + b.w/2, b.y + b.h/2, b.w/2, 0, Math.PI * 2);
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawMap();

  if (state.player) drawTank(state.player, true);
  for (const e of state.enemies) drawTank(e, false);
  for (const b of state.bullets) drawBullet(b, false);
  for (const b of state.enemyBullets) drawBullet(b, true);
}

// ─── Game loop ───────────────────────────────────────────────────────────────
function loop() {
  if (state && state.running) {
    state.frameCount++;
    updatePlayer();
    updateEnemies();
    updateBullets();
    checkLevelComplete();
    render();
  }
  requestAnimationFrame(loop);
}

// ─── Start ───────────────────────────────────────────────────────────────────
initGame();
loop();
