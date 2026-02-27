import { keyboardMaps } from "./config.js";

const keyState = {};

export function initKeyboardInput() {
  window.addEventListener("keydown", (e) => {
    keyState[e.code] = true;
    const tracked = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];
    if (tracked.includes(e.code)) e.preventDefault();
  });

  window.addEventListener("keyup", (e) => {
    keyState[e.code] = false;
  });
}

function mapGamepadInput(gamepad) {
  const axisX = gamepad.axes[0] || 0;
  const axisY = gamepad.axes[1] || 0;
  return {
    left: axisX < -0.45 || !!gamepad.buttons[14]?.pressed,
    right: axisX > 0.45 || !!gamepad.buttons[15]?.pressed,
    down: axisY > 0.45 || !!gamepad.buttons[13]?.pressed,
    rotate:
      !!gamepad.buttons[0]?.pressed ||
      !!gamepad.buttons[1]?.pressed ||
      !!gamepad.buttons[2]?.pressed ||
      !!gamepad.buttons[3]?.pressed,
  };
}

export function currentInputForPlayer(player) {
  const map = keyboardMaps[player.id];
  const keyboard = {
    left: !!keyState[map.left],
    right: !!keyState[map.right],
    down: !!keyState[map.down],
    rotate: !!keyState[map.rotate],
  };

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads[player.id];
  if (!pad) return keyboard;

  const gp = mapGamepadInput(pad);
  return {
    left: keyboard.left || gp.left,
    right: keyboard.right || gp.right,
    down: keyboard.down || gp.down,
    rotate: keyboard.rotate || gp.rotate,
  };
}
