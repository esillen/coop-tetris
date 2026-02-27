export const ROWS = 20;
export const BASE_COLS = 10;
export const COLS_PER_EXTRA_PLAYER = 4;
export const FALL_INTERVAL_MS = 650;
export const SOFT_DROP_INTERVAL_MS = 45;
export const MOVE_REPEAT_MS = 115;
export const MOVE_FIRST_DELAY_MS = 160;
export const ROTATE_DEBOUNCE_MS = 140;
export const TOP_MARGIN_ROWS = 2;
export const LOCK_DELAY_MS = 420;

export const BOT_PLAN_INTERVAL = 220;
export const BOT_REEVALUATE_CHANCE = 0.14;

export const PLAYER_COLORS = ["#ff6b6b", "#ffd166", "#2dd4bf", "#5fa8ff"];

export const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

export const SHAPE_KEYS = Object.keys(SHAPES);

export const keyboardMaps = [
  { left: "KeyA", right: "KeyD", down: "KeyS", rotate: "KeyW" },
  { left: "KeyJ", right: "KeyL", down: "KeyK", rotate: "KeyI" },
  { left: "KeyF", right: "KeyH", down: "KeyG", rotate: "KeyT" },
  { left: "ArrowLeft", right: "ArrowRight", down: "ArrowDown", rotate: "ArrowUp" },
];

export const SPEED_PRESETS = {
  slow: 900,
  normal: FALL_INTERVAL_MS,
  fast: 430,
  very_fast: 280,
  insane: 170,
  absurd: 95,
};

export const DEFAULT_SPEED_KEY = "normal";

export function fallIntervalForSpeed(speedKey) {
  return SPEED_PRESETS[speedKey] ?? SPEED_PRESETS[DEFAULT_SPEED_KEY];
}
