import {
  BOT_PLAN_INTERVAL,
  BOT_REEVALUATE_CHANCE,
  DEFAULT_SPEED_KEY,
  fallIntervalForSpeed,
  LOCK_DELAY_MS,
  MOVE_FIRST_DELAY_MS,
  MOVE_REPEAT_MS,
  PLAYER_COLORS,
  ROTATE_DEBOUNCE_MS,
  ROWS,
  SHAPES,
  SHAPE_KEYS,
  SOFT_DROP_INTERVAL_MS,
  TOP_MARGIN_ROWS,
} from "./config.js";
import {
  boardWidthForPlayers,
  cloneMatrix,
  makeEmptyBoard,
  rotateCW,
  spawnXForPlayer,
  uniqueRotations,
} from "./utils.js";

function randomShapeKey() {
  return SHAPE_KEYS[(Math.random() * SHAPE_KEYS.length) | 0];
}

function makePieceFromKey(playerId, key) {
  return {
    matrix: cloneMatrix(SHAPES[key]),
    color: PLAYER_COLORS[playerId],
    playerId,
  };
}

function activePieceCells(player, maybeMatrix, maybeX, maybeY) {
  const matrix = maybeMatrix || player.matrix;
  const ox = maybeX ?? player.x;
  const oy = maybeY ?? player.y;
  const cells = [];
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (!matrix[y][x]) continue;
      cells.push({ x: ox + x, y: oy + y });
    }
  }
  return cells;
}

function collides(boardState, playerId, matrix, px, py) {
  const cells = activePieceCells(boardState.playersById[playerId], matrix, px, py);

  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= boardState.cols || cell.y >= boardState.rows) return true;
    if (cell.y >= 0 && boardState.grid[cell.y][cell.x]) return true;
  }

  for (const otherId of boardState.playerIds) {
    if (otherId === playerId) continue;
    const other = boardState.playersById[otherId];
    if (!other.alive) continue;
    const otherCells = activePieceCells(other);
    for (const c of cells) {
      if (c.y < 0) continue;
      for (const oc of otherCells) {
        if (oc.x === c.x && oc.y === c.y) return true;
      }
    }
  }

  return false;
}

function downBlockReason(boardState, player) {
  const cells = activePieceCells(boardState.playersById[player.id], player.matrix, player.x, player.y + 1);

  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= boardState.cols || cell.y >= boardState.rows) {
      return "solid";
    }
    if (cell.y >= 0 && boardState.grid[cell.y][cell.x]) {
      return "solid";
    }
  }

  for (const otherId of boardState.playerIds) {
    if (otherId === player.id) continue;
    const other = boardState.playersById[otherId];
    if (!other.alive) continue;
    const otherCells = activePieceCells(other);
    for (const c of cells) {
      if (c.y < 0) continue;
      for (const oc of otherCells) {
        if (oc.x === c.x && oc.y === c.y) return "active";
      }
    }
  }

  return "none";
}

function tryMove(boardState, player, dx, dy) {
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (!collides(boardState, player.id, player.matrix, nx, ny)) {
    player.x = nx;
    player.y = ny;
    return true;
  }
  return false;
}

function tryRotate(boardState, player) {
  const rotated = rotateCW(player.matrix);
  const kicks = [0, 1, -1, 2, -2];
  for (const kick of kicks) {
    if (!collides(boardState, player.id, rotated, player.x + kick, player.y)) {
      player.matrix = rotated;
      player.x += kick;
      return true;
    }
  }
  for (const kick of kicks) {
    if (!collides(boardState, player.id, rotated, player.x + kick, player.y - 1)) {
      player.matrix = rotated;
      player.x += kick;
      player.y -= 1;
      return true;
    }
  }
  return false;
}

function respawnPiece(state, boardState, player) {
  const spawnKey = player.nextKey || randomShapeKey();
  const piece = makePieceFromKey(player.id, spawnKey);
  player.nextKey = randomShapeKey();
  player.nextMatrix = cloneMatrix(SHAPES[player.nextKey]);
  player.matrix = piece.matrix;
  player.color = piece.color;
  player.y = -TOP_MARGIN_ROWS;
  player.botPlan = null;
  player.lockedSince = 0;
  delete boardState.botIntents[player.id];

  const laneIndex = boardState.playerIds.indexOf(player.id);
  player.x = spawnXForPlayer(laneIndex, boardState.playerIds.length, boardState.cols, player.matrix[0].length);

  if (collides(boardState, player.id, player.matrix, player.x, player.y)) {
    boardState.isDead = true;
    state.status = "Game Over";
  }
}

function pushVisualEvent(state, event) {
  state.visualEvents.push(event);
}

function addGarbageRows(state, boardState, amount, now) {
  if (amount <= 0 || boardState.isDead) return;
  pushVisualEvent(state, { type: "garbageRise", boardIndex: boardState.index, rows: amount, at: now });

  for (let i = 0; i < amount; i += 1) {
    const hole = (Math.random() * boardState.cols) | 0;
    boardState.grid.shift();
    const row = Array.from({ length: boardState.cols }, (_, x) =>
      x === hole ? null : { color: "#6e7b8a", owner: -1 },
    );
    boardState.grid.push(row);
  }

  for (const pid of boardState.playerIds) {
    const p = boardState.playersById[pid];
    while (collides(boardState, p.id, p.matrix, p.x, p.y) && p.y > -TOP_MARGIN_ROWS - 10) {
      p.y -= 1;
    }
    if (collides(boardState, p.id, p.matrix, p.x, p.y)) {
      boardState.isDead = true;
      state.status = "Game Over";
      return;
    }
  }
}

function queueGarbageForBoard(state, boardState, amount, now) {
  boardState.pendingGarbage += amount;
  pushVisualEvent(state, { type: "garbageQueued", boardIndex: boardState.index, rows: amount, at: now });
}

function applyPendingGarbageIfAny(state, boardState, now) {
  if (boardState.pendingGarbage <= 0 || boardState.isDead) return;
  const amount = boardState.pendingGarbage;
  boardState.pendingGarbage = 0;
  addGarbageRows(state, boardState, amount, now);
}

function clearLines(state, boardState, player, now) {
  let cleared = 0;
  const clearedRows = [];
  for (let y = boardState.rows - 1; y >= 0; y -= 1) {
    let full = true;
    for (let x = 0; x < boardState.cols; x += 1) {
      if (!boardState.grid[y][x]) {
        full = false;
        break;
      }
    }
    if (full) {
      clearedRows.push(y);
      boardState.grid.splice(y, 1);
      boardState.grid.unshift(Array(boardState.cols).fill(null));
      cleared += 1;
      y += 1;
    }
  }

  if (cleared > 0) {
    state.lines += cleared;
    state.score += [0, 100, 300, 500, 800][cleared] || cleared * 250;
    state.teamLines[player.team] += cleared;
    pushVisualEvent(state, {
      type: "lineClear",
      boardIndex: boardState.index,
      rows: clearedRows,
      power: cleared,
      at: now,
    });

    if (state.mode === "versus") {
      const attackRows = Math.max(0, cleared - 1);
      if (attackRows > 0) {
        const targetTeam = player.team === 0 ? 1 : 0;
        queueGarbageForBoard(state, state.boards[targetTeam], attackRows, now);
      }
    }
  }
}

function lockPiece(state, boardState, player, now) {
  const cells = activePieceCells(player);
  for (const c of cells) {
    if (c.y < 0) {
      boardState.isDead = true;
      state.status = "Game Over";
      return;
    }
    boardState.grid[c.y][c.x] = { color: player.color, owner: player.id };
  }

  clearLines(state, boardState, player, now);
  respawnPiece(state, boardState, player);
  applyPendingGarbageIfAny(state, boardState, now);
}

function doGravityStep(state, boardState, player, now) {
  if (tryMove(boardState, player, 0, 1)) {
    player.lockedSince = 0;
    return;
  }

  const reason = downBlockReason(boardState, player);
  if (reason === "active") {
    player.lockedSince = 0;
    return;
  }

  if (!player.lockedSince) {
    player.lockedSince = now;
    return;
  }

  if (now - player.lockedSince < LOCK_DELAY_MS) return;
  lockPiece(state, boardState, player, now);
}

function maybeResetLockDelay(boardState, player) {
  if (downBlockReason(boardState, player) !== "solid") {
    player.lockedSince = 0;
  }
}

function applyLockDelay(state, boardState, player, now) {
  const reason = downBlockReason(boardState, player);
  if (reason !== "solid") {
    player.lockedSince = 0;
    return;
  }
  if (!player.lockedSince) {
    player.lockedSince = now;
    return;
  }
  if (now - player.lockedSince >= LOCK_DELAY_MS) {
    lockPiece(state, boardState, player, now);
  }
}

function countFilledInRow(row) {
  let count = 0;
  for (const cell of row) {
    if (cell) count += 1;
  }
  return count;
}

function analyzeGrid(grid, cols, rows) {
  const heights = Array(cols).fill(0);
  let holes = 0;
  let maxHeight = 0;
  let nearFullRows = 0;

  for (let x = 0; x < cols; x += 1) {
    let top = -1;
    for (let y = 0; y < rows; y += 1) {
      if (grid[y][x]) {
        top = y;
        break;
      }
    }
    if (top !== -1) {
      heights[x] = rows - top;
      maxHeight = Math.max(maxHeight, heights[x]);
      for (let y = top + 1; y < rows; y += 1) {
        if (!grid[y][x]) holes += 1;
      }
    }
  }

  let aggregateHeight = 0;
  let bumpiness = 0;
  for (let i = 0; i < cols; i += 1) {
    aggregateHeight += heights[i];
    if (i > 0) bumpiness += Math.abs(heights[i] - heights[i - 1]);
  }

  for (let y = 0; y < rows; y += 1) {
    const filled = countFilledInRow(grid[y]);
    if (filled >= cols - 2 && filled < cols) nearFullRows += 1;
  }

  return { holes, maxHeight, aggregateHeight, bumpiness, nearFullRows };
}

function estimateDanger(metrics, rows) {
  const heightRisk = metrics.maxHeight / rows;
  const holeRisk = Math.min(1, metrics.holes / 22);
  const roughRisk = Math.min(1, metrics.bumpiness / 38);
  return heightRisk * 0.58 + holeRisk * 0.3 + roughRisk * 0.12;
}

function botRoleForPlayer(boardState, playerId) {
  const botIds = boardState.playerIds.filter((pid) => boardState.playersById[pid].isBot);
  if (botIds.length <= 1) return "balanced";
  botIds.sort((a, b) => a - b);
  return botIds.indexOf(playerId) % 2 === 0 ? "builder" : "cleaner";
}

function buildBotStrategy(boardState, player) {
  const currentMetrics = analyzeGrid(boardState.grid, boardState.cols, boardState.rows);
  const danger = estimateDanger(currentMetrics, boardState.rows);
  const role = botRoleForPlayer(boardState, player.id);
  const laneIndex = boardState.playerIds.indexOf(player.id);
  const laneCenterX = ((laneIndex + 0.5) / boardState.playerIds.length) * boardState.cols;

  let teammateIntentX = null;
  for (const pid of boardState.playerIds) {
    if (pid === player.id) continue;
    const intent = boardState.botIntents[pid];
    if (intent && typeof intent.x === "number") {
      teammateIntentX = intent.x;
      break;
    }
  }

  return { danger, role, laneCenterX, teammateIntentX };
}

function evaluateBotLanding(boardState, player, matrix, x, strategy) {
  let y = -TOP_MARGIN_ROWS;
  if (collides(boardState, player.id, matrix, x, y)) return null;
  while (!collides(boardState, player.id, matrix, x, y + 1)) y += 1;

  const temp = boardState.grid.map((r) => r.slice());
  for (const c of activePieceCells(player, matrix, x, y)) {
    if (c.y >= 0) temp[c.y][c.x] = { color: "#fff" };
  }

  let cleared = 0;
  for (let row = boardState.rows - 1; row >= 0; row -= 1) {
    if (countFilledInRow(temp[row]) === boardState.cols) {
      temp.splice(row, 1);
      temp.unshift(Array(boardState.cols).fill(null));
      cleared += 1;
      row += 1;
    }
  }

  const metrics = analyzeGrid(temp, boardState.cols, boardState.rows);
  const sideBias = Math.abs(x - (boardState.cols - matrix[0].length) / 2) * 0.2;
  const isBuilder = strategy.role === "builder";
  const isSafeMode = strategy.danger > 0.6;
  const lineWeight = isSafeMode ? 28 : isBuilder ? 12 : 20;

  let score =
    cleared * lineWeight -
    metrics.holes * (isSafeMode ? 13 : 10) -
    metrics.aggregateHeight * (isSafeMode ? 0.95 : 0.72) -
    metrics.bumpiness * (isSafeMode ? 2.2 : 1.5) -
    metrics.maxHeight * (isSafeMode ? 2.6 : 1.65) -
    sideBias;

  if (!isSafeMode && isBuilder) {
    score += metrics.nearFullRows * 4.4;
    if (cleared === 1) score -= 5.2;
    if (cleared >= 3) score += 7;
  }
  if (!isBuilder) {
    if (cleared >= 1) score += 3.4;
    score -= metrics.nearFullRows * 0.55;
  }
  if (strategy.teammateIntentX !== null && Math.abs(x - strategy.teammateIntentX) <= 2) {
    score -= 4.2;
  }
  score -= Math.abs(x - strategy.laneCenterX) * (isBuilder ? 0.35 : 0.18);
  if (isSafeMode && cleared === 0 && strategy.danger > 0.8) score -= 8;

  return { x, y, matrix, score, dangerAfter: estimateDanger(metrics, boardState.rows) };
}

function pickBotCandidate(candidates) {
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const pool = candidates.slice(0, Math.min(4, candidates.length));
  const weights = pool.map((_, i) => Math.max(0.1, 1.65 - i * 0.35));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[0];
}

function makeBotPlan(boardState, player, now) {
  const strategy = buildBotStrategy(boardState, player);
  const rotations = uniqueRotations(player.matrix);
  const candidates = [];

  for (const matrix of rotations) {
    const maxX = boardState.cols - matrix[0].length;
    for (let x = 0; x <= maxX; x += 1) {
      const result = evaluateBotLanding(boardState, player, matrix, x, strategy);
      if (result) candidates.push(result);
    }
  }

  const chosen = pickBotCandidate(candidates);
  if (chosen) {
    boardState.botIntents[player.id] = { x: chosen.x, at: now };
  } else {
    delete boardState.botIntents[player.id];
  }
  return chosen;
}

function botInput(boardState, player, now) {
  for (const [pid, intent] of Object.entries(boardState.botIntents)) {
    if (now - intent.at > 1800) delete boardState.botIntents[pid];
  }

  if (!player.botPlan || now - player.botLastPlanAt > BOT_PLAN_INTERVAL || Math.random() < BOT_REEVALUATE_CHANCE) {
    player.botPlan = makeBotPlan(boardState, player, now);
    player.botLastPlanAt = now;
  }

  if (!player.botPlan) return { left: false, right: false, down: true, rotate: false };

  const target = player.botPlan;
  const currentKey = player.matrix.map((r) => r.join("")).join("|");
  const targetKey = target.matrix.map((r) => r.join("")).join("|");

  return {
    rotate: currentKey !== targetKey,
    left: player.x > target.x,
    right: player.x < target.x,
    down: player.y >= target.y - (target.dangerAfter > 0.7 ? 4 : 2),
  };
}

function handleInput(state, boardState, player, now, inputReader) {
  if (!player.alive || boardState.isDead) return;
  const input = player.isBot ? botInput(boardState, player, now) : inputReader(player);

  if (input.left && !input.right) {
    if (!player.leftHeldSince) {
      player.leftHeldSince = now;
      player.leftLastStep = now;
      if (tryMove(boardState, player, -1, 0)) maybeResetLockDelay(boardState, player);
    } else if (now - player.leftHeldSince >= MOVE_FIRST_DELAY_MS && now - player.leftLastStep >= MOVE_REPEAT_MS) {
      player.leftLastStep = now;
      if (tryMove(boardState, player, -1, 0)) maybeResetLockDelay(boardState, player);
    }
  } else {
    player.leftHeldSince = 0;
    player.leftLastStep = 0;
  }

  if (input.right && !input.left) {
    if (!player.rightHeldSince) {
      player.rightHeldSince = now;
      player.rightLastStep = now;
      if (tryMove(boardState, player, 1, 0)) maybeResetLockDelay(boardState, player);
    } else if (now - player.rightHeldSince >= MOVE_FIRST_DELAY_MS && now - player.rightLastStep >= MOVE_REPEAT_MS) {
      player.rightLastStep = now;
      if (tryMove(boardState, player, 1, 0)) maybeResetLockDelay(boardState, player);
    }
  } else {
    player.rightHeldSince = 0;
    player.rightLastStep = 0;
  }

  if (input.rotate && now - player.lastRotateAt >= ROTATE_DEBOUNCE_MS) {
    player.lastRotateAt = now;
    if (tryRotate(boardState, player)) maybeResetLockDelay(boardState, player);
  }

  const dropInterval = input.down ? SOFT_DROP_INTERVAL_MS : state.fallIntervalMs;
  if (now - player.lastDropAt >= dropInterval) {
    player.lastDropAt = now;
    doGravityStep(state, boardState, player, now);
  }

  if (!boardState.isDead) {
    applyLockDelay(state, boardState, player, now);
  }
}

function makePlayer(id, isBot, team, boardIndex) {
  const firstKey = randomShapeKey();
  const piece = makePieceFromKey(id, firstKey);
  const nextKey = randomShapeKey();
  return {
    id,
    isBot,
    team,
    boardIndex,
    matrix: piece.matrix,
    color: piece.color,
    x: 0,
    y: -TOP_MARGIN_ROWS,
    alive: true,
    lastDropAt: 0,
    lastRotateAt: 0,
    leftHeldSince: 0,
    rightHeldSince: 0,
    leftLastStep: 0,
    rightLastStep: 0,
    botPlan: null,
    botLastPlanAt: 0,
    nextKey,
    nextMatrix: cloneMatrix(SHAPES[nextKey]),
    lockedSince: 0,
  };
}

export function createGame(config) {
  const mode = config.mode;
  const speedKey = config.speedKey || DEFAULT_SPEED_KEY;
  const players = {};

  if (mode === "coop") {
    const ids = config.activeIds;
    const board = {
      index: 0,
      label: "Shared Board",
      rows: ROWS,
      cols: boardWidthForPlayers(ids.length),
      grid: null,
      playerIds: ids,
      playersById: players,
      teamId: 0,
      isDead: false,
      pendingGarbage: 0,
      botIntents: {},
    };
    board.grid = makeEmptyBoard(board.cols, board.rows);

    for (const id of ids) {
      players[id] = makePlayer(id, config.slotConfig[id].isBot, 0, 0);
    }

    const state = {
      running: true,
      mode,
      speedKey,
      fallIntervalMs: fallIntervalForSpeed(speedKey),
      status: "Running",
      score: 0,
      lines: 0,
      teamLines: [0, 0],
      boards: [board],
      players,
      winnerTeam: null,
      startedAt: performance.now(),
      endedAt: null,
      visualEvents: [],
    };

    for (const id of ids) respawnPiece(state, board, players[id]);
    return state;
  }

  const team0Ids = [0, 1];
  const team1Ids = [2, 3];

  const board0 = {
    index: 0,
    label: "Team 1",
    rows: ROWS,
    cols: boardWidthForPlayers(2),
    grid: makeEmptyBoard(boardWidthForPlayers(2), ROWS),
    playerIds: team0Ids,
    playersById: players,
    teamId: 0,
    isDead: false,
    pendingGarbage: 0,
    botIntents: {},
  };

  const board1 = {
    index: 1,
    label: "Team 2",
    rows: ROWS,
    cols: boardWidthForPlayers(2),
    grid: makeEmptyBoard(boardWidthForPlayers(2), ROWS),
    playerIds: team1Ids,
    playersById: players,
    teamId: 1,
    isDead: false,
    pendingGarbage: 0,
    botIntents: {},
  };

  players[0] = makePlayer(0, config.slotConfig[0].isBot, 0, 0);
  players[1] = makePlayer(1, config.slotConfig[1].isBot, 0, 0);
  players[2] = makePlayer(2, config.slotConfig[2].isBot, 1, 1);
  players[3] = makePlayer(3, config.slotConfig[3].isBot, 1, 1);

  const state = {
    running: true,
    mode,
    speedKey,
    fallIntervalMs: fallIntervalForSpeed(speedKey),
    status: "Running",
    score: 0,
    lines: 0,
    teamLines: [0, 0],
    boards: [board0, board1],
    players,
    winnerTeam: null,
    startedAt: performance.now(),
    endedAt: null,
    visualEvents: [],
  };

  for (const id of team0Ids) respawnPiece(state, board0, players[id]);
  for (const id of team1Ids) respawnPiece(state, board1, players[id]);

  return state;
}

function updateGameOverState(state) {
  if (state.mode === "coop") {
    if (state.boards[0].isDead) {
      state.status = "Game Over";
      state.running = false;
      state.endedAt = performance.now();
    }
    return;
  }

  const b0Dead = state.boards[0].isDead;
  const b1Dead = state.boards[1].isDead;
  if (!b0Dead && !b1Dead) return;

  state.running = false;
  state.status = "Game Over";
  state.endedAt = performance.now();

  if (b0Dead && !b1Dead) state.winnerTeam = 1;
  else if (!b0Dead && b1Dead) state.winnerTeam = 0;
  else state.winnerTeam = null;
}

export function updateGame(state, now, inputReader) {
  if (!state || !state.running) return state;

  for (const board of state.boards) {
    if (board.isDead) continue;
    for (const pid of board.playerIds) {
      handleInput(state, board, state.players[pid], now, inputReader);
    }
  }

  updateGameOverState(state);
  return state;
}

export function getGameSummary(state, config) {
  const durationSec = ((state.endedAt - state.startedAt) / 1000).toFixed(1);

  if (state.mode === "coop") {
    return {
      headline: `Shared board survived for ${durationSec}s.`,
      rows: [
        `Total score: ${state.score}`,
        `Total lines: ${state.lines}`,
        `Players: ${config.activeIds.length}`,
      ],
    };
  }

  let headline = "Draw.";
  if (state.winnerTeam === 0) headline = "Team 1 wins.";
  if (state.winnerTeam === 1) headline = "Team 2 wins.";

  return {
    headline: `${headline} Match time: ${durationSec}s.`,
    rows: [
      `Team 1 lines: ${state.teamLines[0]}`,
      `Team 2 lines: ${state.teamLines[1]}`,
      `Total lines cleared: ${state.lines}`,
    ],
  };
}

export function getActivePieceCells(player) {
  return activePieceCells(player);
}

export function getNextPiecePreviewData(state) {
  const out = [];
  for (const board of state.boards) {
    for (const pid of board.playerIds) {
      const player = state.players[pid];
      out.push({
        id: player.id,
        team: player.team,
        isBot: player.isBot,
        color: player.color,
        matrix: player.nextMatrix ? cloneMatrix(player.nextMatrix) : [[1]],
        pendingGarbage: board.pendingGarbage,
      });
    }
  }
  return out;
}

export function consumeVisualEvents(state) {
  if (!state?.visualEvents?.length) return [];
  const out = state.visualEvents.slice();
  state.visualEvents.length = 0;
  return out;
}
