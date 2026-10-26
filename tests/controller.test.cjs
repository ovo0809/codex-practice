const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../game-core.js");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "..", "game.js"),
  "utf8",
);

class FakeTarget {
  constructor(properties = {}) {
    Object.assign(this, {
      tagName: "DIV",
      textContent: "",
      hidden: false,
      disabled: false,
      checked: false,
      dataset: {},
      style: {},
    }, properties);
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, properties = {}) {
    const event = {
      target: this,
      key: "",
      code: "",
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      isPrimary: true,
      pointerType: "mouse",
      button: 0,
      preventDefault() {},
      ...properties,
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }

  click() {
    if (!this.disabled) this.emit("click");
  }

  closest() { return null; }
  focus() {}
  setPointerCapture() {}
  setAttribute(name, value) { this[name] = value; }
}

function createHarness(options = {}) {
  let now = 0;
  let frames = [];
  const renders = [];
  const instances = [];
  const windowTarget = new FakeTarget();
  const documentTarget = new FakeTarget({ hidden: false, fullscreenEnabled: false });
  const mapContext = new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = () => {};
      return target[property];
    },
  });
  const elements = new Map();
  const ids = [
    "game-board", "minimap", "reduce-motion", "score", "best-score",
    "game-status", "game-overlay", "pause-button", "play-button",
    "restart-button", "pause-label", "speed-label", "difficulty-note",
    "direction-label", "food-distance", "overlay-eyebrow", "overlay-title",
    "overlay-copy", "play-label", "overlay-hint", "announcement",
    "render-error", "fullscreen-button",
  ];
  for (const id of ids) elements.set(id, new FakeTarget({ id }));
  elements.get("game-board").tagName = "CANVAS";
  elements.get("game-board").closest = (selector) => selector === ".viewport"
    ? new FakeTarget({ requestFullscreen: async () => {} })
    : null;
  Object.assign(elements.get("minimap"), {
    tagName: "CANVAS",
    width: 160,
    height: 160,
    getContext: () => mapContext,
  });
  const difficulties = ["relaxed", "normal", "fast"].map((value) =>
    new FakeTarget({ tagName: "INPUT", value, checked: value === "normal" }));
  const turnButtons = ["left", "right"].map((turn) =>
    new FakeTarget({ tagName: "BUTTON", dataset: { turn } }));

  documentTarget.getElementById = (id) => elements.get(id) || null;
  documentTarget.querySelectorAll = (selector) => {
    if (selector === 'input[name="difficulty"]') return difficulties;
    if (selector === "[data-turn]") return turnButtons;
    return [];
  };
  documentTarget.exitFullscreen = async () => {};
  documentTarget.fullscreenElement = null;

  const storage = {
    getItem() {
      if (options.storageThrows) throw new Error("storage blocked");
      return options.best ?? null;
    },
    setItem() {
      if (options.storageThrows) throw new Error("storage blocked");
    },
  };
  const snakeCore = options.foodAhead
    ? {
        ...core,
        createGame(difficulty) {
          return { ...core.createGame(difficulty, () => 0), food: { x: 12, y: 9 } };
        },
      }
    : core;
  const rendererFactory = {
    create() {
      if (options.webglFailure) throw new Error("WebGL unavailable");
      const instance = {
        disposed: false,
        render(state, camera, time) {
          renders.push({
            state: JSON.parse(JSON.stringify(state)),
            camera: { ...camera },
            time,
          });
        },
        resize() {},
        dispose() { this.disposed = true; },
      };
      instances.push(instance);
      return instance;
    },
  };
  const motionPreference = new FakeTarget({ matches: false });
  const context = {
    SnakeCore: snakeCore,
    SnakeRenderer: rendererFactory,
    document: documentTarget,
    localStorage: storage,
    performance: { now: () => now },
    requestAnimationFrame(callback) { frames.push(callback); },
    matchMedia: () => motionPreference,
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
    devicePixelRatio: 1,
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() {}
    },
    console,
    Math,
  };
  context.window = context;
  vm.runInNewContext(controllerSource, context, { filename: "game.js" });

  function runFrame(time) {
    now = time;
    const callback = frames.shift();
    assert.ok(callback, "controller should schedule an animation frame");
    callback(time);
  }

  function key(key, properties = {}) {
    const code = key === " " ? "Space" : properties.code || "";
    windowTarget.emit("keydown", {
      key,
      code,
      target: new FakeTarget(),
      ...properties,
    });
  }

  return {
    elements,
    instances,
    renders,
    turnButtons,
    key,
    runFrame,
    setNow(value) { now = value; },
    blur() { windowTarget.emit("blur"); },
    contextLost() {
      elements.get("game-board").emit("webglcontextlost");
    },
    contextRestored() {
      elements.get("game-board").emit("webglcontextrestored");
    },
    latest() { return renders.at(-1); },
  };
}

test("relative keys turn once and ignore key repeat", () => {
  const ignored = createHarness();
  ignored.key("Enter");
  ignored.key("ArrowLeft", { repeat: true });
  ignored.runFrame(241);
  assert.equal(ignored.latest().state.direction, "right");
  assert.deepEqual(ignored.latest().state.snake[0], { x: 12, y: 9 });

  const turned = createHarness();
  turned.key("Enter");
  turned.key("a");
  turned.runFrame(241);
  assert.equal(turned.latest().state.direction, "up");
  assert.deepEqual(turned.latest().state.snake[0], { x: 11, y: 8 });
});

test("blur pauses movement and resume does not catch up elapsed time", () => {
  const game = createHarness();
  game.key("Enter");
  game.runFrame(241);
  assert.deepEqual(game.latest().state.snake[0], { x: 12, y: 9 });

  game.blur();
  game.runFrame(5_000);
  assert.equal(game.latest().state.phase, "paused");
  assert.deepEqual(game.latest().state.snake[0], { x: 12, y: 9 });

  game.setNow(5_000);
  game.key(" ");
  game.runFrame(5_001);
  assert.deepEqual(game.latest().state.snake[0], { x: 12, y: 9 });
  game.runFrame(5_241);
  assert.deepEqual(game.latest().state.snake[0], { x: 13, y: 9 });
});

test("restart resets score, head position and first-person camera", () => {
  const game = createHarness({ foodAhead: true });
  game.key("Enter");
  game.runFrame(241);
  assert.equal(game.latest().state.score, 10);
  assert.deepEqual(game.latest().state.snake[0], { x: 12, y: 9 });

  game.setNow(300);
  game.elements.get("restart-button").click();
  game.runFrame(300);
  assert.equal(game.latest().state.score, 0);
  assert.deepEqual(game.latest().state.snake[0], { x: 11, y: 9 });
  assert.deepEqual(game.latest().camera, {
    x: 11.5,
    z: 9.5,
    yaw: Math.PI / 2,
  });
});

test("blocked local storage does not prevent starting and moving", () => {
  const game = createHarness({ storageThrows: true });
  assert.equal(game.elements.get("best-score").textContent, "00");
  game.key("Enter");
  game.runFrame(241);
  assert.equal(game.latest().state.phase, "running");
  assert.deepEqual(game.latest().state.snake[0], { x: 12, y: 9 });
});

test("renderer startup failure disables controls and cannot run invisibly", () => {
  const game = createHarness({ webglFailure: true });
  assert.equal(game.elements.get("game-board").dataset.phase, "ready");
  assert.equal(game.elements.get("play-button").disabled, true);
  assert.equal(game.elements.get("restart-button").disabled, true);
  assert.equal(game.elements.get("render-error").hidden, false);

  game.key("Enter");
  game.runFrame(10_000);
  assert.equal(game.elements.get("game-board").dataset.phase, "ready");
  assert.equal(game.renders.length, 0);
});

test("restoring WebGL recreates the renderer without autoplay", () => {
  const game = createHarness();
  game.key("Enter");
  game.runFrame(241);
  const stoppedAt = game.latest().state.snake[0];

  game.contextLost();
  assert.equal(game.elements.get("game-board").dataset.phase, "paused");
  assert.equal(game.instances[0].disposed, false);
  game.contextRestored();
  assert.equal(game.instances[0].disposed, true);
  assert.equal(game.instances.length, 2);
  assert.equal(game.elements.get("game-board").dataset.phase, "paused");

  game.runFrame(10_000);
  assert.equal(game.latest().state.phase, "paused");
  assert.deepEqual(game.latest().state.snake[0], stoppedAt);
});
