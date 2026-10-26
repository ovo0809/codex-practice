const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createGame,
  turn,
  turnRelative,
  step,
  placeFood,
  interval,
} = require("../game-core.js");
const running = () => ({ ...createGame("normal", () => 0), phase: "running" });

test("moving keeps length and leaves the original state unchanged", () => {
  const state = running();
  const next = step(state);
  assert.deepEqual(next.snake[0], { x: 12, y: 9 });
  assert.equal(next.snake.length, 4);
  assert.deepEqual(state.snake[0], { x: 11, y: 9 });
});
test("eating grows the snake, awards ten points and places unoccupied food", () => {
  const next = step({ ...running(), food: { x: 12, y: 9 } }, () => 0.5);
  assert.equal(next.score, 10);
  assert.equal(next.snake.length, 5);
  assert.ok(
    !next.snake.some(
      (cell) => cell.x === next.food.x && cell.y === next.food.y,
    ),
  );
});
test("a direct reversal is ignored; quick turns are applied on separate ticks", () => {
  const state = running();
  assert.equal(turn(state, "left"), state);
  const queued = turn(turn(state, "up"), "left");
  const first = step(queued);
  assert.deepEqual(first.snake[0], { x: 11, y: 8 });
  assert.deepEqual(step(first).snake[0], { x: 10, y: 8 });
  assert.equal(turn(turn(state, "up"), "down").turns.length, 1);
});
test("hitting a wall ends the game without moving outside the board", () => {
  const state = {
    ...running(),
    snake: [
      { x: 23, y: 10 },
      { x: 22, y: 10 },
    ],
  };
  const next = step(state);
  assert.equal(next.phase, "over");
  assert.equal(next.reason, "wall");
  assert.deepEqual(next.snake, state.snake);
});
test("hitting your body ends the game", () => {
  const state = {
    ...running(),
    snake: [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ],
  };
  assert.equal(step(state).reason, "self");
});
test("moving into the cell the tail is leaving is allowed", () => {
  const state = {
    ...running(),
    snake: [
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
    ],
  };
  const next = step(state);
  assert.equal(next.phase, "running");
  assert.deepEqual(next.snake[0], { x: 3, y: 2 });
});
test("ready, paused and completed games do not move", () => {
  for (const phase of ["ready", "paused", "over", "won"]) {
    const state = { ...running(), phase };
    assert.equal(step(state), state);
  }
});
test("filling the board wins and does not loop while placing food", () => {
  const next = step({
    ...running(),
    size: 2,
    snake: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    food: { x: 1, y: 0 },
  });
  assert.equal(next.phase, "won");
  assert.equal(next.snake.length, 4);
  assert.equal(next.food, null);
  assert.equal(placeFood(next.snake, 2), null);
});
test("speed modes differ and progression has a safe lower bound", () => {
  assert.ok(interval(createGame("relaxed")) > interval(createGame("normal")));
  assert.ok(interval(createGame("normal")) > interval(createGame("fast")));
  assert.equal(interval({ ...createGame("fast"), score: 99999 }), 120);
});

test("relative turns follow the snake heading in all four directions", () => {
  const headings = ["up", "right", "down", "left"];
  for (let i = 0; i < headings.length; i++) {
    const state = { ...running(), direction: headings[i] };
    assert.deepEqual(turnRelative(state, "left").turns, [headings[(i + 3) % 4]]);
    assert.deepEqual(turnRelative(state, "right").turns, [headings[(i + 1) % 4]]);
  }
});

test("quick relative turns use queued heading and remain bounded", () => {
  const state = running();
  const queued = turnRelative(turnRelative(state, "left"), "left");
  assert.deepEqual(queued.turns, ["up", "left"]);
  assert.equal(turnRelative(queued, "right"), queued);
  const first = step(queued);
  assert.deepEqual(first.snake[0], { x: 11, y: 8 });
  assert.deepEqual(step(first).snake[0], { x: 10, y: 8 });
  assert.equal(state.turns.length, 0);
});

test("relative controls ignore invalid input and inactive games", () => {
  const state = running();
  assert.equal(turnRelative(state, "up"), state);
  for (const phase of ["paused", "over", "won"]) {
    const inactive = { ...state, phase };
    assert.equal(turnRelative(inactive, "left"), inactive);
  }
});
