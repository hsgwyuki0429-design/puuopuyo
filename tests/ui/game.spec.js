import { test, expect } from "@playwright/test";

const cell = (page, row, col) =>
  page.locator(`.cell[data-row="${row}"][data-col="${col}"]`);
const blocks = (page) => page.locator("#board .block");
async function ready(page) {
  await expect(page.locator("#rotate")).toBeEnabled();
}
async function place(page, row, col) {
  await cell(page, row, col).click();
  await ready(page);
}

test.beforeEach(async ({ page }) => {
  // Deterministic all-red horizontal pieces let UI tests assert exact clears.
  await page.addInitScript(() => {
    Math.random = () => 0.05;
  });
  await page.goto("/");
});

test("initial layout, arbitrary hand order, rotation, refill and restart", async ({
  page,
}) => {
  await expect(page.locator(".cell")).toHaveCount(64);
  await expect(page.locator(".piece-slot:not(:disabled)")).toHaveCount(3);
  await page.locator(".piece-slot").nth(2).click();
  await page.locator("#rotate").click();
  await expect(page.locator(".piece-slot").nth(2)).toHaveAttribute(
    "aria-label",
    /縦/,
  );
  await place(page, 2, 2);
  await expect(cell(page, 2, 2).locator(".block")).toHaveCount(1);
  await expect(cell(page, 3, 2).locator(".block")).toHaveCount(1);
  await expect(page.locator(".piece-slot").nth(2)).toBeDisabled();
  await place(page, 0, 5);
  await place(page, 6, 5);
  await expect(blocks(page)).toHaveCount(6);
  await expect(page.locator(".piece-slot:not(:disabled)")).toHaveCount(3);
  await page.locator("#restart").click();
  await page.locator("#cancel-restart").click();
  await expect(blocks(page)).toHaveCount(6);
  await page.locator("#restart").click();
  await page.locator("#confirm-restart").click();
  await expect(blocks(page)).toHaveCount(0);
  await expect(page.locator("#score")).toHaveText("0");
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
});

test("square clear scores 40; unsupported survivors never change cell", async ({
  page,
}) => {
  await place(page, 0, 0);
  await place(page, 3, 3);
  await place(page, 4, 3);
  await expect(blocks(page)).toHaveCount(2);
  await expect(page.locator("#score")).toHaveText("40");
  await expect(page.locator("#best")).toHaveText("40");
  await expect(cell(page, 0, 0).locator(".block")).toHaveCount(1);
  await expect(cell(page, 0, 1).locator(".block")).toHaveCount(1);
  await expect(cell(page, 7, 0).locator(".block")).toHaveCount(0);
  await page.locator("#restart").click();
  await page.locator("#confirm-restart").click();
  await expect(page.locator("#best")).toHaveText("40");
});

test("invalid overlap and board edge consume no piece and change no score", async ({
  page,
}) => {
  await place(page, 2, 2);
  await cell(page, 2, 1).click();
  await expect(page.locator("#message")).toHaveClass(/error/);
  await expect(blocks(page)).toHaveCount(2);
  await cell(page, 2, 7).click();
  await expect(blocks(page)).toHaveCount(2);
  await expect(page.locator(".piece-slot:not(:disabled)")).toHaveCount(2);
  await expect(page.locator("#score")).toHaveText("0");
});

test("mouse drag previews valid / invalid positions and returns rejected pieces", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Actual touch drag is covered separately.");
  const slot = await page.locator(".piece-slot").first().boundingBox();
  const target = await cell(page, 3, 3).boundingBox();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 8 },
  );
  await expect(page.locator("#preview .block")).toHaveCount(2);
  await expect(page.locator("#preview")).not.toHaveClass(/invalid/);
  await page.mouse.up();
  await ready(page);
  await expect(blocks(page)).toHaveCount(2);
  const next = await page.locator(".piece-slot").nth(1).boundingBox();
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 8 },
  );
  await expect(page.locator("#preview")).toHaveClass(/invalid/);
  await page.mouse.up();
  await expect(page.locator("#drag-piece")).toBeHidden();
  await expect(blocks(page)).toHaveCount(2);
  await expect(page.locator(".piece-slot").nth(1)).toBeEnabled();
});

test("touch drag places at the visible preview; cancelled gesture consumes nothing", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch-only scenario.");
  const session = await page.context().newCDPSession(page);
  const slot = await page.locator(".piece-slot").first().boundingBox();
  const target = await cell(page, 3, 3).boundingBox();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        x: target.x + target.width / 2,
        y: target.y + target.height / 2 + target.width * 1.4,
      },
    ],
  });
  await expect(page.locator("#preview .block")).toHaveCount(2);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await ready(page);
  await expect(cell(page, 3, 3).locator(".block")).toHaveCount(1);
  await expect(cell(page, 3, 4).locator(".block")).toHaveCount(1);
  const next = await page.locator(".piece-slot").nth(1).boundingBox();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: next.x + next.width / 2, y: next.y + next.height / 2 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 100, y: 200 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(page.locator("#drag-piece")).toBeHidden();
  await expect(blocks(page)).toHaveCount(2);
});

test("keyboard controls and instructions work", async ({ page, isMobile }) => {
  test.skip(isMobile, "Keyboard-only scenario.");
  await page.keyboard.press("3");
  await page.keyboard.press("r");
  await page.locator("#board").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await ready(page);
  await expect(cell(page, 1, 1).locator(".block")).toHaveCount(1);
  await expect(cell(page, 2, 1).locator(".block")).toHaveCount(1);
  await page.locator("#help").click();
  await expect(page.locator("#help-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-dialog")).not.toBeVisible();
});

test("game over after all legal placements, with result and replay", async ({
  page,
}) => {
  // Alternate pair colors to tile all 64 cells without creating any group of four.
  await page.addInitScript(() => {
    let calls = 0;
    Math.random = () => {
      const n = calls++,
        index = Math.floor(n / 3),
        inPiece = n % 3;
      if (inPiece === 2) return 0;
      return (((Math.floor(index / 4) + (index % 4)) % 4) + 0.1) / 4;
    };
  });
  await page.reload();
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col += 2) {
      await cell(page, row, col).click();
      if (row !== 7 || col !== 6) await ready(page);
    }
  await expect(page.locator("#over-dialog")).toBeVisible();
  await expect(blocks(page)).toHaveCount(64);
  await expect(page.locator("#final-score")).toHaveText("0");
  await page.locator("#view-board").click();
  await expect(page.locator("#rotate")).toBeDisabled();
  await page.locator("#restart").click();
  await page.locator("#confirm-restart").click();
  await expect(blocks(page)).toHaveCount(0);
  await expect(page.locator("#rotate")).toBeEnabled();
});

test("render representative board without runtime errors", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    let seed = 71;
    Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  });
  await page.reload();
  for (const [r, c] of [
    [5, 0],
    [6, 2],
    [3, 1],
    [6, 5],
    [4, 4],
    [2, 5],
    [0, 2],
  ])
    await place(page, r, c);
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: testInfo.outputPath("game.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
