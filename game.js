(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const shell = document.querySelector(".game-shell");

  const bgLayer = document.createElement("canvas");
  const bgCtx = bgLayer.getContext("2d");
  const brickLayer = document.createElement("canvas");
  const brickCtx = brickLayer.getContext("2d");

  const BALL_PAD = 30;
  const ballSprite = document.createElement("canvas");
  const ballSpriteCtx = ballSprite.getContext("2d");

  const PADDLE_PAD = 30;
  const paddleSprite = document.createElement("canvas");
  const paddleSpriteCtx = paddleSprite.getContext("2d");

  let W = 880;
  let H = 620;

  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const overlay = document.getElementById("overlay");
  const messageEl = document.getElementById("message");
  const actionBtn = document.getElementById("actionBtn");
  const diffButtons = Array.from(document.querySelectorAll(".diff-btn"));
  const diffInfo = document.getElementById("diffInfo");

  const PADDLE_H = 16;
  const BALL_R = 9;

  const BRICK_ROWS = 7;
  const BRICK_COLS = 11;

  const DIFFICULTIES = {
    easy: {
      speed: 5.2,
      maxSpeed: 9.5,
      speedUp: 0.035,
      timeAccel: 0.05,
      lives: 2,
      paddleScale: 1,
      info: "2 lives · slow ball · gentle acceleration",
    },
    normal: {
      speed: 6.8,
      maxSpeed: 12,
      speedUp: 0.08,
      timeAccel: 0.15,
      lives: 1,
      paddleScale: 1,
      info: "1 life · fast ball · steep acceleration",
    },
    hard: {
      speed: 8.4,
      maxSpeed: 15,
      speedUp: 0.13,
      timeAccel: 0.25,
      lives: 1,
      paddleScale: 1,
      info: "1 life · fastest ball · brutal acceleration",
    },
  };

  let difficulty = "normal";

  function paddleWidthFor(width) {
    const base = Math.max(96, Math.min(150, width * 0.16));
    return Math.round(base * DIFFICULTIES[difficulty].paddleScale);
  }

  let PADDLE_W, PADDLE_Y;
  let BRICK_GAP, BRICK_TOP, SIDE_MARGIN, BRICK_H, BRICK_W;

  const ROW_COLORS = [
    ["#ff4d8d", "#ff7ab0"],
    ["#ff9a3d", "#ffc06e"],
    ["#ffe14d", "#fff08f"],
    ["#5dff8f", "#a1ffbe"],
    ["#4ad6ff", "#8fe9ff"],
    ["#6f7bff", "#a4acff"],
    ["#c45dff", "#dc9bff"],
  ];

  const MAX_BOUNCE_ANGLE = Math.PI / 3;

  let layoutMode = "";
  let brickState = Array.from({ length: BRICK_ROWS }, () =>
    new Array(BRICK_COLS).fill(true)
  );

  let paddleX = 0;
  let mouseX = 0;

  let ball = { x: 0, y: 0, vx: 0, vy: 0, speed: 6.2 };
  let bricks = [];
  let particles = [];
  let score = 0;
  let lives = 3;
  let maxLives = 3;
  let state = "ready"; // ready | playing | paused | over | win
  let shake = 0;
  let trail = [];
  let stars = [];

  function createStars() {
    stars = [];
    for (let i = 0; i < 70; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.3,
        a: Math.random() * 0.6 + 0.15,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  function computeLayout(force) {
    const portrait = window.innerHeight > window.innerWidth;
    const mode = portrait ? "portrait" : "landscape";
    if (!force && mode === layoutMode) return false;
    layoutMode = mode;

    if (portrait) {
      W = 760;
      H = 840;
    } else {
      W = 880;
      H = 620;
    }
    canvas.width = W;
    canvas.height = H;
    bgLayer.width = W;
    bgLayer.height = H;
    brickLayer.width = W;
    brickLayer.height = H;

    PADDLE_W = paddleWidthFor(W);
    PADDLE_Y = H - 48;
    BRICK_GAP = 6;
    BRICK_TOP = 96;
    SIDE_MARGIN = portrait ? 26 : 40;
    BRICK_H = 26;
    BRICK_W =
      (W - SIDE_MARGIN * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;
    buildBackgroundLayer();
    buildBallSprite();
    buildPaddleSprite();
    return true;
  }

  function fitToScreen() {
    const s = Math.min(
      (window.innerWidth - 12) / (W + 36),
      (window.innerHeight - 12) / (H + 36),
      1
    );
    shell.style.transform = `translate(-50%, -50%) scale(${Math.max(s, 0.16)})`;
  }

  function buildBricks() {
    bricks = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        bricks.push({
          x: SIDE_MARGIN + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W,
          h: BRICK_H,
          row: r,
          col: c,
          alive: brickState[r][c],
          flash: 0,
        });
      }
    }
    redrawBrickLayer();
  }

  function renderLives() {
    livesEl.innerHTML = "";
    for (let i = 0; i < maxLives; i++) {
      const dot = document.createElement("div");
      dot.className = "life-dot" + (i < lives ? "" : " gone");
      livesEl.appendChild(dot);
    }
  }

  function resetBall() {
    ball.x = paddleX + PADDLE_W / 2;
    ball.y = PADDLE_Y - BALL_R - 2;
    ball.vx = 0;
    ball.vy = 0;
    ball.speed = DIFFICULTIES[difficulty].speed;
    trail = [];
    state = "ready";
  }

  function launchBall() {
    if (state !== "ready") return;
    const angle = (Math.random() * 0.5 - 0.25) - Math.PI / 2;
    ball.vx = Math.cos(angle) * ball.speed;
    ball.vy = Math.sin(angle) * ball.speed;
    state = "playing";
  }

  function startGame() {
    const diff = DIFFICULTIES[difficulty];
    score = 0;
    maxLives = diff.lives;
    lives = diff.lives;
    brickState = Array.from({ length: BRICK_ROWS }, () =>
      new Array(BRICK_COLS).fill(true)
    );
    PADDLE_W = paddleWidthFor(W);
    paddleX = (W - PADDLE_W) / 2;
    buildPaddleSprite();
    buildBricks();
    particles = [];
    updateScore();
    renderLives();
    resetBall();
    overlay.classList.add("hidden");
  }

  function updateScore() {
    scoreEl.textContent = String(score);
  }

  function showOverlay(title, message, btnText) {
    overlay.querySelector("h1").textContent = title;
    messageEl.innerHTML = message;
    actionBtn.textContent = btnText;
    overlay.classList.remove("hidden");
  }

  function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 5 + 1.5;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 1,
        color,
        size: Math.random() * 3.5 + 1.5,
      });
    }
  }

  function handleBrickCollisions() {
    for (const b of bricks) {
      if (!b.alive) continue;
      const nearestX = Math.max(b.x, Math.min(ball.x, b.x + b.w));
      const nearestY = Math.max(b.y, Math.min(ball.y, b.y + b.h));
      const dx = ball.x - nearestX;
      const dy = ball.y - nearestY;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

      b.alive = false;
      brickState[b.row][b.col] = false;
      b.flash = 0;
      score += (BRICK_ROWS - b.row) * 10;
      updateScore();
      shake = 7;
      spawnBurst(b.x + b.w / 2, b.y + b.h / 2, ROW_COLORS[b.row][0], 18);

      const overlapX = Math.min(ball.x + BALL_R - b.x, b.x + b.w - (ball.x - BALL_R));
      const overlapY = Math.min(ball.y + BALL_R - b.y, b.y + b.h - (ball.y - BALL_R));
      if (overlapX < overlapY) {
        ball.vx = -ball.vx;
        ball.x += ball.vx > 0 ? overlapX : -overlapX;
      } else {
        ball.vy = -ball.vy;
        ball.y += ball.vy > 0 ? overlapY : -overlapY;
      }

      const diff = DIFFICULTIES[difficulty];
      ball.speed = Math.min(ball.speed + diff.speedUp, diff.maxSpeed);
      normalizeBallSpeed();
      redrawBrickLayer();
      break;
    }

    if (bricks.every((b) => !b.alive)) {
      state = "win";
      showOverlay("Victory!", `All bricks cleared!<br>Final score: <b>${score}</b>`, "Play Again");
    }
  }

  function normalizeBallSpeed() {
    const mag = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx = (ball.vx / mag) * ball.speed;
    ball.vy = (ball.vy / mag) * ball.speed;
  }

  function update(dt) {
    for (const s of stars) s.tw += 0.03;

    if (shake > 0) shake *= 0.86;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.16;
      p.vx *= 0.99;
      p.life -= 0.024;
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (state === "ready") {
      paddleX += (mouseX - PADDLE_W / 2 - paddleX) * 0.28;
      paddleX = Math.max(0, Math.min(W - PADDLE_W, paddleX));
      ball.x = paddleX + PADDLE_W / 2;
      ball.y = PADDLE_Y - BALL_R - 2;
      return;
    }

    if (state !== "playing") return;

    paddleX += (mouseX - PADDLE_W / 2 - paddleX) * 0.28;
    paddleX = Math.max(0, Math.min(W - PADDLE_W, paddleX));

    const diff = DIFFICULTIES[difficulty];
    ball.speed = Math.min(ball.speed + diff.timeAccel * dt, diff.maxSpeed);
    normalizeBallSpeed();

    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 12) trail.shift();

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x - BALL_R < 0) {
      ball.x = BALL_R;
      ball.vx = Math.abs(ball.vx);
      spawnBurst(0, ball.y, "#7ff9ff", 5);
    } else if (ball.x + BALL_R > W) {
      ball.x = W - BALL_R;
      ball.vx = -Math.abs(ball.vx);
      spawnBurst(W, ball.y, "#7ff9ff", 5);
    }
    if (ball.y - BALL_R < 0) {
      ball.y = BALL_R;
      ball.vy = Math.abs(ball.vy);
      spawnBurst(ball.x, 0, "#7ff9ff", 5);
    }

    if (ball.y - BALL_R > H) {
      loseLife();
      return;
    }

    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= PADDLE_Y &&
      ball.y - BALL_R <= PADDLE_Y + PADDLE_H &&
      ball.x >= paddleX - BALL_R &&
      ball.x <= paddleX + PADDLE_W + BALL_R
    ) {
      ball.y = PADDLE_Y - BALL_R;
      const hitPos = (ball.x - (paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
      const angle = hitPos * MAX_BOUNCE_ANGLE;
      ball.vx = Math.sin(angle) * ball.speed;
      ball.vy = -Math.cos(angle) * ball.speed;
      ball.speed = Math.min(ball.speed + diff.speedUp * 0.5, diff.maxSpeed);
      normalizeBallSpeed();
      spawnBurst(ball.x, PADDLE_Y, "#4aa8ff", 10);
      shake = 3;
    }

    handleBrickCollisions();
  }

  function loseLife() {
    lives--;
    renderLives();
    shake = 12;
    spawnBurst(ball.x, H - 10, "#ff4d8d", 26);
    if (lives <= 0) {
      state = "over";
      showOverlay("Game Over", `Final score: <b>${score}</b><br>Better luck next time!`, "Restart");
    } else {
      resetBall();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function buildBackgroundLayer() {
    bgCtx.clearRect(0, 0, W, H);

    const g = bgCtx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1330");
    g.addColorStop(0.5, "#070b16");
    g.addColorStop(1, "#05070f");
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0, 0, W, H);

    bgCtx.save();
    bgCtx.globalCompositeOperation = "lighter";
    const glow = bgCtx.createRadialGradient(W / 2, H * 0.15, 20, W / 2, H * 0.15, 420);
    glow.addColorStop(0, "rgba(60, 110, 255, 0.20)");
    glow.addColorStop(1, "rgba(60, 110, 255, 0)");
    bgCtx.fillStyle = glow;
    bgCtx.fillRect(0, 0, W, H);
    bgCtx.restore();

    bgCtx.strokeStyle = "rgba(70, 120, 220, 0.10)";
    bgCtx.lineWidth = 1;
    for (let x = 0; x <= W; x += 44) {
      bgCtx.beginPath();
      bgCtx.moveTo(x, 0);
      bgCtx.lineTo(x, H);
      bgCtx.stroke();
    }
    for (let y = 0; y <= H; y += 44) {
      bgCtx.beginPath();
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(W, y);
      bgCtx.stroke();
    }
  }

  function drawStars() {
    for (const s of stars) {
      const a = s.a * (0.55 + 0.45 * Math.sin(s.tw));
      ctx.fillStyle = `rgba(180, 220, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function redrawBrickLayer() {
    brickCtx.clearRect(0, 0, W, H);
    for (const b of bricks) {
      if (!b.alive) continue;
      const [c1, c2] = ROW_COLORS[b.row];
      const grad = brickCtx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      grad.addColorStop(0, c2);
      grad.addColorStop(1, c1);

      brickCtx.save();
      brickCtx.shadowColor = c1;
      brickCtx.shadowBlur = 14;
      brickCtx.fillStyle = grad;
      roundRect(brickCtx, b.x, b.y, b.w, b.h, 6);
      brickCtx.fill();
      brickCtx.restore();

      brickCtx.fillStyle = "rgba(255, 255, 255, 0.30)";
      roundRect(brickCtx, b.x + 3, b.y + 3, b.w - 6, 4, 2);
      brickCtx.fill();
    }
  }

  function buildBallSprite() {
    const size = (BALL_R + BALL_PAD) * 2;
    ballSprite.width = size;
    ballSprite.height = size;
    const c = ballSpriteCtx;
    const cx = size / 2;
    const cy = size / 2;
    c.clearRect(0, 0, size, size);
    c.save();
    c.shadowColor = "#7ff9ff";
    c.shadowBlur = 26;
    const g = c.createRadialGradient(
      cx - BALL_R * 0.35,
      cy - BALL_R * 0.35,
      1,
      cx,
      cy,
      BALL_R
    );
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, "#a8f6ff");
    g.addColorStop(1, "#3ea7ff");
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, BALL_R, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function buildPaddleSprite() {
    const w = PADDLE_W + PADDLE_PAD * 2;
    const h = PADDLE_H + PADDLE_PAD * 2;
    paddleSprite.width = w;
    paddleSprite.height = h;
    const c = paddleSpriteCtx;
    c.clearRect(0, 0, w, h);
    c.save();
    c.shadowColor = "#4aa8ff";
    c.shadowBlur = 22;
    const g = c.createLinearGradient(PADDLE_PAD, 0, PADDLE_PAD + PADDLE_W, 0);
    g.addColorStop(0, "#4ad6ff");
    g.addColorStop(0.5, "#6f8bff");
    g.addColorStop(1, "#c45dff");
    c.fillStyle = g;
    roundRect(c, PADDLE_PAD, PADDLE_PAD, PADDLE_W, PADDLE_H, PADDLE_H / 2);
    c.fill();
    c.restore();

    c.fillStyle = "rgba(255, 255, 255, 0.5)";
    roundRect(c, PADDLE_PAD + 8, PADDLE_PAD + 3, PADDLE_W - 16, 3, 1.5);
    c.fill();
  }

  function drawPaddle() {
    ctx.drawImage(paddleSprite, paddleX - PADDLE_PAD, PADDLE_Y - PADDLE_PAD);
  }

  function drawBall() {
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const a = (i / trail.length) * 0.35;
      ctx.fillStyle = `rgba(120, 230, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, BALL_R * (i / trail.length), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.drawImage(ballSprite, ball.x - BALL_R - BALL_PAD, ball.y - BALL_R - BALL_PAD);
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.save();
    if (shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    ctx.drawImage(bgLayer, 0, 0);
    drawStars();
    ctx.drawImage(brickLayer, 0, 0);
    drawPaddle();
    drawBall();
    drawParticles();
    ctx.restore();
  }

  const STEP = 1 / 60;
  let lastFrame = 0;
  let accumulator = 0;

  function loop(now) {
    if (!lastFrame) lastFrame = now;
    let frameTime = (now - lastFrame) / 1000;
    lastFrame = now;
    if (frameTime > 0.25) frameTime = 0.25;
    accumulator += frameTime;

    let steps = 0;
    while (accumulator >= STEP && steps < 6) {
      update(STEP);
      accumulator -= STEP;
      steps++;
    }
    if (steps === 6) accumulator = 0;

    render();
    requestAnimationFrame(loop);
  }

  function pointerToGameX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  canvas.addEventListener("mousemove", (e) => {
    mouseX = pointerToGameX(e.clientX);
  });

  canvas.addEventListener("click", () => {
    if (state === "ready") launchBall();
  });

  function onTouch(e) {
    const t = e.touches[0];
    if (!t) return;
    mouseX = pointerToGameX(t.clientX);
    e.preventDefault();
  }

  canvas.addEventListener("touchstart", onTouch, { passive: false });
  canvas.addEventListener("touchmove", onTouch, { passive: false });

  canvas.addEventListener(
    "touchend",
    (e) => {
      if (state === "ready") launchBall();
      e.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (state === "ready") launchBall();
    }
  });

  actionBtn.addEventListener("click", () => {
    startGame();
  });

  diffButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      difficulty = btn.dataset.diff;
      diffButtons.forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      diffInfo.textContent = DIFFICULTIES[difficulty].info;
    });
  });

  function handleResize() {
    const changed = computeLayout(false);
    if (changed) {
      createStars();
      buildBricks();
      paddleX = Math.max(0, Math.min(W - PADDLE_W, paddleX));
      if (state !== "over" && state !== "win") {
        resetBall();
      }
    }
    fitToScreen();
  }

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", () => {
    setTimeout(handleResize, 150);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitToScreen);
  }

  computeLayout(true);
  createStars();
  buildBricks();
  paddleX = (W - PADDLE_W) / 2;
  mouseX = W / 2;
  resetBall();
  renderLives();
  fitToScreen();
  requestAnimationFrame(loop);
})();
