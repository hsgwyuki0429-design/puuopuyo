// All tunable game rules live here. The engine has no timers or rendering code.
export const CONFIG = Object.freeze({
  size: 8,
  colors: 4,
  handSize: 3,
  clearSize: 4,
  pointsPerBlock: 10,
});

export function makeHand(config = CONFIG, random = Math.random) {
  return Array.from({ length: config.handSize }, () => ({
    colors: [
      Math.floor(random() * config.colors),
      Math.floor(random() * config.colors),
    ],
    rotation: Math.floor(random() * 4),
  }));
}

export function newGame(config = CONFIG, random = Math.random) {
  return {
    board: Array.from({ length: config.size }, () =>
      Array(config.size).fill(null),
    ),
    hand: makeHand(config, random),
    score: 0,
    moves: 0,
    cleared: 0,
    over: false,
  };
}

// Clockwise rotation, normalized to the piece's top-left bounding box.
// Color order is retained through all four orientations.
export function pieceCells(piece, row = 0, col = 0) {
  const offsets = [
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
  ];
  return offsets[piece.rotation % 4].map(([dr, dc], i) => ({
    row: row + dr,
    col: col + dc,
    color: piece.colors[i],
  }));
}

export function canPlace(board, piece, row, col) {
  return (
    Boolean(piece) &&
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    pieceCells(piece, row, col).every(
      (cell) =>
        cell.row >= 0 &&
        cell.row < board.length &&
        cell.col >= 0 &&
        cell.col < board[cell.row].length &&
        board[cell.row][cell.col] === null,
    )
  );
}

export function findGroups(board, minimum = CONFIG.clearSize) {
  const seen = new Set();
  const groups = [];
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const color = board[row][col];
      const key = `${row},${col}`;
      if (color === null || seen.has(key)) continue;
      const group = [{ row, col, color }];
      seen.add(key);
      for (let i = 0; i < group.length; i++) {
        const current = group[i];
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ]) {
          const nr = current.row + dr,
            nc = current.col + dc;
          const nextKey = `${nr},${nc}`;
          if (
            nr >= 0 &&
            nr < board.length &&
            nc >= 0 &&
            nc < board[nr].length &&
            board[nr][nc] === color &&
            !seen.has(nextKey)
          ) {
            seen.add(nextKey);
            group.push({ row: nr, col: nc, color });
          }
        }
      }
      if (group.length >= minimum) groups.push(group);
    }
  }
  return groups;
}

export function hasMove(board, hand) {
  return hand.some(
    (piece) =>
      piece &&
      [0, 1, 2, 3].some((rotation) =>
        board.some((line, row) =>
          line.some((_, col) =>
            canPlace(board, { ...piece, rotation }, row, col),
          ),
        ),
      ),
  );
}

export function placePiece(
  state,
  index,
  row,
  col,
  config = CONFIG,
  random = Math.random,
) {
  const piece = state.hand[index];
  if (state.over || !canPlace(state.board, piece, row, col)) return null;
  const placedBoard = state.board.map((line) => [...line]);
  const placed = pieceCells(piece, row, col);
  for (const cell of placed) placedBoard[cell.row][cell.col] = cell.color;
  const groups = findGroups(placedBoard, config.clearSize);
  const removed = groups.flat();
  const board = placedBoard.map((line) => [...line]);
  // Deliberately clear only these cells. No gravity, compaction, or chain loop.
  for (const cell of removed) board[cell.row][cell.col] = null;
  let hand = state.hand.map((value, slot) => (slot === index ? null : value));
  const refilled = hand.every((value) => value === null);
  if (refilled) hand = makeHand(config, random);
  return {
    placedBoard,
    placed,
    removed,
    groups,
    refilled,
    state: {
      board,
      hand,
      score: state.score + removed.length * config.pointsPerBlock,
      moves: state.moves + 1,
      cleared: state.cleared + removed.length,
      over: !hasMove(board, hand),
    },
  };
}
