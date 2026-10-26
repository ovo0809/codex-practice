/* First-person controls and camera; runs offline directly from index.html. */
(() => {
  "use strict";
  const { createGame, turnRelative, step, interval, DIRECTIONS } = window.SnakeCore;
  const $ = (id) => document.getElementById(id);
  const canvas = $("game-board");
  const map = $("minimap");
  const mapContext = map.getContext("2d");
  const storageKey = "little-snake-best-v1";
  const yaws = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
  const headings = { up: "北 N", right: "东 E", down: "南 S", left: "西 W" };
  const modes = { relaxed: "悠闲", normal: "标准", fast: "挑战" };
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let state = createGame();
  let best = readBest();
  let bestAtStart = best;
  let lastTick = 0;
  let camera = pose();
  let cameraFrom = { ...camera };
  let renderer = null;
  let renderFailed = false;
  let pointerStart = null;
  let frozenTime = 0;
  $("reduce-motion").checked = motionPreference.matches;

  function pose() {
    return { x: state.snake[0].x + 0.5, z: state.snake[0].y + 0.5, yaw: yaws[state.direction] };
  }
  function readBest() {
    try {
      const value = Number(localStorage.getItem(storageKey));
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    } catch { return 0; }
  }
  function saveBest() {
    if (state.score <= best) return;
    best = state.score;
    try { localStorage.setItem(storageKey, String(best)); } catch { /* Storage is optional. */ }
  }
  function announce(message) { $("announcement").textContent = message; }

  function refresh() {
    const running = state.phase === "running";
    const paused = state.phase === "paused";
    const finished = state.phase === "over" || state.phase === "won";
    $("score").textContent = String(state.score).padStart(2, "0");
    $("best-score").textContent = String(best).padStart(2, "0");
    $("game-status").textContent = { ready: "准备出发", running: "探索中", paused: "已暂停", over: "本次探索结束", won: "整个花园都是你的了" }[state.phase];
    canvas.dataset.phase = state.phase;
    $("game-overlay").hidden = running || renderFailed;
    $("pause-button").disabled = renderFailed || (!running && !paused);
    $("play-button").disabled = renderFailed;
    $("restart-button").disabled = renderFailed;
    $("pause-label").textContent = paused ? "继续" : "暂停";
    document.querySelectorAll('input[name="difficulty"]').forEach((input) => { input.disabled = running || paused; });
    $("speed-label").textContent = `${modes[state.difficulty]} · ${(1000 / interval(state)).toFixed(1)} 格/秒`;
    $("difficulty-note").textContent = running || paused ? "本局速度已锁定，下局可以切换。" : "第一次探索？可以从悠闲开始。";
    $("direction-label").textContent = headings[state.direction];
    const head = state.snake[0];
    $("food-distance").textContent = state.food ? `${Math.abs(head.x - state.food.x) + Math.abs(head.y - state.food.y)} 格` : "已收集全部";
    $("overlay-eyebrow").textContent = paused ? "TAKE A BREATH" : finished ? "UNTIL NEXT TIME" : "A NEW PERSPECTIVE";
    $("overlay-title").textContent = paused ? "在这里，歇一会" : state.phase === "won" ? "你吃满了整个花园！" : state.phase === "over" ? (state.reason === "wall" ? "哎呀，碰到围墙了" : "哎呀，碰到自己了") : "从小蛇的眼睛，出发";
    $("overlay-copy").textContent = paused ? "风景会等你。准备好后，继续探索。" : finished ? `本次获得 ${state.score} 分${state.score > bestAtStart ? "，创造了新纪录！" : "。换个方向，再试一次。"}` : "自动向前，左右转弯。跟着红果子，探索这座小小花园。";
    $("play-label").textContent = paused ? "继续探索" : finished ? "再来一局" : "开始探索";
    $("overlay-hint").textContent = paused ? "空格键继续" : "Enter 开始 · A / D 或 ← / → 转弯";
    drawMap();
  }

  function start() {
    if (renderFailed || state.phase === "running") return;
    if (["over", "won"].includes(state.phase)) reset();
    state = { ...state, phase: "running" };
    lastTick = performance.now();
    cameraFrom = { ...camera };
    refresh();
    announce("探索开始。自动前进，左右键转弯，空格暂停。");
  }
  function reset() {
    state = createGame(state.difficulty);
    bestAtStart = best;
    camera = pose();
    cameraFrom = { ...camera };
    lastTick = performance.now();
    pointerStart = null;
    refresh();
  }
  function pause() {
    if (state.phase !== "running") return;
    state = { ...state, phase: "paused" };
    pointerStart = null;
    refresh();
    announce("游戏已暂停。");
  }
  function steer(side) {
    if (renderFailed) return;
    if (state.phase === "ready") start();
    if (state.phase === "running") state = turnRelative(state, side);
  }
  function togglePause() { state.phase === "running" ? pause() : start(); }

  function drawMap() {
    if (!mapContext) return;
    const ctx = mapContext;
    const scale = map.width / state.size;
    ctx.clearRect(0, 0, map.width, map.height);
    ctx.fillStyle = "#e4e9d9";
    ctx.fillRect(0, 0, map.width, map.height);
    ctx.strokeStyle = "#d2dbc7";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= state.size; i++) {
      ctx.moveTo(i * scale, 0); ctx.lineTo(i * scale, map.height);
      ctx.moveTo(0, i * scale); ctx.lineTo(map.width, i * scale);
    }
    ctx.stroke();
    state.snake.slice(1).forEach((cell) => {
      ctx.fillStyle = "#6c914f";
      ctx.fillRect(cell.x * scale + 0.5, cell.y * scale + 0.5, scale - 1, scale - 1);
    });
    if (state.food) {
      ctx.fillStyle = "#dc5a40";
      ctx.beginPath();
      ctx.arc((state.food.x + 0.5) * scale, (state.food.y + 0.5) * scale, scale * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
    const head = state.snake[0];
    const direction = DIRECTIONS[state.direction];
    const x = (head.x + 0.5) * scale;
    const y = (head.y + 0.5) * scale;
    ctx.fillStyle = "#203f30";
    ctx.beginPath();
    ctx.moveTo(x + direction.x * scale, y + direction.y * scale);
    ctx.lineTo(x - direction.x * scale * 0.6 - direction.y * scale * 0.7, y - direction.y * scale * 0.6 + direction.x * scale * 0.7);
    ctx.lineTo(x - direction.x * scale * 0.6 + direction.y * scale * 0.7, y - direction.y * scale * 0.6 - direction.x * scale * 0.7);
    ctx.closePath(); ctx.fill();
  }

  function failRenderer(message) {
    renderFailed = true;
    pause();
    $("render-error").hidden = false;
    $("render-error").textContent = `${message} 请使用支持 WebGL 的浏览器并开启硬件加速，然后刷新页面。`;
    refresh();
    announce(message);
  }

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (["arrowleft", "a", "arrowright", "d"].includes(key)) {
      event.preventDefault();
      if (!event.repeat) steer(key === "a" || key === "arrowleft" ? "left" : "right");
    } else if (event.code === "Space" && !event.target.closest("button,a")) {
      event.preventDefault();
      if (!event.repeat) togglePause();
    } else if (event.key === "Escape") pause();
    else if (event.key === "Enter" && !event.target.closest("button,a") && !event.repeat) start();
  });
  $("play-button").addEventListener("click", () => { start(); canvas.focus({ preventScroll: true }); });
  $("pause-button").addEventListener("click", () => { togglePause(); canvas.focus({ preventScroll: true }); });
  $("restart-button").addEventListener("click", () => { if (!renderFailed) { reset(); start(); canvas.focus({ preventScroll: true }); } });
  document.querySelectorAll("[data-turn]").forEach((button) => button.addEventListener("click", () => {
    steer(button.dataset.turn); canvas.focus({ preventScroll: true });
  }));
  document.querySelectorAll('input[name="difficulty"]').forEach((input) => input.addEventListener("change", () => {
    if (["running", "paused"].includes(state.phase)) return;
    state = createGame(input.value);
    bestAtStart = best;
    camera = pose(); cameraFrom = { ...camera };
    refresh();
  }));
  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) >= 20 && Math.abs(dx) > Math.abs(dy)) steer(dx < 0 ? "left" : "right");
  });
  canvas.addEventListener("pointercancel", () => { pointerStart = null; });
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) { best = Math.max(best, readBest()); refresh(); }
  });
  motionPreference.addEventListener("change", (event) => { $("reduce-motion").checked = event.matches; });
  if ($("fullscreen-button")) {
    const fullButton = $("fullscreen-button");
    fullButton.hidden = !document.fullscreenEnabled;
    fullButton.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await canvas.closest(".viewport").requestFullscreen();
      } catch { announce("浏览器暂不支持全屏，可以继续在此窗口玩。"); }
    });
    document.addEventListener("fullscreenchange", () => {
      fullButton.setAttribute("aria-pressed", String(!!document.fullscreenElement));
    });
  }
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    failRenderer("3D 画面暂时中断。");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    try {
      renderer?.dispose();
      renderer = window.SnakeRenderer.create(canvas);
      renderFailed = false;
      $("render-error").hidden = true;
      refresh();
      announce("3D 画面已恢复。按继续探索。");
    } catch (error) { failRenderer(error.message); }
  });

  function frame(now) {
    if (!renderFailed) {
      const tickLength = interval(state);
      if (state.phase === "running") {
        frozenTime = now;
        if (now - lastTick >= tickLength) {
          // Finish the previous visual move; never catch up after hidden tabs.
          cameraFrom = pose();
          const previousScore = state.score;
          state = step(state);
          lastTick = now;
          saveBest();
          refresh();
          if (state.score > previousScore) announce(`吃到果子，当前 ${state.score} 分。`);
          if (["over", "won"].includes(state.phase)) announce(`探索结束，得分 ${state.score}。按 Enter 再来一局。`);
        }
        const target = pose();
        const t = $("reduce-motion").checked ? 1 : Math.min(1, (now - lastTick) / tickLength);
        const yawProgress = t * t * (3 - 2 * t);
        const delta = Math.atan2(Math.sin(target.yaw - cameraFrom.yaw), Math.cos(target.yaw - cameraFrom.yaw));
        camera = { x: cameraFrom.x + (target.x - cameraFrom.x) * t, z: cameraFrom.z + (target.z - cameraFrom.z) * t, yaw: cameraFrom.yaw + delta * yawProgress };
      }
      try { renderer.render(state, camera, $("reduce-motion").checked ? 0 : frozenTime); }
      catch (error) { failRenderer(error.message); }
    }
    window.requestAnimationFrame(frame);
  }

  refresh();
  try {
    renderer = window.SnakeRenderer.create(canvas);
    new ResizeObserver(() => { if (!renderFailed) renderer.resize(); }).observe(canvas);
    window.addEventListener("resize", () => { if (!renderFailed) renderer.resize(); });
  } catch (error) { failRenderer(error.message); }
  window.requestAnimationFrame(frame);
})();
