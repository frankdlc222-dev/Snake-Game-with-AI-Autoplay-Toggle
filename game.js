/* ═══════════════════════════════════════════════════
   Neon Snake Arena – game.js
   ═══════════════════════════════════════════════════ */

(() => {
  "use strict";

  /* ── DOM refs ──────────────────────────────────── */
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlay-text");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best-score");
  const lengthEl = document.getElementById("snake-length");
  const btnAI = document.getElementById("btn-ai");
  const btnPause = document.getElementById("btn-pause");
  const btnRestart = document.getElementById("btn-restart");
  const speedSlider = document.getElementById("speed-slider");
  const speedLabel = document.getElementById("speed-label");
  const gridSlider = document.getElementById("grid-slider");
  const gridLabel = document.getElementById("grid-label");
  const btnCopy = document.getElementById("btn-copy");
  const foodBtns = document.querySelectorAll(".food-btn");
  const dpadBtns = document.querySelectorAll(".dpad-btn");

  /* ── State ─────────────────────────────────────── */
  let gridSize = 20;
  let cellPx;
  let snake, dir, nextDir, food, score, bestScore, alive, paused, aiMode;
  let foodStyle = "classic";
  let loopId = null;
  let lastTick = 0;
  let particles = [];

  bestScore = parseInt(localStorage.getItem("neon-snake-best") || "0", 10);
  bestEl.textContent = bestScore;

  /* ── Helpers ───────────────────────────────────── */
  const rand = (n) => Math.floor(Math.random() * n);
  const tickInterval = () => {
    const s = parseInt(speedSlider.value, 10);
    return 260 - s * 24;          // speed 1 → 236 ms, 10 → 20 ms
  };

  function resizeCanvas() {
    const container = canvas.parentElement;
    const size = container.clientWidth;
    canvas.width = size;
    canvas.height = size;
    cellPx = size / gridSize;
  }

  /* ── Init / Reset ──────────────────────────────── */
  function init() {
    gridSize = parseInt(gridSlider.value, 10);
    resizeCanvas();
    const mid = Math.floor(gridSize / 2);
    snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    alive = true;
    paused = false;
    particles = [];
    scoreEl.textContent = "0";
    lengthEl.textContent = "3";
    overlay.classList.add("hidden");
    btnPause.querySelector(".btn-icon").textContent = "⏸";
    placeFood();
    if (loopId) cancelAnimationFrame(loopId);
    lastTick = 0;
    loopId = requestAnimationFrame(gameLoop);
  }

  function placeFood() {
    const occupied = new Set(snake.map((s) => `${s.x},${s.y}`));
    let fx, fy;
    do {
      fx = rand(gridSize);
      fy = rand(gridSize);
    } while (occupied.has(`${fx},${fy}`));
    food = { x: fx, y: fy };
  }

  /* ── Particles ─────────────────────────────────── */
  function spawnParticles(cx, cy, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ── AI ────────────────────────────────────────── */
  function aiStep() {
    const head = snake[0];
    const target = food;

    // BFS shortest path, avoids body
    const blocked = new Set(snake.map((s) => `${s.x},${s.y}`));
    // Don't block the tail – it will move away (unless we just ate)
    const tailKey = `${snake[snake.length - 1].x},${snake[snake.length - 1].y}`;
    blocked.delete(tailKey);

    const dirs = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];

    // BFS
    const start = `${head.x},${head.y}`;
    const queue = [{ key: start, path: [] }];
    const visited = new Set([start]);
    let foundPath = null;

    while (queue.length > 0) {
      const { key, path } = queue.shift();
      const [cx, cy] = key.split(",").map(Number);

      if (cx === target.x && cy === target.y) {
        foundPath = path;
        break;
      }

      for (const d of dirs) {
        const nx = cx + d.x;
        const ny = cy + d.y;
        if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) continue;
        const nk = `${nx},${ny}`;
        if (visited.has(nk) || blocked.has(nk)) continue;
        visited.add(nk);
        queue.push({ key: nk, path: [...path, d] });
      }
    }

    if (foundPath && foundPath.length > 0) {
      const move = foundPath[0];
      // Prevent 180° reversal
      if (!(move.x === -dir.x && move.y === -dir.y)) {
        nextDir = move;
        return;
      }
    }

    // Fallback: pick any safe direction
    const safeChoices = dirs.filter((d) => {
      if (d.x === -dir.x && d.y === -dir.y) return false;
      const nx = head.x + d.x;
      const ny = head.y + d.y;
      if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) return false;
      if (blocked.has(`${nx},${ny}`)) return false;
      return true;
    });

    if (safeChoices.length > 0) {
      // Prefer direction that keeps options open
      safeChoices.sort((a, b) => {
        const countOpen = (d) => {
          const nx = head.x + d.x;
          const ny = head.y + d.y;
          let c = 0;
          for (const d2 of dirs) {
            const nnx = nx + d2.x;
            const nny = ny + d2.y;
            if (nnx >= 0 && nnx < gridSize && nny >= 0 && nny < gridSize && !blocked.has(`${nnx},${nny}`)) c++;
          }
          return c;
        };
        return countOpen(b) - countOpen(a);
      });
      nextDir = safeChoices[0];
    }
  }

  /* ── Game Logic ────────────────────────────────── */
  function tick() {
    if (!alive || paused) return;

    if (aiMode) aiStep();

    dir = { ...nextDir };

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Wall collision
    if (head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize) {
      die();
      return;
    }

    // Self collision
    for (const seg of snake) {
      if (seg.x === head.x && seg.y === head.y) {
        die();
        return;
      }
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      lengthEl.textContent = snake.length;
      scoreEl.classList.remove("score-pop");
      void scoreEl.offsetWidth;          // reflow
      scoreEl.classList.add("score-pop");

      // Particles at food position
      const cx = (food.x + 0.5) * cellPx;
      const cy = (food.y + 0.5) * cellPx;
      spawnParticles(cx, cy, "#39ff14", 12);

      if (score > bestScore) {
        bestScore = score;
        bestEl.textContent = bestScore;
        localStorage.setItem("neon-snake-best", bestScore);
      }
      placeFood();
    } else {
      snake.pop();
    }
  }

  function die() {
    alive = false;
    const cx = (snake[0].x + 0.5) * cellPx;
    const cy = (snake[0].y + 0.5) * cellPx;
    spawnParticles(cx, cy, "#ff2d95", 30);
    overlayText.innerHTML = `GAME OVER<br><span style="font-size:1rem;color:#00f0ff">Score: ${score}</span>`;
    overlay.classList.remove("hidden");
  }

  /* ── Rendering ─────────────────────────────────── */
  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background grid lines
    ctx.strokeStyle = "rgba(30,30,74,0.6)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      const p = i * cellPx;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
      ctx.stroke();
    }

    // Food
    drawFood();

    // Snake
    for (let i = snake.length - 1; i >= 0; i--) {
      const seg = snake[i];
      const x = seg.x * cellPx;
      const y = seg.y * cellPx;
      const pad = cellPx * 0.08;
      const isHead = i === 0;

      // Glow
      const t = performance.now() / 600;
      const glowAlpha = isHead ? 0.5 + 0.2 * Math.sin(t) : 0.15;
      const grad = ctx.createRadialGradient(
        x + cellPx / 2, y + cellPx / 2, 0,
        x + cellPx / 2, y + cellPx / 2, cellPx
      );
      const baseColor = isHead ? "0,240,255" : "57,255,20";
      grad.addColorStop(0, `rgba(${baseColor},${glowAlpha})`);
      grad.addColorStop(1, `rgba(${baseColor},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x - cellPx * 0.3, y - cellPx * 0.3, cellPx * 1.6, cellPx * 1.6);

      // Body segment
      const brightness = 1 - (i / snake.length) * 0.55;
      if (isHead) {
        ctx.fillStyle = "#00f0ff";
      } else {
        ctx.fillStyle = `rgb(${Math.round(30 * brightness)},${Math.round(255 * brightness)},${Math.round(20 * brightness)})`;
      }
      const r = cellPx * 0.22;
      roundRect(ctx, x + pad, y + pad, cellPx - pad * 2, cellPx - pad * 2, r);
      ctx.fill();

      // Head eyes
      if (isHead) {
        ctx.fillStyle = "#0a0a1a";
        const eyeSize = cellPx * 0.12;
        const eyeOff = cellPx * 0.22;
        let ex1, ey1, ex2, ey2;
        if (dir.x === 1) {
          ex1 = x + cellPx * 0.65; ey1 = y + cellPx * 0.3;
          ex2 = x + cellPx * 0.65; ey2 = y + cellPx * 0.7;
        } else if (dir.x === -1) {
          ex1 = x + cellPx * 0.35; ey1 = y + cellPx * 0.3;
          ex2 = x + cellPx * 0.35; ey2 = y + cellPx * 0.7;
        } else if (dir.y === -1) {
          ex1 = x + cellPx * 0.3; ey1 = y + cellPx * 0.35;
          ex2 = x + cellPx * 0.7; ey2 = y + cellPx * 0.35;
        } else {
          ex1 = x + cellPx * 0.3; ey1 = y + cellPx * 0.65;
          ex2 = x + cellPx * 0.7; ey2 = y + cellPx * 0.65;
        }
        ctx.beginPath(); ctx.arc(ex1, ey1, eyeSize, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2, ey2, eyeSize, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Particles
    drawParticles();
  }

  function drawFood() {
    const x = food.x * cellPx;
    const y = food.y * cellPx;
    const cx = x + cellPx / 2;
    const cy = y + cellPx / 2;

    // Pulse glow
    const t = performance.now() / 400;
    const pulse = 0.6 + 0.4 * Math.sin(t);

    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellPx * 1.2);
    glowGrad.addColorStop(0, `rgba(255,45,149,${0.3 * pulse})`);
    glowGrad.addColorStop(1, "rgba(255,45,149,0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(x - cellPx * 0.5, y - cellPx * 0.5, cellPx * 2, cellPx * 2);

    if (foodStyle === "classic") {
      ctx.fillStyle = "#ff2d95";
      ctx.shadowColor = "#ff2d95";
      ctx.shadowBlur = 10 * pulse;
      ctx.beginPath();
      ctx.arc(cx, cy, cellPx * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      const emojis = { apple: "🍎", cherry: "🍒", star: "⭐", diamond: "💎" };
      const emoji = emojis[foodStyle] || "🟢";
      ctx.font = `${cellPx * 0.75}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, cx, cy + cellPx * 0.04);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ── Game Loop ─────────────────────────────────── */
  function gameLoop(ts) {
    loopId = requestAnimationFrame(gameLoop);
    const dt = ts - lastTick;
    if (dt >= tickInterval()) {
      lastTick = ts;
      tick();
    }
    updateParticles();
    draw();
  }

  /* ── Input ─────────────────────────────────────── */
  const dirMap = {
    ArrowUp:    { x: 0, y: -1 },
    ArrowDown:  { x: 0, y: 1 },
    ArrowLeft:  { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
    W: { x: 0, y: -1 },
    S: { x: 0, y: 1 },
    A: { x: -1, y: 0 },
    D: { x: 1, y: 0 },
  };

  document.addEventListener("keydown", (e) => {
    const mapped = dirMap[e.key];
    if (mapped) {
      e.preventDefault();
      if (aiMode) {
        // User input disables AI
        aiMode = false;
        btnAI.classList.remove("active");
      }
      // Prevent 180° reversal
      if (!(mapped.x === -dir.x && mapped.y === -dir.y)) {
        nextDir = mapped;
      }
      // If dead, restart
      if (!alive) init();
      return;
    }

    if (e.key === " " || e.key === "Escape") {
      e.preventDefault();
      togglePause();
    }
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      init();
    }
  });

  /* ── Button Events ─────────────────────────────── */
  btnAI.addEventListener("click", () => {
    aiMode = !aiMode;
    btnAI.classList.toggle("active", aiMode);
    if (!alive) init();
  });

  btnPause.addEventListener("click", togglePause);
  btnRestart.addEventListener("click", () => init());

  function togglePause() {
    if (!alive) return;
    paused = !paused;
    overlay.classList.toggle("hidden", !paused);
    overlayText.textContent = "PAUSED";
    btnPause.querySelector(".btn-icon").textContent = paused ? "▶" : "⏸";
  }

  speedSlider.addEventListener("input", () => {
    speedLabel.textContent = speedSlider.value;
  });

  gridSlider.addEventListener("input", () => {
    gridLabel.textContent = gridSlider.value;
    init();
  });

  foodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      foodBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      foodStyle = btn.dataset.food;
    });
  });

  /* D-Pad */
  const dpadMap = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  dpadBtns.forEach((btn) => {
    const handler = (e) => {
      e.preventDefault();
      const d = dpadMap[btn.dataset.dir];
      if (!d) return;
      if (aiMode) {
        aiMode = false;
        btnAI.classList.remove("active");
      }
      if (!(d.x === -dir.x && d.y === -dir.y)) nextDir = d;
      if (!alive) init();
    };
    btn.addEventListener("touchstart", handler, { passive: false });
    btn.addEventListener("mousedown", handler);
  });

  /* ── Copy & Customize ──────────────────────────── */
  btnCopy.addEventListener("click", async () => {
    try {
      const [htmlRes, cssRes, jsRes] = await Promise.all([
        fetch("index.html").then((r) => r.text()),
        fetch("style.css").then((r) => r.text()),
        fetch("game.js").then((r) => r.text()),
      ]);
      const full = `<!-- Neon Snake Arena – Single File Bundle -->\n${htmlRes}\n<style>\n${cssRes}\n</style>\n<script>\n${jsRes}\n<\/script>`;
      await navigator.clipboard.writeText(full);
      btnCopy.querySelector(".btn-icon").textContent = "✅";
      setTimeout(() => {
        btnCopy.querySelector(".btn-icon").textContent = "📋";
      }, 2000);
    } catch {
      // Fallback: just copy HTML
      const ta = document.createElement("textarea");
      ta.value = document.documentElement.outerHTML;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      btnCopy.querySelector(".btn-icon").textContent = "✅";
      setTimeout(() => {
        btnCopy.querySelector(".btn-icon").textContent = "📋";
      }, 2000);
    }
  });

  /* ── Resize handling ───────────────────────────── */
  window.addEventListener("resize", resizeCanvas);

  /* ── Start with AI on ──────────────────────────── */
  aiMode = true;
  init();
})();
