import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG,
  newGame,
  makeHand,
  pieceCells,
  canPlace,
  findGroups,
  hasMove,
  placePiece,
} from "../game.js";

const piece = (a = 0, b = 1, rotation = 0) => ({ colors: [a, b], rotation });
const empty = () => newGame(CONFIG, () => 0).board;
function fixture(board, hand = [piece(), piece(), piece()]) {
  return { ...newGame(), board, hand };
}

test("defaults: 8×8, four colors, three pieces; same and mixed colors are possible", () => {
  assert.equal(empty().length, 8);
  assert.deepEqual(CONFIG, {
    size: 8,
    colors: 4,
    handSize: 3,
    clearSize: 4,
    pointsPerBlock: 10,
  });
  assert.deepEqual(
    makeHand(CONFIG, () => 0.99).map((p) => p.colors),
    [
      [3, 3],
      [3, 3],
      [3, 3],
    ],
  );
  const values = [0, 0.26, 0, 0.51, 0.76, 0.3, 0.99, 0.99, 0.5];
  assert.deepEqual(
    makeHand(CONFIG, () => values.shift()).map((p) => p.colors),
    [
      [0, 1],
      [2, 3],
      [3, 3],
    ],
  );
});
test("four clockwise rotations preserve color order and return to the original", () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((rotation) =>
      pieceCells(piece(0, 1, rotation)).map((c) => [c.row, c.col]),
    ),
    [
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 0],
      ],
      [
        [0, 1],
        [0, 0],
      ],
      [
        [1, 0],
        [0, 0],
      ],
    ],
  );
  assert.deepEqual(pieceCells(piece(0, 1, 4)), pieceCells(piece()));
});
test("placement is atomic, within bounds, collision-free; support is unnecessary", () => {
  const board = empty();
  assert.equal(canPlace(board, piece(), 3, 3), true);
  assert.equal(canPlace(board, piece(), 0, 7), false);
  assert.equal(canPlace(board, piece(0, 1, 1), 7, 0), false);
  assert.equal(canPlace(board, piece(), -1, 0), false);
  assert.equal(canPlace(board, piece(), 0, 0.5), false);
  board[3][4] = 2;
  const state = fixture(board),
    before = structuredClone(state);
  assert.equal(placePiece(state, 0, 3, 3), null);
  assert.deepEqual(state, before);
});
test("an enclosed pair of empty cells is directly accessible", () => {
  const board = empty();
  for (const [r, c] of [
    [2, 3],
    [2, 4],
    [3, 2],
    [3, 5],
    [4, 3],
    [4, 4],
  ])
    board[r][c] = 2;
  assert.equal(canPlace(board, piece(), 3, 3), true);
});
test("diagonal blocks, a group of three, and a mixed full row do not clear", () => {
  const board = empty();
  for (let i = 0; i < 8; i++) board[i][i] = 0;
  assert.equal(findGroups(board).length, 0);
  board[0] = [0, 1, 2, 3, 0, 1, 2, 3];
  assert.equal(findGroups(board).length, 0);
  const three = empty();
  three[2][2] = three[2][3] = three[3][2] = 1;
  assert.equal(findGroups(three).length, 0);
});
test("straight, L-shaped, square, and larger branched groups all clear in full", () => {
  for (const coordinates of [
    [
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
    ],
    [
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 2],
    ],
    [
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ],
    [
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 2],
      [3, 2],
      [3, 3],
    ],
  ]) {
    const board = empty();
    coordinates.forEach(([r, c]) => (board[r][c] = 0));
    assert.equal(findGroups(board)[0].length, coordinates.length);
  }
});
test("two colors clear simultaneously, scoring every block", () => {
  const board = empty();
  for (let row = 1; row <= 3; row++) {
    board[row][2] = 0;
    board[row][3] = 1;
  }
  const result = placePiece(fixture(board), 0, 4, 2);
  assert.equal(result.groups.length, 2);
  assert.equal(result.removed.length, 8);
  assert.equal(result.state.score, 80);
  assert.deepEqual(result.state.board, empty());
});
test("all qualifying groups are found, including separate groups of the same color", () => {
  const board = empty();
  board[0] = [0, 0, 0, 0, null, null, null, null];
  board[7] = [0, 0, 0, 0, null, null, null, null];
  assert.equal(findGroups(board).length, 2);
});
test("one half can clear; its partner and every other survivor stay at exact coordinates", () => {
  const board = empty();
  board[3][1] = board[3][2] = board[3][3] = 0;
  board[2][2] = 1;
  board[0][5] = 2;
  board[6][7] = 3;
  const state = fixture(board),
    before = structuredClone(state);
  const result = placePiece(state, 0, 3, 4);
  assert.equal(result.state.score, 40);
  assert.equal(result.state.board[3][5], 1);
  const expected = empty();
  expected[2][2] = 1;
  expected[0][5] = 2;
  expected[6][7] = 3;
  expected[3][5] = 1;
  assert.deepEqual(result.state.board, expected);
  assert.deepEqual(state, before);
});
test("no clearing means every block remains at its placement coordinate", () => {
  const result = placePiece(fixture(empty()), 0, 2, 5);
  assert.equal(result.state.board[2][5], 0);
  assert.equal(result.state.board[2][6], 1);
  assert.equal(result.state.board[7][5], null);
});
test("pieces can be used in any order; refill only after all three have been used", () => {
  let state = fixture(empty());
  let result = placePiece(state, 2, 0, 0);
  assert.equal(result.refilled, false);
  assert.equal(result.state.hand[2], null);
  result = placePiece(result.state, 0, 2, 0);
  assert.equal(result.refilled, false);
  assert.equal(result.state.hand.filter(Boolean).length, 1);
  result = placePiece(result.state, 1, 4, 0);
  assert.equal(result.refilled, true);
  assert.equal(result.state.hand.filter(Boolean).length, 3);
});
test("game-over search includes rotation and rejects isolated vacancies", () => {
  const board = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => (r + c) % 4),
  );
  board[2][2] = board[3][2] = null;
  assert.equal(hasMove(board, [null, piece(), null]), true);
  board[3][2] = 0;
  board[5][5] = null;
  assert.equal(hasMove(board, [piece()]), false);
});
test("game-over is checked after clear and refill, not against the temporary full board", () => {
  const config = { ...CONFIG, size: 2, handSize: 1 };
  const state = {
    ...newGame(config),
    board: [
      [0, 0],
      [null, null],
    ],
    hand: [piece(0, 0)],
  };
  const result = placePiece(state, 0, 1, 0, config, () => 0);
  assert.equal(result.state.over, false);
  assert.equal(result.refilled, true);
  assert.equal(result.state.score, 40);
  const full = placePiece(
    {
      ...state,
      board: [
        [1, 2],
        [null, null],
      ],
    },
    0,
    1,
    0,
    config,
    () => 0,
  );
  assert.equal(full.state.over, true);
  assert.equal(full.state.hand.length, 1);
  assert.equal(placePiece(full.state, 0, 0, 0, config), null);
});
test("long deterministic play preserves all survivors: no hidden falling or extra chains", () => {
  let seed = 104;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  let state = newGame(CONFIG, random);
  for (let turn = 0; turn < 120 && !state.over; turn++) {
    let chosen;
    for (let i = 0; i < state.hand.length && !chosen; i++) {
      if (!state.hand[i]) continue;
      for (let rotation = 0; rotation < 4 && !chosen; rotation++) {
        const piece = { ...state.hand[i], rotation };
        for (let r = 0; r < 8 && !chosen; r++)
          for (let c = 0; c < 8 && !chosen; c++) {
            if (canPlace(state.board, piece, r, c)) chosen = { i, r, c, piece };
          }
      }
    }
    assert.ok(chosen);
    state.hand[chosen.i] = chosen.piece;
    const result = placePiece(
      state,
      chosen.i,
      chosen.r,
      chosen.c,
      CONFIG,
      random,
    );
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const removed = result.removed.some(
          (cell) => cell.row === r && cell.col === c,
        );
        assert.equal(
          result.state.board[r][c],
          removed ? null : result.placedBoard[r][c],
        );
      }
    assert.equal(result.state.score - state.score, result.removed.length * 10);
    state = result.state;
  }
});
