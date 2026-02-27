import { createGame, getGameSummary, updateGame } from "./engine.js";
import { currentInputForPlayer, initKeyboardInput } from "./input.js";
import {
  buildSlotsUi,
  drawBoards,
  getDom,
  readConfigFromTitle,
  showGameOverSummary,
  showScreen,
  updateHUD,
  updateSlotsUi,
} from "./ui.js";

const dom = getDom();
const SETTINGS_STORAGE_KEY = "coop_tetris_settings_v1";

let gameState = null;
let lastConfig = null;

function readTitleSettingsFromDom() {
  const slotTypes = [];
  for (let i = 0; i < 4; i += 1) {
    const select = document.getElementById(`slotType${i}`);
    slotTypes.push(select ? select.value : "human");
  }
  return {
    mode: dom.modeSelectEl.value,
    playerCount: Number(dom.playerCountEl.value),
    speedKey: dom.speedSelectEl.value,
    slotTypes,
  };
}

function applyModeRules() {
  const versus = dom.modeSelectEl.value === "versus";
  dom.playerCountEl.disabled = versus;
  if (versus) dom.playerCountEl.value = "4";
}

function saveTitleSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(readTitleSettingsFromDom()));
  } catch {
    // Ignore storage failures (private mode, disabled storage, quota issues).
  }
}

function loadTitleSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);

    if (parsed.mode === "coop" || parsed.mode === "versus") {
      dom.modeSelectEl.value = parsed.mode;
    }

    const validCounts = new Set(["1", "2", "3", "4"]);
    const countValue = String(parsed.playerCount ?? "");
    if (validCounts.has(countValue)) {
      dom.playerCountEl.value = countValue;
    }

    if (Array.isArray(parsed.slotTypes)) {
      for (let i = 0; i < 4; i += 1) {
        const nextType = parsed.slotTypes[i];
        const select = document.getElementById(`slotType${i}`);
        if (!select) continue;
        select.value = nextType === "bot" ? "bot" : "human";
      }
    }

    const validSpeeds = new Set(["slow", "normal", "fast", "very_fast", "insane", "absurd"]);
    if (validSpeeds.has(parsed.speedKey)) {
      dom.speedSelectEl.value = parsed.speedKey;
    }
  } catch {
    // Ignore malformed settings and keep defaults.
  }
}

function startGameFromTitle() {
  saveTitleSettings();
  lastConfig = readConfigFromTitle(dom);
  gameState = createGame(lastConfig);
  showScreen(dom, "game");
  updateHUD(dom, gameState);
  drawBoards(dom, gameState, performance.now());
}

function goToTitle() {
  gameState = null;
  showScreen(dom, "title");
}

function bootstrapUi() {
  buildSlotsUi(dom);
  loadTitleSettings();
  applyModeRules();
  updateSlotsUi(dom);

  dom.modeSelectEl.addEventListener("change", () => {
    applyModeRules();
    updateSlotsUi(dom);
    saveTitleSettings();
  });

  dom.playerCountEl.addEventListener("change", () => {
    updateSlotsUi(dom);
    saveTitleSettings();
  });

  dom.speedSelectEl.addEventListener("change", saveTitleSettings);

  for (let i = 0; i < 4; i += 1) {
    const select = document.getElementById(`slotType${i}`);
    if (!select) continue;
    select.addEventListener("change", saveTitleSettings);
  }

  dom.startBtn.addEventListener("click", startGameFromTitle);
  dom.backToTitleBtn.addEventListener("click", goToTitle);
  dom.titleBtn.addEventListener("click", goToTitle);

  dom.playAgainBtn.addEventListener("click", () => {
    if (!lastConfig) return;
    gameState = createGame(lastConfig);
    showScreen(dom, "game");
    updateHUD(dom, gameState);
    drawBoards(dom, gameState, performance.now());
  });
}

function updateFrame(now) {
  if (!gameState) return;

  if (!gameState.running) {
    drawBoards(dom, gameState, now);
    return;
  }

  updateGame(gameState, now, currentInputForPlayer);
  updateHUD(dom, gameState);
  drawBoards(dom, gameState, now);

  if (!gameState.running) {
    showGameOverSummary(dom, getGameSummary(gameState, lastConfig));
  }
}

function loop(now) {
  updateFrame(now);
  requestAnimationFrame(loop);
}

initKeyboardInput();
bootstrapUi();
showScreen(dom, "title");
requestAnimationFrame(loop);
