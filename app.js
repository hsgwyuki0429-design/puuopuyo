import {
  CONFIG,
  newGame,
  pieceCells,
  canPlace,
  placePiece,
  snapPlacement,
} from "./game.js";

const $ = (id) => document.getElementById(id);
const names = ["赤", "青", "黄", "緑"];
const symbols = ["●", "◆", "▲", "■"];
const board = $("board"),
  hand = $("hand"),
  preview = $("preview"),
  ghost = $("drag-piece");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let state = newGame(),
  selected = 0,
  busy = false,
  drag = null,
  candidate = null;
let generation = 0,
  keyboard = { row: 0, col: 0 },
  best = 0;
try {
  best = Math.max(0, Number(localStorage.getItem("puyo-place-best")) || 0);
} catch {
  /* Storage is optional. */
}
board.style.setProperty("--size", CONFIG.size);
hand.style.setProperty("--hand-size", CONFIG.handSize);
$("board-size").textContent = `${CONFIG.size} × ${CONFIG.size}`;

function block(color) {
  const element = document.createElement("span");
  element.className = `block c${color}`;
  const symbol = document.createElement("span");
  symbol.className = "symbol";
  symbol.textContent = symbols[color];
  element.append(symbol);
  return element;
}

function pieceArt(piece) {
  const art = document.createElement("span");
  art.className = "piece-art";
  const cells = pieceCells(piece);
  art.style.setProperty(
    "--cols",
    Math.max(...cells.map((cell) => cell.col)) + 1,
  );
  art.style.setProperty(
    "--rows",
    Math.max(...cells.map((cell) => cell.row)) + 1,
  );
  for (const cell of cells) {
    const element = block(cell.color);
    element.style.setProperty("--col", cell.col);
    element.style.setProperty("--row", cell.row);
    art.append(element);
  }
  return art;
}

function renderBoard(values = state.board, placed = []) {
  board.replaceChildren();
  for (let row = 0; row < CONFIG.size; row++) {
    const line = document.createElement("div");
    line.setAttribute("role", "row");
    line.style.display = "contents";
    for (let col = 0; col < CONFIG.size; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute(
        "aria-label",
        `${row + 1}行${col + 1}列 ${values[row][col] === null ? "空き" : names[values[row][col]]}`,
      );
      if (values[row][col] !== null) {
        const element = block(values[row][col]);
        if (placed.some((value) => value.row === row && value.col === col))
          element.classList.add("placed");
        cell.append(element);
      }
      line.append(cell);
    }
    board.append(line);
  }
}

function renderHand() {
  hand.replaceChildren();
  state.hand.forEach((piece, index) => {
    const button = document.createElement("button");
    button.className = `piece-slot${selected === index && piece ? " selected" : ""}${piece ? "" : " used"}`;
    button.dataset.index = index;
    button.disabled = !piece || busy || state.over;
    button.setAttribute("aria-pressed", String(selected === index));
    button.setAttribute(
      "aria-label",
      piece
        ? `ピース${index + 1} ${piece.colors.map((color) => names[color]).join("・")} ${piece.rotation % 2 ? "縦" : "横"}`
        : `ピース${index + 1} 使用済み`,
    );
    if (piece) {
      button.append(pieceArt(piece));
      const number = document.createElement("span");
      number.className = "slot-number";
      number.textContent = index + 1;
      button.append(number);
    } else button.textContent = "✓";
    hand.append(button);
  });
  $("remaining").textContent = `あと ${state.hand.filter(Boolean).length} 個`;
  board.setAttribute("aria-busy", String(busy));
  board.setAttribute("aria-disabled", String(state.over));
}

function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}

function metrics() {
  const rect = board.getBoundingClientRect();
  const first = board.querySelector(".cell").getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(board).gap);
  return { rect, size: first.width, step: first.width + gap };
}

function pointToCell(x, y, snap = false) {
  const { rect, step, size } = metrics();
  const row = (y - rect.top - size / 2) / step;
  const col = (x - rect.left - size / 2) / step;
  const raw = { row: Math.round(row), col: Math.round(col) };
  return snap
    ? snapPlacement(state.board, state.hand[selected], row, col) || raw
    : raw;
}

function showPreview(position) {
  candidate = position;
  preview.replaceChildren();
  const piece = state.hand[selected];
  if (!position || !piece || busy || state.over) return;
  const { rect, size, step } = metrics();
  const wrapRect = preview.getBoundingClientRect();
  const valid = canPlace(state.board, piece, position.row, position.col);
  preview.classList.toggle("invalid", !valid);
  for (const cell of pieceCells(piece, position.row, position.col)) {
    // Clip distant off-board candidates, but show adjacent overflow as invalid.
    if (
      cell.row < -1 ||
      cell.row > CONFIG.size ||
      cell.col < -1 ||
      cell.col > CONFIG.size
    )
      continue;
    const element = block(cell.color);
    Object.assign(element.style, {
      left: `${rect.left - wrapRect.left + cell.col * step + 1}px`,
      top: `${rect.top - wrapRect.top + cell.row * step + 1}px`,
      width: `${size - 2}px`,
      height: `${size - 2}px`,
    });
    preview.append(element);
  }
}

function clearPreview() {
  candidate = null;
  preview.replaceChildren();
}
function select(index) {
  if (busy || state.over || !state.hand[index]) return;
  selected = index;
  renderHand();
  clearPreview();
}

function cancelDrag() {
  if (drag && hand.hasPointerCapture(drag.id))
    hand.releasePointerCapture(drag.id);
  drag = null;
  ghost.hidden = true;
  clearPreview();
  hand
    .querySelectorAll(".dragging")
    .forEach((element) => element.classList.remove("dragging"));
}

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : ms));
async function commit(position) {
  if (busy || state.over || !position) return;
  const result = placePiece(state, selected, position.row, position.col);
  clearPreview();
  if (!result) {
    message("ここには置けません。空いている2マスを選んでね", true);
    return;
  }
  const version = generation;
  busy = true;
  renderHand();
  renderBoard(result.placedBoard, result.placed);
  await delay(150);
  if (version !== generation) return;
  if (result.removed.length) {
    for (const cell of result.removed)
      board
        .querySelector(
          `[data-row="${cell.row}"][data-col="${cell.col}"] .block`,
        )
        .classList.add("clearing");
    message(
      `${result.groups.length > 1 ? `${result.groups.length}グループ同時！ ` : ""}${result.removed.length}個つながった！ +${result.removed.length * CONFIG.pointsPerBlock}点`,
    );
    $("score-pop").textContent =
      `+${result.removed.length * CONFIG.pointsPerBlock}`;
    $("score-pop").classList.remove("show");
    void $("score-pop").offsetWidth;
    $("score-pop").classList.add("show");
    await delay(230);
    if (version !== generation) return;
  } else
    message(
      result.refilled
        ? "新しい3個のピースです。次はどこに置こう？"
        : "いい場所！ 同じ色を4つ以上つなげよう",
    );
  state = result.state;
  selected = state.hand.findIndex(Boolean);
  busy = false;
  best = Math.max(best, state.score);
  try {
    localStorage.setItem("puyo-place-best", String(best));
  } catch {
    /* Play without storage. */
  }
  renderBoard();
  renderHand();
  $("score").textContent = state.score.toLocaleString();
  $("best").textContent = best.toLocaleString();
  if (state.over) {
    message("置ける場所がなくなりました。また遊ぼう！");
    $("final-score").textContent = state.score.toLocaleString();
    $("final-stats").textContent =
      `${state.moves}手で、${state.cleared}個のブロックを消しました。`;
    $("over-dialog").showModal();
  }
}

hand.addEventListener("pointerdown", (event) => {
  const slot = event.target.closest(".piece-slot");
  if (!slot || slot.disabled || drag || event.button !== 0) return;
  event.preventDefault();
  select(Number(slot.dataset.index));
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false,
    touch: event.pointerType === "touch",
  };
  hand.setPointerCapture(event.pointerId);
});
hand.addEventListener("click", (event) => {
  // Keyboard and assistive-technology button activation.
  if (event.detail === 0) {
    const slot = event.target.closest(".piece-slot");
    if (slot) select(Number(slot.dataset.index));
  }
});
hand.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5)
    drag.moved = true;
  if (!drag.moved) return;
  const { size } = metrics();
  const x = event.clientX,
    y = event.clientY - (drag.touch ? size * 1.4 : 0);
  ghost.replaceChildren(pieceArt(state.hand[selected]));
  ghost.firstChild.style.setProperty("--unit", `${metrics().step}px`);
  ghost.style.left = `${x - size / 2}px`;
  ghost.style.top = `${y - size / 2}px`;
  ghost.hidden = false;
  hand.children[selected].classList.add("dragging");
  showPreview(pointToCell(x, y, true));
});
hand.addEventListener("pointerup", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const moved = drag.moved;
  // Recompute from release coordinates; never commit a stale preview.
  const position = pointToCell(
    event.clientX,
    event.clientY - (drag.touch ? metrics().size * 1.4 : 0),
    true,
  );
  cancelDrag();
  if (moved) commit(position);
  else message("ピースを選択しました。空きマスをタップ");
});
hand.addEventListener("pointercancel", cancelDrag);
hand.addEventListener("lostpointercapture", () => {
  if (drag) cancelDrag();
});

let boardPointer = null;
board.addEventListener("pointerdown", (event) => {
  if (busy || state.over || drag || boardPointer !== null || event.button !== 0)
    return;
  event.preventDefault();
  board.focus({ preventScroll: true });
  boardPointer = event.pointerId;
  board.setPointerCapture(event.pointerId);
  showPreview(pointToCell(event.clientX, event.clientY));
});
board.addEventListener("pointermove", (event) => {
  if (
    busy ||
    state.over ||
    drag ||
    (boardPointer !== null && event.pointerId !== boardPointer)
  )
    return;
  if (event.pointerType === "mouse" || boardPointer === event.pointerId)
    showPreview(pointToCell(event.clientX, event.clientY));
});
board.addEventListener("pointerup", (event) => {
  if (boardPointer !== event.pointerId) return;
  boardPointer = null;
  if (board.hasPointerCapture(event.pointerId))
    board.releasePointerCapture(event.pointerId);
  commit(pointToCell(event.clientX, event.clientY));
});
board.addEventListener("pointercancel", () => {
  boardPointer = null;
  clearPreview();
});
board.addEventListener("lostpointercapture", () => {
  boardPointer = null;
  clearPreview();
});
board.addEventListener("pointerleave", () => {
  if (boardPointer === null) clearPreview();
});
window.addEventListener("blur", () => {
  cancelDrag();
  boardPointer = null;
});
window.addEventListener("resize", () => {
  cancelDrag();
  boardPointer = null;
});

document.addEventListener("keydown", (event) => {
  if (document.querySelector("dialog[open]")) return;
  if (event.key === "Escape") {
    cancelDrag();
    clearPreview();
    return;
  }
  if (drag) return;
  if (/^[1-3]$/.test(event.key)) select(Number(event.key) - 1);
  if (document.activeElement !== board || busy || state.over) return;
  const delta = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }[event.key];
  if (delta) {
    event.preventDefault();
    keyboard = {
      row: Math.max(0, Math.min(CONFIG.size - 1, keyboard.row + delta[0])),
      col: Math.max(0, Math.min(CONFIG.size - 1, keyboard.col + delta[1])),
    };
    showPreview(keyboard);
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    commit(keyboard);
  }
});
board.addEventListener("focus", () => {
  if (!busy && !state.over) showPreview(keyboard);
});
board.addEventListener("blur", clearPreview);

function restart() {
  generation++;
  cancelDrag();
  boardPointer = null;
  for (const dialog of document.querySelectorAll("dialog[open]"))
    dialog.close();
  state = newGame();
  selected = 0;
  busy = false;
  keyboard = { row: 0, col: 0 };
  $("score").textContent = "0";
  $("score-pop").classList.remove("show");
  renderBoard();
  renderHand();
  message("ピースを好きな空きマスへドラッグ");
}
$("restart").addEventListener("click", () => {
  cancelDrag();
  $("restart-dialog").showModal();
});
$("cancel-restart").addEventListener("click", () =>
  $("restart-dialog").close(),
);
$("confirm-restart").addEventListener("click", restart);
$("play-again").addEventListener("click", restart);
$("view-board").addEventListener("click", () => $("over-dialog").close());
$("help").addEventListener("click", () => {
  cancelDrag();
  $("help-dialog").showModal();
});
$("help-dialog")
  .querySelectorAll(".dialog-close")
  .forEach((button) =>
    button.addEventListener("click", () => $("help-dialog").close()),
  );
$("best").textContent = best.toLocaleString();
renderBoard();
renderHand();
