(function (root) {
  "use strict";

  const DIRECTIONS = Object.freeze({
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  });
  // First-person play needs time to read the arena at eye level.
  const SPEEDS = Object.freeze({ relaxed: 320, normal: 240, fast: 170 });
  const sameCell = (a, b) => a.x === b.x && a.y === b.y;

  function placeFood(snake, size, random = Math.random) {
    const occupied = new Set(snake.map(({ x, y }) => `${x},${y}`));
    const free = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (!free.length) return null;
    return free[
      Math.min(free.length - 1, Math.max(0, Math.floor(random() * free.length)))
    ];
  }

  function createGame(difficulty = "normal", random = Math.random) {
    const size = 24;
    const snake = [
      { x: 11, y: 9 },
      { x: 10, y: 9 },
      { x: 9, y: 9 },
      { x: 8, y: 9 },
    ];
    return {
      size,
      snake,
      food: placeFood(snake, size, random),
      direction: "right",
      turns: [],
      score: 0,
      phase: "ready",
      difficulty: Object.hasOwn(SPEEDS, difficulty) ? difficulty : "normal",
    };
  }

  function turn(state, direction) {
    if (
      !DIRECTIONS[direction] ||
      !["ready", "running"].includes(state.phase) ||
      state.turns.length >= 2
    )
      return state;
    const previous = state.turns.at(-1) || state.direction;
    if (previous === direction) return state;
    const a = DIRECTIONS[previous];
    const b = DIRECTIONS[direction];
    if (a.x + b.x === 0 && a.y + b.y === 0) return state;
    return { ...state, turns: [...state.turns, direction] };
  }

  function step(state, random = Math.random) {
    if (state.phase !== "running") return state;
    const direction = state.turns[0] || state.direction;
    const delta = DIRECTIONS[direction];
    const head = {
      x: state.snake[0].x + delta.x,
      y: state.snake[0].y + delta.y,
    };
    const growing = !!state.food && sameCell(head, state.food);
    // The tail leaves its cell on this tick, unless the snake is eating.
    const body = growing ? state.snake : state.snake.slice(0, -1);
    const wall =
      head.x < 0 || head.y < 0 || head.x >= state.size || head.y >= state.size;
    if (wall || body.some((cell) => sameCell(cell, head))) {
      return {
        ...state,
        direction,
        turns: [],
        phase: "over",
        reason: wall ? "wall" : "self",
      };
    }
    const snake = [head, ...state.snake];
    if (!growing) snake.pop();
    const food = growing ? placeFood(snake, state.size, random) : state.food;
    return {
      ...state,
      snake,
      direction,
      turns: state.turns.slice(1),
      food,
      score: state.score + (growing ? 10 : 0),
      phase: food ? "running" : "won",
    };
  }

  function interval(state) {
    return Math.max(
      120,
      SPEEDS[state.difficulty] - Math.floor(state.score / 50) * 5,
    );
  }

  function turnRelative(state, side) {
    if (side !== "left" && side !== "right") return state;
    const headings = ["up", "right", "down", "left"];
    const heading = state.turns.at(-1) || state.direction;
    const offset = side === "left" ? 3 : 1;
    return turn(state, headings[(headings.indexOf(heading) + offset) % 4]);
  }

  const api = { createGame, turn, turnRelative, step, interval, placeFood, DIRECTIONS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SnakeCore = api;
})(globalThis);
