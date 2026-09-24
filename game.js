const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const bestLevelEl = document.getElementById('best-level');
const levelEl = document.getElementById('level');
const levelProgressValueEl = document.getElementById('level-progress-value');
const levelProgressBarEl = document.getElementById('level-progress-bar');
const ammoEl = document.getElementById('ammo');
const shieldsEl = document.getElementById('shields');
const shieldTimeEl = document.getElementById('shield-time');
const livesEl = document.getElementById('lives');
const copyLinkButton = document.getElementById('copy-link');
const BEST_SCORE_KEY = 'star-dodge-best-score';
const BEST_LEVEL_KEY = 'star-dodge-best-level';
const LEVEL_STEP = 100;
const SPEED_STEP = 0.5;
const LEVEL_FIVE_SPEED_STEP = 0.2;
const MAX_AMMO = 3000;
const STARTING_AMMO = 100;
const MAX_LIVES = 10;
const AMMO_CRATE_BONUS = 50;
const SHIELD_DURATION_MS = 10000;
const FIVE_POINT_STAR_SPAWN_CHANCE = 0.4;
const TWO_POINT_STAR_SPAWN_CHANCE = 0.7;

const keys = {};
const state = {
  player: { x: canvas.width / 2, y: canvas.height - 52, radius: 22, speed: 6 },
  stars: [],
  enemies: [],
  bullets: [],
  particles: [],
  ammoCrates: [],
  score: 0,
  bestScore: Number(localStorage.getItem(BEST_SCORE_KEY) || 0),
  bestLevel: Number(localStorage.getItem(BEST_LEVEL_KEY) || 1),
  level: 1,
  lives: 3,
  ammo: STARTING_AMMO,
  started: false,
  lastSpawnStar: 0,
  lastSpawnEnemy: 0,
  ammoCrateSchedule: [],
  ammoCratesSpawnedThisLevel: 0,
  ammoCrateScheduleLevel: 0,
  levelStartTime: 0,
  gameOver: false,
  runningTime: 0,
  warningActive: false,
  warningHandled: false,
  levelFiveWarningActive: false,
  levelFiveWarningShown: false,
  speedMultiplier: 1,
  weaponUnlocked: false,
  weaponMessageActive: false,
  shieldUnlocked: false,
  shieldMessageActive: false,
  shieldCharges: 0,
  shieldTimeRemaining: 0,
  lastShieldLevel: 0,
  nextWarningAt: 100,
  lastLifeLevel: 1,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function getLevelFromScore(score) {
  return Math.max(1, Math.floor(score / LEVEL_STEP) + 1);
}

function playGameSound(name) {
  if (window.soundManager) {
    window.soundManager.play(name);
  }
}

async function copyGameLink() {
  const gameLink = window.location.href;

  try {
    await navigator.clipboard.writeText(gameLink);
  } catch {
    const temporaryInput = document.createElement('input');
    temporaryInput.value = gameLink;
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    document.execCommand('copy');
    temporaryInput.remove();
  }

  copyLinkButton.textContent = 'Länken är kopierad!';
  window.setTimeout(() => {
    copyLinkButton.textContent = 'Kopiera spellänk';
  }, 1800);
}

function resetGame() {
  state.player.x = canvas.width / 2;
  state.player.y = canvas.height - 52;
  state.stars = [];
  state.enemies = [];
  state.bullets = [];
  state.particles = [];
  state.ammoCrates = [];
  state.score = 0;
  state.lives = 3;
  state.ammo = STARTING_AMMO;
  state.lastSpawnStar = 0;
  state.lastSpawnEnemy = 0;
  state.ammoCrateSchedule = [];
  state.ammoCratesSpawnedThisLevel = 0;
  state.ammoCrateScheduleLevel = 0;
  state.levelStartTime = 0;
  state.gameOver = false;
  state.runningTime = 0;
  state.warningActive = false;
  state.warningHandled = false;
  state.levelFiveWarningActive = false;
  state.levelFiveWarningShown = false;
  state.speedMultiplier = 1;
  state.level = 1;
  state.levelStartTime = 0;
  createAmmoCrateSchedule();
  state.started = false;
  state.weaponUnlocked = false;
  state.weaponMessageActive = false;
  state.shieldUnlocked = false;
  state.shieldMessageActive = false;
  state.shieldCharges = 0;
  state.shieldTimeRemaining = 0;
  state.lastShieldLevel = 0;
  state.nextWarningAt = 100;
  state.lastLifeLevel = 1;
  updateHud();
}

function updateHud() {
  const level = getLevelFromScore(state.score);
  if (level > state.lastLifeLevel) {
    state.lives = Math.min(MAX_LIVES, state.lives + level - state.lastLifeLevel);
    state.lastLifeLevel = level;
  }

  state.bestLevel = Math.max(state.bestLevel, level);
  localStorage.setItem(BEST_LEVEL_KEY, String(state.bestLevel));

  const progress = state.score === 0 ? 0 : ((state.score - 1) % LEVEL_STEP) + 1;
  state.level = level;
  scoreEl.textContent = String(state.score);
  bestScoreEl.textContent = String(state.bestScore);
  bestLevelEl.textContent = String(state.bestLevel);
  levelEl.textContent = String(level);
  levelProgressValueEl.textContent = String(progress) + '%';
  levelProgressBarEl.style.width = String(progress) + '%';
  ammoEl.textContent = String(state.ammo);
  ammoEl.classList.toggle('low-ammo', state.weaponUnlocked && state.ammo <= 20);
  shieldsEl.textContent = String(state.shieldCharges);
  updateShieldTimeHud();
  livesEl.textContent = String(state.lives);
}

function updateShieldTimeHud() {
  const secondsRemaining = Math.ceil(Math.max(0, state.shieldTimeRemaining) / 1000);
  shieldTimeEl.textContent = String(secondsRemaining) + ' s';
}

function spawnStar() {
  const spawnRoll = Math.random();
  let type = 'normal';

  if (spawnRoll < FIVE_POINT_STAR_SPAWN_CHANCE) {
    type = 'fivePoint';
  } else if (spawnRoll < TWO_POINT_STAR_SPAWN_CHANCE) {
    type = 'twoPoint';
  }

  const starSettings = {
    fivePoint: {
      radius: 7,
      speed: randomBetween(4.8, 6.8),
      points: 5,
      hue: 48,
      blink: true,
    },
    twoPoint: {
      radius: 8.5,
      speed: randomBetween(3.2, 5.2),
      points: 2,
      hue: 185,
      blink: false,
    },
    normal: {
      radius: 10,
      speed: randomBetween(2.2, 4.2),
      points: 1,
      hue: randomBetween(35, 60),
      blink: false,
    },
  }[type];

  state.stars.push({
    x: randomBetween(28, canvas.width - 28),
    y: -20,
    ...starSettings,
    type,
  });
}

function spawnEnemy() {
  state.enemies.push({
    x: randomBetween(22, canvas.width - 22),
    y: -30,
    radius: randomBetween(18, 32),
    speed: randomBetween(2.6, 5.2),
    drift: randomBetween(-1.2, 1.2),
  });
}

function createAmmoCrateSchedule() {
  const levelDuration = 18000 + Math.max(0, (state.level - 1) * 2200);
  state.ammoCrateSchedule = [randomBetween(levelDuration * 0.18, levelDuration * 0.9)];
  state.ammoCratesSpawnedThisLevel = 0;
  state.ammoCrateScheduleLevel = state.level;
}

function spawnAmmoCrate() {
  state.ammoCrates.push({
    x: randomBetween(28, canvas.width - 28),
    y: -20,
    width: 20,
    height: 20,
    speed: randomBetween(1.2, 2.2),
    blink: true,
    blinkState: Math.random() > 0.5 ? 1 : 0,
  });
}

function createBurst(x, y, color, amount) {
  for (let i = 0; i < amount; i += 1) {
    state.particles.push({
      x,
      y,
      vx: randomBetween(-2.5, 2.5),
      vy: randomBetween(-2.5, 2.5),
      radius: randomBetween(2, 5),
      life: randomBetween(25, 45),
      color,
    });
  }
}

function handleInput() {
  const movementSpeed = state.level >= 5 ? state.player.speed * 1.5 : state.player.speed;

  if (keys.ArrowLeft || keys.a) {
    state.player.x -= movementSpeed;
  }
  if (keys.ArrowRight || keys.d) {
    state.player.x += movementSpeed;
  }
  if (keys.ArrowUp || keys.w) {
    state.player.y -= movementSpeed;
  }
  if (keys.ArrowDown || keys.s) {
    state.player.y += movementSpeed;
  }

  state.player.x = clamp(state.player.x, state.player.radius, canvas.width - state.player.radius);
  state.player.y = clamp(state.player.y, state.player.radius, canvas.height - state.player.radius);
}

function update(dt) {
  if (!state.started || state.gameOver) {
    return;
  }

  if (state.warningActive || state.weaponMessageActive || state.shieldMessageActive) {
    return;
  }

  const currentLevel = getLevelFromScore(state.score);
  const speedStep = currentLevel >= 5 ? LEVEL_FIVE_SPEED_STEP : SPEED_STEP;

  if (currentLevel !== state.ammoCrateScheduleLevel) {
    state.level = currentLevel;
    state.levelStartTime = state.runningTime;
    createAmmoCrateSchedule();
    playGameSound('levelUp');
  }

  if (!state.shieldUnlocked && currentLevel >= 4) {
    state.shieldUnlocked = true;
    state.shieldCharges =  state.lastShieldLevel = 4;
    state.shieldMessageActive = true;
    playGameSound('shield');
    updateHud();
    return;
  }

  if (state.shieldUnlocked && currentLevel > state.lastShieldLevel) {
    state.shieldCharges += currentLevel - state.lastShieldLevel;
    state.lastShieldLevel = currentLevel;
    updateHud();
  }

  if (!state.weaponUnlocked && state.score >= 200) {
    state.weaponMessageActive = true;
    playGameSound('weapon');
    updateHud();
    return;
  }

  if (state.score >= state.nextWarningAt) {
    state.warningActive = true;
    state.speedMultiplier += speedStep;
    state.nextWarningAt += 100;
    playGameSound('warning');
    return;
  }

  if (currentLevel >= 5 && !state.levelFiveWarningShown) {
    state.warningActive = true;
    state.levelFiveWarningActive = true;
    state.levelFiveWarningShown = true;
    state.speedMultiplier += speedStep;
    playGameSound('warning');
    return;
  }

  if (currentLevel >= 5) {
    state.speedMultiplier = Math.max(
      state.speedMultiplier,
      1.2 + (currentLevel - 5) * LEVEL_FIVE_SPEED_STEP,
    );
  }

  state.runningTime += dt * state.speedMultiplier;
  handleInput();

  if (state.shieldTimeRemaining > 0) {
    state.shieldTimeRemaining = Math.max(0, state.shieldTimeRemaining - dt);
    updateShieldTimeHud();
  }

  const starSpawnInterval = currentLevel >= 5 ? 3200 : 780;
  const enemySpawnInterval = currentLevel >= 5 ? 2400 : 1100;

  if (state.runningTime - state.lastSpawnStar > starSpawnInterval / state.speedMultiplier) {
    spawnStar();
    state.lastSpawnStar = state.runningTime;
  }

  if (state.runningTime - state.lastSpawnEnemy > enemySpawnInterval / state.speedMultiplier) {
    spawnEnemy();
    state.lastSpawnEnemy = state.runningTime;
  }

  while (
    state.ammoCratesSpawnedThisLevel < state.ammoCrateSchedule.length &&
    state.runningTime - state.levelStartTime >= state.ammoCrateSchedule[state.ammoCratesSpawnedThisLevel]
  ) {
    spawnAmmoCrate();
    state.ammoCratesSpawnedThisLevel += 1;
    playGameSound('crateSpawn');
  }

  for (const star of state.stars) {
    star.y += star.speed * (currentLevel >= 5 ? 1.5 : 1);

    const dx = star.x - state.player.x;
    const dy = star.y - state.player.y;
    const distance = Math.hypot(dx, dy);

    if (distance < star.radius + state.player.radius) {
      state.score += star.points;
      state.bestScore = Math.max(state.bestScore, state.score);
      localStorage.setItem(BEST_SCORE_KEY, String(state.bestScore));
      createBurst(star.x, star.y, 'hsl(' + star.hue + ' 100% 70%)', 18);
      playGameSound('collect');
      star.collected = true;
      updateHud();
    }
  }

  for (const ammoCrate of state.ammoCrates) {
    ammoCrate.y += ammoCrate.speed;
    ammoCrate.blinkState = (ammoCrate.blinkState + 1) % 2;

    const dx = ammoCrate.x - state.player.x;
    const dy = ammoCrate.y - state.player.y;
    const distance = Math.hypot(dx, dy);

    if (distance < ammoCrate.width * 0.6 + state.player.radius) {
      state.ammo = Math.min(MAX_AMMO, state.ammo + AMMO_CRATE_BONUS);
      createBurst(ammoCrate.x, ammoCrate.y, '#7ef29a', 20);
      playGameSound('ammo');
      ammoCrate.collected = true;
      updateHud();
    }
  }

  for (const bullet of state.bullets) {
    bullet.y -= bullet.speed;
  }

  for (const enemy of state.enemies) {
    enemy.y += enemy.speed * state.speedMultiplier;
    enemy.x += enemy.drift * state.speedMultiplier;
    if (enemy.x < enemy.radius) enemy.x = enemy.radius;
    if (enemy.x > canvas.width - enemy.radius) enemy.x = canvas.width - enemy.radius;

    for (const bullet of state.bullets) {
      const dx = bullet.x - enemy.x;
      const dy = bullet.y - enemy.y;
      const distance = Math.hypot(dx, dy);

      if (distance < bullet.radius + enemy.radius && !enemy.hit) {
        state.score += 1;
        state.bestScore = Math.max(state.bestScore, state.score);
        localStorage.setItem(BEST_SCORE_KEY, String(state.bestScore));
        playGameSound('enemyHit');
        bullet.hit = true;
        enemy.hit = true;
        createBurst(enemy.x, enemy.y, '#ffd166', 18);
        updateHud();
      }
    }

    const dx = enemy.x - state.player.x;
    const dy = enemy.y - state.player.y;
    const distance = Math.hypot(dx, dy);

    if (distance < enemy.radius + state.player.radius && state.shieldTimeRemaining <= 0) {
      enemy.hit = true;
      state.lives -= 1;
      playGameSound('playerHit');
      createBurst(enemy.x, enemy.y, '#ff6b6b', 24);
      updateHud();
      if (state.lives <= 0) {
        state.gameOver = true;
        window.soundManager?.stopAmbience();
        playGameSound('gameOver');
        createBurst(state.player.x, state.player.y, '#ffd166', 40);
      }
    }
  }

  state.stars = state.stars.filter((star) => !star.collected && star.y < canvas.height + 30);
  state.ammoCrates = state.ammoCrates.filter((ammoCrate) => !ammoCrate.collected && ammoCrate.y < canvas.height + 60);
  state.enemies = state.enemies.filter((enemy) => !enemy.hit && enemy.y < canvas.height + 40);
  state.bullets = state.bullets.filter((bullet) => !bullet.hit && bullet.y > -30);

  for (const particle of state.particles) {
    particle.x += particle.vx * state.speedMultiplier;
    particle.y += particle.vy * state.speedMultiplier;
    particle.life -= 1;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function drawBackground() {
  ctx.fillStyle = '#0a1224';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 70; i += 1) {
    const x = (i * 157) % canvas.width;
    const y = (i * 91 + (state.runningTime * 0.12)) % canvas.height;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawPlayer() {
  const { x, y, radius } = state.player;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();

  const oceanGradient = ctx.createRadialGradient(x - 8, y - 10, 4, x, y, radius);
  oceanGradient.addColorStop(0, '#79dcff');
  oceanGradient.addColorStop(0.65, '#1976d2');
  oceanGradient.addColorStop(1, '#073b87');
  ctx.fillStyle = oceanGradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  ctx.fillStyle = '#55c96f';
  ctx.beginPath();
  ctx.moveTo(x - 18, y - 12);
  ctx.lineTo(x - 8, y - 20);
  ctx.lineTo(x + 2, y - 16);
  ctx.lineTo(x + 7, y - 7);
  ctx.lineTo(x - 1, y - 2);
  ctx.lineTo(x - 9, y + 2);
  ctx.lineTo(x - 17, y - 3);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + 8, y - 17);
  ctx.lineTo(x + 18, y - 12);
  ctx.lineTo(x + 16, y - 3);
  ctx.lineTo(x + 8, y + 2);
  ctx.lineTo(x + 4, y - 5);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - 2, y + 4);
  ctx.lineTo(x + 7, y + 8);
  ctx.lineTo(x + 4, y + 18);
  ctx.lineTo(x - 5, y + 15);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  ctx.beginPath();
  ctx.strokeStyle = '#9ce8ff';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#2ca8ff';
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawShield() {
  if (state.shieldTimeRemaining <= 0) {
    return;
  }

  const pulse = 1 + Math.sin(state.runningTime * 0.04) * 0.08;
  const isBlinkingRed = state.shieldTimeRemaining <= 5000;
  const isRedVisible = Math.floor(state.runningTime / 180) % 2 === 0;
  const shieldColor = isBlinkingRed && isRedVisible ? '#ff4d4d' : '#5bc7ff';
  ctx.save();
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, (state.player.radius + 14) * pulse, 0, Math.PI * 2);
  ctx.fillStyle = isBlinkingRed && isRedVisible ? 'rgba(255, 77, 77, 0.12)' : 'rgba(71, 177, 255, 0.12)';
  ctx.strokeStyle = shieldColor;
  ctx.lineWidth = 4;
  ctx.shadowBlur = 28;
  ctx.shadowColor = shieldColor;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawStar(star) {
  ctx.save();
  ctx.translate(star.x, star.y);
  ctx.rotate(state.runningTime * 0.01);
  if (star.blink) {
    const isYellow = Math.floor(state.runningTime / 90) % 2 === 0;
    ctx.fillStyle = isYellow ? '#ffe45c' : '#ffffff';
  } else {
    ctx.fillStyle = 'hsl(' + star.hue + ' 100% 70%)';
  }
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const outerX = Math.cos((Math.PI / 180) * (i * 72)) * star.radius;
    const outerY = Math.sin((Math.PI / 180) * (i * 72)) * star.radius;
    const innerX = Math.cos((Math.PI / 180) * (i * 72 + 36)) * (star.radius * 0.45);
    const innerY = Math.sin((Math.PI / 180) * (i * 72 + 36)) * (star.radius * 0.45);
    if (i === 0) {
      ctx.moveTo(outerX, outerY);
    } else {
      ctx.lineTo(outerX, outerY);
    }
    ctx.lineTo(innerX, innerY);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAmmoCrate(crate) {
  const isVisible = crate.blinkState === 0 || Math.floor(state.runningTime / 90) % 2 === 0;
  if (!isVisible) {
    return;
  }

  ctx.save();
  ctx.translate(crate.x, crate.y);
  ctx.fillStyle = '#6df5a1';
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#7ef29a';
  ctx.fillRect(-crate.width / 2, -crate.height / 2, crate.width, crate.height);

  ctx.strokeStyle = '#0a1d17';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-crate.width / 2 + 4, -crate.height / 2 + 5);
  ctx.lineTo(crate.width / 2 - 4, -crate.height / 2 + 5);
  ctx.moveTo(-crate.width / 2 + 4, 0);
  ctx.lineTo(crate.width / 2 - 4, 0);
  ctx.moveTo(-crate.width / 2 + 4, crate.height / 2 - 5);
  ctx.lineTo(crate.width / 2 - 4, crate.height / 2 - 5);
  ctx.stroke();

  ctx.fillStyle = '#0b1d17';
  ctx.fillRect(-4, -7, 8, 14);
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.beginPath();
  ctx.fillStyle = '#ff8c69';
  ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2;
  ctx.moveTo(enemy.x - enemy.radius * 0.5, enemy.y);
  ctx.lineTo(enemy.x + enemy.radius * 0.5, enemy.y);
  ctx.stroke();
}

function drawScope() {
  if (!state.weaponUnlocked) {
    return;
  }

  const x = state.player.x;
  const topY = 0;
  const bottomY = state.player.y;

  ctx.save();
  ctx.strokeStyle = 'rgba(117, 255, 153, 0.9)';
  ctx.lineWidth = 3;
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#6dff9a';
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x, bottomY);
  ctx.stroke();

  const targetEnemy = state.enemies
    .filter((enemy) => Math.abs(enemy.x - x) <= enemy.radius)
    .reduce((target, enemy) => {
      if (!target || enemy.y > target.y) {
        return enemy;
      }
      return target;
    }, null);

  if (targetEnemy) {
    ctx.strokeStyle = '#55aaff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#1683ff';
    ctx.beginPath();
    ctx.moveTo(targetEnemy.x - 12, targetEnemy.y);
    ctx.lineTo(targetEnemy.x + 12, targetEnemy.y);
    ctx.moveTo(targetEnemy.x, targetEnemy.y - 12);
    ctx.lineTo(targetEnemy.x, targetEnemy.y + 12);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.fillStyle = 'rgba(130, 255, 170, 0.9)';
  ctx.shadowBlur = 24;
  ctx.shadowColor = '#7bffb0';
  ctx.arc(x, bottomY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.beginPath();
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = Math.max(particle.life / 45, 0.15);
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawStartScreen() {
  if (state.started) {
    return;
  }

  ctx.fillStyle = 'rgba(10, 18, 28, 0.86)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  const luckSweep = Math.sin(state.runningTime * 0.0012) * 120;
  const luckGradient = ctx.createLinearGradient(
    canvas.width / 2 - 190 + luckSweep,
    0,
    canvas.width / 2 + 190 + luckSweep,
    0,
  );
  luckGradient.addColorStop(0, '#4da3ff');
  luckGradient.addColorStop(0.35, '#4da3ff');
  luckGradient.addColorStop(0.5, '#7ef29a');
  luckGradient.addColorStop(0.65, '#4da3ff');
  luckGradient.addColorStop(1, '#4da3ff');
  ctx.fillStyle = luckGradient;
  ctx.shadowBlur = 24;
  ctx.shadowColor = '#3fcbff';
  ctx.font = 'bold 40px Arial';
  ctx.fillText('Lycka till :)', canvas.width / 2, canvas.height / 2 - 220);

  ctx.fillStyle = '#edf6ff';
  ctx.shadowBlur = 0;
  ctx.font = 'bold 32px Arial';
  ctx.fillText('STAR DODGE', canvas.width / 2, canvas.height / 2 - 175);

  ctx.font = '22px Arial';
  ctx.fillStyle = '#7ef29a';
  ctx.shadowBlur = 16;
  ctx.shadowColor = '#7ef29a';
  ctx.fillText('Du rör dig med W, A, S, D', canvas.width / 2, canvas.height / 2 - 140);
  ctx.fillText('De stora bollarna är Asteroider akta dig för dom.', canvas.width / 2, canvas.height / 2 - 110);
  ctx.fillText('Alla asteroider du tar sönder vid Nivå 3 kommer du att få 1 poäng för', canvas.width / 2, canvas.height / 2 - 80);
  ctx.fillText('När du kommer till nivå 3 kommer du kunna skjuta', canvas.width / 2, canvas.height / 2 - 40);
  ctx.fillText('och ditt sikte kommer att vara en linje.', canvas.width / 2, canvas.height / 2 - 10);

  ctx.fillStyle = '#dfefff';
  ctx.shadowBlur = 0;
  ctx.fillText('Den stora gula stjärnan är värd 1 poäng,', canvas.width / 2, canvas.height / 2 + 30);
  ctx.fillText('stjärnan som är lite mindre är värd 2 poäng,', canvas.width / 2, canvas.height / 2 + 62);
  ctx.fillText('den som blinkar är värd 5 poäng.', canvas.width / 2, canvas.height / 2 + 94);

  ctx.fillStyle = '#7ef29a';
  ctx.shadowBlur = 16;
  ctx.shadowColor = '#7ef29a';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('Läs vad det står längst ner på din skärm, gör din skärm till Full Screen', canvas.width / 2, canvas.height / 2 + 140);
  ctx.fillText('Tryck Enter för att börja ditt spel.', canvas.width / 2, canvas.height / 2 + 176);
  ctx.shadowBlur = 0;
}

function drawWarning() {
  if (!state.warningActive) {
    return;
  }

  ctx.fillStyle = 'rgba(12, 8, 16, 0.82)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ef29a';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('Nivå ' + state.level, canvas.width / 2, canvas.height / 2 - 52);

  if (state.levelFiveWarningActive) {
    ctx.fillStyle = '#7ef29a';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('Nu kommer din spelar boll gå 2 gånger så fort.', canvas.width / 2, canvas.height / 2 - 8);
    ctx.fillStyle = '#ff4d4d';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('Va försiktig nu!', canvas.width / 2, canvas.height / 2 + 38);
    ctx.fillStyle = '#dfefff';
    ctx.font = '22px Arial';
    ctx.fillText('Tryck Enter för att fortsätta', canvas.width / 2, canvas.height / 2 + 86);
    return;
  }

  ctx.fillStyle = '#ffb703';
  ctx.font = 'bold 30px Arial';
  ctx.fillText('VARNING DET KOMMER ATT GÅ FORTARE NU!', canvas.width / 2, canvas.height / 2 - 18);
  ctx.fillStyle = '#dfefff';
  ctx.font = '22px Arial';
  ctx.fillText('Tryck Enter för att fortsätta', canvas.width / 2, canvas.height / 2 + 28);
}

function drawWeaponMessage() {
  if (!state.weaponMessageActive) {
    return;
  }

  ctx.fillStyle = 'rgba(10, 18, 28, 0.84)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ef29a';
  ctx.font = 'bold 30px Arial';
  ctx.fillText('DU HAR FÅTT ETT VAPEN!', canvas.width / 2, canvas.height / 2 - 26);
  ctx.fillStyle = '#edf6ff';
  ctx.font = '22px Arial';
  ctx.fillText('Linjen är ditt sikte', canvas.width / 2, canvas.height / 2 + 12);
  ctx.fillText('Tryck P för att skjuta sönder asteroiderna', canvas.width / 2, canvas.height / 2 + 42);
  ctx.fillStyle = '#dfefff';
  ctx.fillText('Tryck Enter för att fortsätta', canvas.width / 2, canvas.height / 2 + 76);
}

function drawShieldMessage() {
  if (!state.shieldMessageActive) {
    return;
  }

  ctx.fillStyle = 'rgba(7, 18, 35, 0.88)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#5bc7ff';
  ctx.font = 'bold 28px Arial';
  ctx.fillText('DU HAR FÅTT SKÖLDAR!', canvas.width / 2, canvas.height / 2 - 58);
  ctx.fillStyle = '#edf6ff';
  ctx.font = '22px Arial';
  ctx.fillText('Du får tre sköldar och du tjänar en sköld varje gång du klarar en nivå!', canvas.width / 2, canvas.height / 2 - 12);
  ctx.fillText('För att använda skölden Tryck på O', canvas.width / 2, canvas.height / 2 + 34);
  ctx.fillStyle = '#dfefff';
  ctx.fillText('Tryck Enter för att fortsätta', canvas.width / 2, canvas.height / 2 + 82);
}

function drawGameOver() {
  if (!state.gameOver) {
    return;
  }

  ctx.fillStyle = 'rgba(5, 8, 18, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 46px Arial';
  ctx.fillText('Spelet slut', canvas.width / 2, canvas.height / 2 - 8);
  ctx.font = '26px Arial';
  ctx.fillStyle = '#ffd166';
  ctx.fillText('Poäng: ' + state.score, canvas.width / 2, canvas.height / 2 + 36);
  ctx.fillStyle = '#bfeaff';
  ctx.fillText('Tryck Enter för att spela igen', canvas.width / 2, canvas.height / 2 + 76);
}

let lastTime = 0;
function loop(timestamp) {
  const dt = timestamp - lastTime || 16.7;
  lastTime = timestamp;

  update(dt);
  drawBackground();

  for (const star of state.stars) drawStar(star);
  for (const ammoCrate of state.ammoCrates) drawAmmoCrate(ammoCrate);
  for (const enemy of state.enemies) drawEnemy(enemy);
  for (const bullet of state.bullets) {
    ctx.beginPath();
    ctx.fillStyle = '#7ae3ff';
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  drawPlayer();
  drawShield();
  drawScope();
  drawParticles();
  drawStartScreen();
  drawWarning();
  drawWeaponMessage();
  drawShieldMessage();
  drawGameOver();

  requestAnimationFrame(loop);
}

window.addEventListener('keydown', (event) => {
  keys[event.key] = true;
  keys[event.key.toLowerCase()] = true;

  if (event.key === 'Enter') {
    if (!state.started) {
      state.started = true;
      playGameSound('menu');
      window.soundManager?.startAmbience();
      return;
    }

    if (state.warningActive) {
      state.warningActive = false;
      state.levelFiveWarningActive = false;
      state.warningHandled = true;
      playGameSound('menu');
      return;
    }

    if (state.weaponMessageActive) {
      state.weaponMessageActive = false;
      state.weaponUnlocked = true;
      playGameSound('menu');
      updateHud();
      return;
    }

    if (state.shieldMessageActive) {
      state.shieldMessageActive = false;
      playGameSound('menu');
      return;
    }

    if (state.gameOver) {
      resetGame();
      playGameSound('menu');
      window.soundManager?.startAmbience();
    }
  }

  if ((event.key === 'p' || event.key === 'P') && state.weaponUnlocked && state.ammo > 0) {
    state.ammo -= 1;
    playGameSound('shoot');
    state.bullets.push({
      x: state.player.x,
      y: state.player.y - state.player.radius - 10,
      radius: 8,
      speed: 12,
      hit: false,
    });
    updateHud();
  }

  if ((event.key === 'o' || event.key === 'O') && state.shieldUnlocked && state.shieldCharges > 0 && state.shieldTimeRemaining <= 0) {
    state.shieldCharges -= 1;
    state.shieldTimeRemaining = SHIELD_DURATION_MS;
    playGameSound('shield');
    updateHud();
  }
});

window.addEventListener('keyup', (event) => {
  keys[event.key] = false;
  keys[event.key.toLowerCase()] = false;
});

copyLinkButton.addEventListener('click', copyGameLink);

resetGame();
requestAnimationFrame(loop);
