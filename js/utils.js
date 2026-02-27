import { BASE_COLS, COLS_PER_EXTRA_PLAYER } from "./config.js";

export function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

export function rotateCW(matrix) {
  const h = matrix.length;
  const w = matrix[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      out[x][h - 1 - y] = matrix[y][x];
    }
  }
  return out;
}

export function uniqueRotations(matrix) {
  const out = [];
  const seen = new Set();
  let cur = matrix;
  for (let i = 0; i < 4; i += 1) {
    const key = cur.map((r) => r.join("")).join("|");
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cur);
    }
    cur = rotateCW(cur);
  }
  return out;
}

export function boardWidthForPlayers(playerCount) {
  return BASE_COLS + (playerCount - 1) * COLS_PER_EXTRA_PLAYER;
}

export function spawnXForPlayer(playerIndexInBoard, playerCountOnBoard, boardCols, pieceWidth) {
  if (playerCountOnBoard === 1) {
    return ((boardCols - pieceWidth) / 2) | 0;
  }
  const span = boardCols - pieceWidth;
  const laneCenter = (playerIndexInBoard + 0.5) / playerCountOnBoard;
  return Math.max(0, Math.min(span, Math.round(laneCenter * span - pieceWidth / 2)));
}

export function makeEmptyBoard(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}
