/* The game also runs directly from index.html: no build or network needed. */
(() => {
  "use strict";
  const { createGame, turn, step, interval, DIRECTIONS } = window.SnakeCore;
  const $ = (id) => document.getElementById(id);
  const canvas = $("game-board");
  const ctx = canvas.getContext("2d");
  const storageKey = "little-snake-best-v1";
  const modeCopy = {
    relaxed: ["慢慢来", "放慢一点，享受每一次转弯。"],
    normal: ["刚刚好", "不慌不忙，也要眼疾手快。"],
    fast: ["加把劲", "心跳快一点，快乐多一点。"],
  };
  let state = createGame();
  let best = readBest();
  let bestAtStart = best;
  let lastTick = 0;
  let boardWidth = 600;

  function readBest() {
    try {
      const stored = Number(localStorage.getItem(storageKey));
      return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
    } catch {
      return 0;
    }
  }

  function saveBest() {
    if (state.score <= best) return;
    best = state.score;
    try {
      localStorage.setItem(storageKey, String(best));
    } catch {
      /* Gameplay works without storage. */
    }
  }

  function announce(message) {
    $("announcement").textContent = message;
  }

  function refresh() {
    $("score").textContent = String(state.score).padStart(2, "0");
    $("mobile-score").textContent = String(state.score).padStart(2, "0");
    $("best-score").textContent = String(best).padStart(2, "0");
    const active = state.phase === "running";
    const paused = state.phase === "paused";
    const finished = ["over", "won"].includes(state.phase);
    const record = state.score > bestAtStart;
    $("score-caption").textContent = record
      ? "新纪录！这一口，值得庆祝。"
      : "每一口，都是新进步。";
    $("game-status").textContent = {
      ready: "准备就绪",
      running: "快乐生长中",
      paused: "休息一下",
      over: "这局也很棒",
      won: "吃满整个棋盘！",
    }[state.phase];
    $("game-status-dot").style.background =
      state.phase === "over" ? "#e77358" : paused ? "#b3a274" : "#7a9c50";
    $("game-overlay").hidden = active;
    $("pause-button").disabled = !active && !paused;
    $("pause-label").textContent = paused ? "继续" : "暂停";
    document.querySelectorAll('input[name="difficulty"]').forEach((input) => {
      input.disabled = active || paused;
    });
    $("difficulty-note").textContent =
      active || paused
        ? "本局节奏已锁定，下局可以换个速度。"
        : modeCopy[state.difficulty][1];
    if (!active) {
      $("overlay-eyebrow").textContent = paused
        ? "深呼吸，下一口更从容"
        : finished
          ? record
            ? "属于你的新纪录"
            : "每次转弯，都是一次练习"
          : "今日份的小快乐";
      $("overlay-title").textContent = paused
        ? "小蛇歇一会"
        : state.phase === "won"
          ? "你把快乐吃满了！"
          : state.phase === "over"
            ? "哎呀，撞到了"
            : "小蛇准备好啦";
      $("overlay-copy").textContent = paused
        ? "准备好后，我们接着长大。"
        : finished
          ? `这次吃到了 ${state.score} 分，再来一口？`
          : "吃掉红果子，看看能长到多长。";
      $("play-label").textContent = paused
        ? "继续游戏"
        : finished
          ? "再来一局"
          : "开始游戏";
      $("overlay-hint").textContent = paused
        ? "按空格键也可以继续"
        : finished
          ? "按 Enter 键，开启下一局"
          : "也可以按方向键开始";
    }
    draw();
  }

  function start() {
    if (["over", "won"].includes(state.phase)) reset(false);
    state = { ...state, phase: "running" };
    lastTick = performance.now();
    refresh();
    announce("游戏开始。使用方向键移动，空格暂停。");
  }

  function reset(play = false) {
    state = createGame(state.difficulty);
    bestAtStart = best;
    lastTick = performance.now();
    refresh();
    if (play) start();
  }

  function pause() {
    if (state.phase !== "running") return;
    state = { ...state, phase: "paused" };
    refresh();
    announce("游戏已暂停。");
  }

  function changeDirection(direction) {
    if (state.phase === "ready") start();
    if (state.phase === "running") state = turn(state, direction);
  }

  function roundedRect(x, y, width, height, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  }

  function draw() {
    const unit = boardWidth / state.size;
    ctx.clearRect(0, 0, boardWidth, boardWidth);
    ctx.fillStyle = "#e9eddf";
    ctx.fillRect(0, 0, boardWidth, boardWidth);
    ctx.strokeStyle = "#dce3cf";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 1; i < state.size; i++) {
      ctx.moveTo(i * unit, 0);
      ctx.lineTo(i * unit, boardWidth);
      ctx.moveTo(0, i * unit);
      ctx.lineTo(boardWidth, i * unit);
    }
    ctx.stroke();

    if (state.food) {
      const x = (state.food.x + 0.5) * unit;
      const y = (state.food.y + 0.55) * unit;
      ctx.fillStyle = "#718d4f";
      ctx.beginPath();
      ctx.ellipse(
        x + unit * 0.12,
        y - unit * 0.37,
        unit * 0.18,
        unit * 0.09,
        -0.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#e7775a";
      ctx.beginPath();
      ctx.arc(x, y, unit * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f5b49c";
      ctx.beginPath();
      ctx.arc(x - unit * 0.1, y - unit * 0.1, unit * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }

    // Connect cells so turns look like one continuous little snake.
    state.snake.slice(1).forEach((cell, i) => {
      const next = state.snake[i];
      const x = (Math.min(cell.x, next.x) + 0.1) * unit;
      const y = (Math.min(cell.y, next.y) + 0.1) * unit;
      roundedRect(
        x,
        y,
        (Math.abs(cell.x - next.x) + 0.8) * unit,
        (Math.abs(cell.y - next.y) + 0.8) * unit,
        unit * 0.15,
        "#a8c773",
      );
    });
    [...state.snake].reverse().forEach((cell, i) => {
      const head = i === state.snake.length - 1;
      roundedRect(
        (cell.x + 0.07) * unit,
        (cell.y + 0.07) * unit,
        unit * 0.86,
        unit * 0.86,
        unit * 0.24,
        head ? "#597c3e" : i % 2 ? "#b4d879" : "#badf7e",
      );
    });
    const head = state.snake[0];
    const delta = DIRECTIONS[state.direction];
    const side = { x: -delta.y, y: delta.x };
    for (const sign of [-1, 1]) {
      const x = (head.x + 0.5 + delta.x * 0.18 + side.x * 0.2 * sign) * unit;
      const y = (head.y + 0.5 + delta.y * 0.18 + side.y * 0.2 * sign) * unit;
      ctx.fillStyle = "#f5f8e8";
      ctx.beginPath();
      ctx.arc(x, y, unit * 0.105, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#253e2e";
      ctx.beginPath();
      ctx.arc(
        x + delta.x * unit * 0.025,
        y + delta.y * unit * 0.025,
        unit * 0.05,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  function resize() {
    boardWidth = canvas.getBoundingClientRect().width;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(boardWidth * ratio);
    canvas.height = Math.round(boardWidth * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  const keyDirections = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };
  window.addEventListener("keydown", (event) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)
    )
      return;
    const direction =
      keyDirections[event.key] || keyDirections[event.key.toLowerCase()];
    if (direction) {
      event.preventDefault();
      changeDirection(direction);
    } else if (event.code === "Space") {
      // Native buttons retain their Space activation when focused.
      if (event.target.closest("button")) return;
      event.preventDefault();
      if (event.repeat) return;
      if (state.phase === "running") pause();
      else start();
    } else if (event.key === "Escape") pause();
    else if (
      event.key === "Enter" &&
      !event.target.closest("button,a") &&
      state.phase !== "running"
    )
      start();
  });

  $("play-button").addEventListener("click", () => {
    start();
    canvas.focus({ preventScroll: true });
  });
  $("pause-button").addEventListener("click", () => {
    state.phase === "running" ? pause() : start();
    canvas.focus({ preventScroll: true });
  });
  $("restart-button").addEventListener("click", () => {
    reset(true);
    canvas.focus({ preventScroll: true });
  });
  document.querySelectorAll('input[name="difficulty"]').forEach((input) =>
    input.addEventListener("change", () => {
      state = createGame(input.value);
      bestAtStart = best;
      $("speed-label").textContent = modeCopy[input.value][0];
      refresh();
    }),
  );
  document.querySelectorAll("[data-direction]").forEach((button) =>
    button.addEventListener("click", () => {
      changeDirection(button.dataset.direction);
      canvas.focus({ preventScroll: true });
    }),
  );

  let pointerStart = null;
  canvas.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
    changeDirection(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "down"
          : "up",
    );
  });
  canvas.addEventListener("pointercancel", () => {
    pointerStart = null;
  });
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) {
      best = Math.max(best, readBest());
      refresh();
    }
  });
  new ResizeObserver(resize).observe(canvas);

  function frame(now) {
    if (state.phase === "running" && now - lastTick >= interval(state)) {
      // Never catch up stale ticks after a background tab or a slow frame.
      lastTick = now;
      const previousScore = state.score;
      state = step(state);
      saveBest();
      if (state.score !== previousScore || state.phase !== "running") {
        refresh();
        if (["over", "won"].includes(state.phase))
          announce(`游戏结束，得分 ${state.score}。按 Enter 再来一局。`);
      } else draw();
    }
    window.requestAnimationFrame(frame);
  }
  refresh();
  resize();
  window.requestAnimationFrame(frame);
})();
