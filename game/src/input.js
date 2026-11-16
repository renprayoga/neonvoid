// Keyboard + mouse input, read every frame. Actions are edge-triggered (consumed once),
// movement is a held direction vector, and the aim is the mouse position in field space.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas, toField) {
  const keys = new Set();
  let actions = 0;
  let firing = false;
  let mouseX = 640;
  let mouseY = 360;
  let clicked = false;
  let clickX = 0;
  let clickY = 0;

  function keyName(event) {
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
  }

  function onKeyDown(event) {
    const key = keyName(event);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(key);
    if (key === ' ' || key === 'Enter') actions |= ACTION_CONFIRM;
    if (key === 'p' || key === 'Escape') actions |= ACTION_PAUSE;
    if (key === 'Shift') actions |= ACTION_DASH;
    if (key === 'm') actions |= ACTION_MUTE;
  }
  function onKeyUp(event) { keys.delete(keyName(event)); }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const point = toField(event.clientX - rect.left, event.clientY - rect.top);
    mouseX = point.x;
    mouseY = point.y;
  }
  function onMouseDown(event) {
    onMouseMove(event);
    if (event.button === 0) firing = true;
    canvas.focus?.();
  }
  function onMouseUp(event) { if (event.button === 0) firing = false; }
  function onClick(event) {
    const rect = canvas.getBoundingClientRect();
    const point = toField(event.clientX - rect.left, event.clientY - rect.top);
    clickX = point.x;
    clickY = point.y;
    clicked = true;
  }
  function onBlur() { keys.clear(); firing = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('click', onClick);

  return {
    direction() {
      let x = 0;
      let y = 0;
      if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('d') || keys.has('ArrowRight')) x += 1;
      if (keys.has('w') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('s') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    aim() { return { x: mouseX, y: mouseY }; },
    isFiring() { return firing; },
    takeActions() { const value = actions; actions = 0; return value; },
    takeClick() {
      if (!clicked) return null;
      clicked = false;
      return { x: clickX, y: clickY };
    },
    // Test / screenshot autopilot hook: pretend a key is held.
    press(key) { keys.add(key); },
    release(key) { keys.delete(key); },
    setAim(x, y) { mouseX = x; mouseY = y; },
    setFiring(value) { firing = value; },
  };
}
