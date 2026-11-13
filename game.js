(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const shell = document.querySelector(".game-shell");

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

    PADDLE_W = paddleWidthFor(W);
    PADDLE_Y = H - 48;
    BRICK_GAP = 6;
    BRICK_TOP = 96;
    SIDE_MARGIN = portrait ? 26 : 40;
    BRICK_H = 26;
    BRICK_W =
      (W - SIDE_MARGIN * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;
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

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1330");
    g.addColorStop(0.5, "#070b16");
    g.addColorStop(1, "#05070f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(W / 2, H * 0.15, 20, W / 2, H * 0.15, 420);
    glow.addColorStop(0, "rgba(60, 110, 255, 0.20)");
    glow.addColorStop(1, "rgba(60, 110, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    for (const s of stars) {
      const a = s.a * (0.55 + 0.45 * Math.sin(s.tw));
      ctx.fillStyle = `rgba(180, 220, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(70, 120, 220, 0.10)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function drawBricks() {
    for (const b of bricks) {
      if (!b.alive) continue;
      const [c1, c2] = ROW_COLORS[b.row];
      const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      grad.addColorStop(0, c2);
      grad.addColorStop(1, c1);

      ctx.save();
      ctx.shadowColor = c1;
      ctx.shadowBlur = 14;
      ctx.fillStyle = grad;
      roundRect(b.x, b.y, b.w, b.h, 6);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(255, 255, 255, 0.30)";
      roundRect(b.x + 3, b.y + 3, b.w - 6, 4, 2);
      ctx.fill();
    }
  }

  function drawPaddle() {
    ctx.save();
    ctx.shadowColor = "#4aa8ff";
    ctx.shadowBlur = 22;
    const g = ctx.createLinearGradient(paddleX, 0, paddleX + PADDLE_W, 0);
    g.addColorStop(0, "#4ad6ff");
    g.addColorStop(0.5, "#6f8bff");
    g.addColorStop(1, "#c45dff");
    ctx.fillStyle = g;
    roundRect(paddleX, PADDLE_Y, PADDLE_W, PADDLE_H, PADDLE_H / 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    roundRect(paddleX + 8, PADDLE_Y + 3, PADDLE_W - 16, 3, 1.5);
    ctx.fill();
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

    ctx.save();
    ctx.shadowColor = "#7ff9ff";
    ctx.shadowBlur = 26;
    const g = ctx.createRadialGradient(
      ball.x - BALL_R * 0.35,
      ball.y - BALL_R * 0.35,
      1,
      ball.x,
      ball.y,
      BALL_R
    );
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, "#a8f6ff");
    g.addColorStop(1, "#3ea7ff");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
    drawBackground();
    drawBricks();
    drawPaddle();
    drawBall();
    drawParticles();
    ctx.restore();
  }

  let lastFrame = 0;

  function loop(now) {
    if (!lastFrame) lastFrame = now;
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    update(dt);
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
