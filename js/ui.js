import { ROWS } from "./config.js";
import { consumeVisualEvents, getActivePieceCells, getNextPiecePreviewData } from "./engine.js";

const fxState = {
  sparks: [],
  flashes: [],
  rises: [],
};

export function getDom() {
  return {
    titleScreenEl: document.getElementById("titleScreen"),
    gameScreenEl: document.getElementById("gameScreen"),
    gameOverScreenEl: document.getElementById("gameOverScreen"),
    modeSelectEl: document.getElementById("modeSelect"),
    playerCountEl: document.getElementById("playerCount"),
    speedSelectEl: document.getElementById("speedSelect"),
    slotsEl: document.getElementById("slots"),
    startBtn: document.getElementById("startBtn"),
    scoreEl: document.getElementById("score"),
    linesEl: document.getElementById("lines"),
    statusEl: document.getElementById("status"),
    modeLabelEl: document.getElementById("modeLabel"),
    nextLeftEl: document.getElementById("nextLeft"),
    nextRightEl: document.getElementById("nextRight"),
    teamStatsEl: document.getElementById("teamStats"),
    backToTitleBtn: document.getElementById("backToTitleBtn"),
    resultHeadlineEl: document.getElementById("resultHeadline"),
    summaryEl: document.getElementById("summary"),
    playAgainBtn: document.getElementById("playAgainBtn"),
    titleBtn: document.getElementById("titleBtn"),
    boardWrap: document.getElementById("boardWrap"),
    canvas: document.getElementById("gameCanvas"),
  };
}

export function showScreen(dom, name) {
  dom.titleScreenEl.classList.toggle("active", name === "title");
  dom.gameScreenEl.classList.toggle("active", name === "game");
  dom.gameOverScreenEl.classList.toggle("active", name === "gameover");
}

export function buildSlotsUi(dom) {
  dom.slotsEl.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.slot = String(i);
    slot.innerHTML = `
      <h3>Player ${i + 1} <span class="slot-team" id="slotTeam${i}"></span></h3>
      <div class="slot-row">
        <label for="slotType${i}">Type</label>
        <select id="slotType${i}">
          <option value="human" selected>Human</option>
          <option value="bot">Bot</option>
        </select>
      </div>
    `;
    dom.slotsEl.appendChild(slot);
  }
}

export function updateSlotsUi(dom) {
  const mode = dom.modeSelectEl.value;
  const playerCount = Number(dom.playerCountEl.value);

  for (let i = 0; i < 4; i += 1) {
    const slot = dom.slotsEl.querySelector(`.slot[data-slot='${i}']`);
    const teamEl = document.getElementById(`slotTeam${i}`);
    const active = mode === "versus" ? true : i < playerCount;
    slot.classList.toggle("inactive", !active);

    if (mode === "versus") {
      const team = i < 2 ? 1 : 2;
      teamEl.textContent = `(Team ${team})`;
    } else {
      teamEl.textContent = "";
    }
  }
}

export function readConfigFromTitle(dom) {
  const mode = dom.modeSelectEl.value;
  const speedKey = dom.speedSelectEl.value;
  const slots = [];
  for (let i = 0; i < 4; i += 1) {
    const type = document.getElementById(`slotType${i}`).value;
    slots.push({ isBot: type === "bot" });
  }

  if (mode === "coop") {
    const playerCount = Number(dom.playerCountEl.value);
    return {
      mode,
      speedKey,
      activeIds: Array.from({ length: playerCount }, (_, i) => i),
      slotConfig: slots,
    };
  }

  return {
    mode,
    speedKey,
    activeIds: [0, 1, 2, 3],
    slotConfig: slots,
  };
}

export function updateHUD(dom, gameState) {
  dom.scoreEl.textContent = String(gameState.score);
  dom.linesEl.textContent = String(gameState.lines);
  dom.statusEl.textContent = gameState.status;
  dom.modeLabelEl.textContent = gameState.mode === "coop" ? "Co-op" : "2v2";

  if (gameState.mode === "versus") {
    dom.teamStatsEl.innerHTML = `
      <div class="team-pill">Team 1 lines: ${gameState.teamLines[0]}</div>
      <div class="team-pill">Team 2 lines: ${gameState.teamLines[1]}</div>
    `;
  } else {
    dom.teamStatsEl.innerHTML = "";
  }

  renderNextPreviews(dom, gameState);
}

function renderMiniMatrix(matrix, color) {
  const gridSize = 4;
  const h = matrix.length;
  const w = matrix[0].length;
  const offsetX = Math.floor((gridSize - w) / 2);
  const offsetY = Math.floor((gridSize - h) / 2);
  const cells = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const my = y - offsetY;
      const mx = x - offsetX;
      const active = my >= 0 && my < h && mx >= 0 && mx < w && !!matrix[my][mx];
      cells.push(
        `<span class="next-cell${active ? " active" : ""}"${active ? ` style="background:${color}"` : ""}></span>`,
      );
    }
  }

  return cells.join("");
}

function renderNextPreviews(dom, gameState) {
  const previews = getNextPiecePreviewData(gameState);
  const cardMarkup = (preview) => {
    const role = preview.isBot ? "Bot" : "Human";
    const team = gameState.mode === "versus" ? `T${preview.team + 1} ` : "";
    const garbage = gameState.mode === "versus" && preview.pendingGarbage > 0 ? ` +${preview.pendingGarbage}` : "";
    return `<article class="next-card">
      <div class="next-label">${team}P${preview.id + 1} (${role})${garbage}</div>
      <div class="next-grid">${renderMiniMatrix(preview.matrix, preview.color)}</div>
    </article>`;
  };

  let left = [];
  let right = [];

  if (gameState.mode === "versus") {
    left = previews.filter((p) => p.team === 0);
    right = previews.filter((p) => p.team === 1);
  } else {
    const pivot = Math.ceil(previews.length / 2);
    left = previews.slice(0, pivot);
    right = previews.slice(pivot);
  }

  dom.nextLeftEl.innerHTML = left.map(cardMarkup).join("");
  dom.nextRightEl.innerHTML = right.map(cardMarkup).join("");
}

export function showGameOverSummary(dom, summary) {
  dom.resultHeadlineEl.textContent = summary.headline;
  dom.summaryEl.innerHTML = summary.rows.map((row) => `<div>${row}</div>`).join("");
  showScreen(dom, "gameover");
}

function resizeCanvasToContainer(dom) {
  const wrapRect = dom.boardWrap.getBoundingClientRect();
  const nextWidth = Math.max(1, Math.floor(wrapRect.width));
  const nextHeight = Math.max(1, Math.floor(wrapRect.height));

  if (dom.canvas.width !== nextWidth) dom.canvas.width = nextWidth;
  if (dom.canvas.height !== nextHeight) dom.canvas.height = nextHeight;
}

function computeCellSize(canvas, cols, boardCount) {
  const horizontalPadding = 24;
  const verticalPadding = 28;
  const gap = boardCount === 2 ? 42 : 0;
  const maxByWidth = Math.floor((canvas.width - horizontalPadding - gap) / (cols * boardCount));
  const maxByHeight = Math.floor((canvas.height - verticalPadding) / ROWS);
  return Math.max(8, Math.min(maxByWidth, maxByHeight));
}

function drawCell(ctx, x, y, size, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  const grad = ctx.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, "#ffffff55");
  grad.addColorStop(0.16, color);
  grad.addColorStop(1, "#00000066");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, size - 1, size - 1);

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 2, size - 2);
  ctx.globalAlpha = 1;
}

function drawSpark(ctx, spark, now) {
  const t = (now - spark.startAt) / spark.life;
  if (t >= 1) return false;
  const fade = 1 - t;
  const x = spark.x + spark.vx * t;
  const y = spark.y + spark.vy * t + 22 * t * t;
  ctx.globalAlpha = fade;
  ctx.fillStyle = spark.color;
  ctx.fillRect(x, y, spark.size, spark.size);
  ctx.globalAlpha = 1;
  return true;
}

function ingestVisualEvents(gameState, layoutByIndex, now) {
  const events = consumeVisualEvents(gameState);
  for (const event of events) {
    if (event.type === "lineClear") {
      for (const row of event.rows) {
        fxState.flashes.push({
          boardIndex: event.boardIndex,
          row,
          startAt: now,
          life: 260 + event.power * 80,
          power: event.power,
        });
      }

      const layout = layoutByIndex.get(event.boardIndex);
      if (!layout) continue;
      const sparkCount = 16 + event.power * 18;
      for (let i = 0; i < sparkCount; i += 1) {
        const row = event.rows[i % event.rows.length];
        const x = layout.offsetX + Math.random() * layout.boardPxW;
        const y = layout.offsetY + row * layout.size + layout.size * 0.4;
        fxState.sparks.push({
          x,
          y,
          vx: (Math.random() - 0.5) * (90 + event.power * 45),
          vy: -(80 + Math.random() * (80 + event.power * 35)),
          life: 450 + Math.random() * 350,
          startAt: now,
          size: 1.5 + Math.random() * 2.8,
          color: i % 3 === 0 ? "#ffffff" : i % 2 === 0 ? "#ffd166" : "#ff7a9e",
        });
      }
    } else if (event.type === "garbageRise") {
      const layout = layoutByIndex.get(event.boardIndex);
      if (!layout) continue;
      fxState.rises.push({
        boardIndex: event.boardIndex,
        startAt: now,
        life: 300,
        px: event.rows * layout.size,
      });
    }
  }
}

function getBoardRiseOffset(boardIndex, now) {
  let total = 0;
  const keep = [];
  for (const rise of fxState.rises) {
    const t = (now - rise.startAt) / rise.life;
    if (t < 1) {
      if (rise.boardIndex === boardIndex) total += rise.px * (1 - t);
      keep.push(rise);
    }
  }
  fxState.rises = keep;
  return total;
}

function drawBoardFlashes(ctx, boardIndex, layout, now, riseOffset) {
  const keep = [];
  for (const flash of fxState.flashes) {
    const t = (now - flash.startAt) / flash.life;
    if (t < 1) {
      if (flash.boardIndex === boardIndex) {
        const alpha = (1 - t) * (0.25 + flash.power * 0.09);
        const y = layout.offsetY + riseOffset + flash.row * layout.size;
        const glow = ctx.createLinearGradient(layout.offsetX, y, layout.offsetX, y + layout.size);
        glow.addColorStop(0, `rgba(255,255,255,${alpha})`);
        glow.addColorStop(0.5, `rgba(114,244,255,${alpha * 0.8})`);
        glow.addColorStop(1, `rgba(255,130,160,${alpha * 0.6})`);
        ctx.fillStyle = glow;
        ctx.fillRect(layout.offsetX, y, layout.boardPxW, layout.size);
      }
      keep.push(flash);
    }
  }
  fxState.flashes = keep;
}

function drawSparks(ctx, now) {
  const keep = [];
  for (const spark of fxState.sparks) {
    if (drawSpark(ctx, spark, now)) keep.push(spark);
  }
  fxState.sparks = keep;
}

function drawSingleBoard(ctx, boardState, layout, now) {
  const riseOffset = getBoardRiseOffset(boardState.index, now);

  const frameGlow = ctx.createLinearGradient(layout.offsetX, layout.offsetY, layout.offsetX + layout.boardPxW, layout.offsetY + layout.boardPxH);
  frameGlow.addColorStop(0, "#1f6c8f");
  frameGlow.addColorStop(1, "#6c356f");
  ctx.fillStyle = frameGlow;
  ctx.fillRect(layout.offsetX - 4, layout.offsetY + riseOffset - 4, layout.boardPxW + 8, layout.boardPxH + 8);

  const panelGrad = ctx.createLinearGradient(layout.offsetX, layout.offsetY + riseOffset, layout.offsetX, layout.offsetY + riseOffset + layout.boardPxH);
  panelGrad.addColorStop(0, "#0f1723");
  panelGrad.addColorStop(1, "#090f15");
  ctx.fillStyle = panelGrad;
  ctx.fillRect(layout.offsetX, layout.offsetY + riseOffset, layout.boardPxW, layout.boardPxH);

  ctx.strokeStyle = "rgba(126, 178, 220, 0.22)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= boardState.cols; x += 1) {
    ctx.beginPath();
    ctx.moveTo(layout.offsetX + x * layout.size + 0.5, layout.offsetY + riseOffset);
    ctx.lineTo(layout.offsetX + x * layout.size + 0.5, layout.offsetY + riseOffset + layout.boardPxH);
    ctx.stroke();
  }
  for (let y = 0; y <= boardState.rows; y += 1) {
    ctx.beginPath();
    ctx.moveTo(layout.offsetX, layout.offsetY + riseOffset + y * layout.size + 0.5);
    ctx.lineTo(layout.offsetX + layout.boardPxW, layout.offsetY + riseOffset + y * layout.size + 0.5);
    ctx.stroke();
  }

  for (let y = 0; y < boardState.rows; y += 1) {
    for (let x = 0; x < boardState.cols; x += 1) {
      const cell = boardState.grid[y][x];
      if (cell) {
        drawCell(ctx, layout.offsetX + x * layout.size, layout.offsetY + riseOffset + y * layout.size, layout.size, cell.color, 0.96);
      }
    }
  }

  for (const pid of boardState.playerIds) {
    const p = boardState.playersById[pid];
    if (!p.alive) continue;
    for (const c of getActivePieceCells(p)) {
      if (c.y < 0) continue;
      drawCell(ctx, layout.offsetX + c.x * layout.size, layout.offsetY + riseOffset + c.y * layout.size, layout.size, p.color, 1);
    }
  }

  drawBoardFlashes(ctx, boardState.index, layout, now, riseOffset);

  ctx.fillStyle = "#dff3ff";
  ctx.font = "14px Trebuchet MS";
  ctx.fillText(`${boardState.label} (${boardState.cols}x${boardState.rows})`, layout.offsetX, layout.offsetY - 9);
}

function drawBackdrop(ctx, w, h, now) {
  const t = now * 0.0006;
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, "#081624");
  bgGrad.addColorStop(0.5, "#101323");
  bgGrad.addColorStop(1, "#231226");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(118,180,255,0.09)";
  ctx.lineWidth = 1;
  const step = 42;
  for (let x = -step; x < w + step; x += step) {
    const px = x + ((t * 60) % step);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px - h * 0.18, h);
    ctx.stroke();
  }
}

export function drawBoards(dom, gameState, now = performance.now()) {
  resizeCanvasToContainer(dom);
  const ctx = dom.canvas.getContext("2d");
  const canvasW = dom.canvas.width;
  const canvasH = dom.canvas.height;
  drawBackdrop(ctx, canvasW, canvasH, now);

  const boardCount = gameState.boards.length;
  const cols = gameState.boards[0].cols;
  const size = computeCellSize(dom.canvas, cols, boardCount);

  const boardPxW = cols * size;
  const boardPxH = ROWS * size;
  const gap = boardCount === 2 ? 42 : 0;
  const totalWidth = boardCount * boardPxW + (boardCount - 1) * gap;
  const startX = Math.floor((canvasW - totalWidth) / 2);
  const startY = Math.floor((canvasH - boardPxH) / 2) + 8;

  const layoutByIndex = new Map();
  for (let i = 0; i < boardCount; i += 1) {
    layoutByIndex.set(i, {
      offsetX: startX + i * (boardPxW + gap),
      offsetY: startY,
      boardPxW,
      boardPxH,
      size,
    });
  }

  ingestVisualEvents(gameState, layoutByIndex, now);

  for (let i = 0; i < boardCount; i += 1) {
    drawSingleBoard(ctx, gameState.boards[i], layoutByIndex.get(i), now);
  }

  drawSparks(ctx, now);
}
