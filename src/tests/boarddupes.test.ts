import { describe, expect, it } from "vitest";
import { moveCard, parseBoard } from "../lib/boardNote";

/**
 * Two cards can hold the same text (people write "Buy milk" twice), and moveCard finds the moved card by searching the
 * note for its first line. These pin down that the search lands on the card that was dropped, and on its order.
 */
describe("moving a card when two cards read the same", () => {
  const board = ["---", "", "kanban-plugin: basic", "", "---", "",
    "## Doing", "", "- [ ] Buy milk", "- [ ] Buy milk", "", "## Done", "", "**Complete**", ""].join("\n");

  it("checks the card that was dropped, not the first one with that text", () => {
    const parsed = parseBoard(board);
    const doing = parsed.columns.findIndex((c) => c.title === "Doing");
    const done = parsed.columns.findIndex((c) => c.title === "Done");
    const out = moveCard(board, { col: doing, card: 1 }, { col: done, index: 0 }, { today: "2026-11-04" });
    const after = parseBoard(out);
    expect(after.columns[done].cards).toHaveLength(1);
    expect(after.columns[done].cards[0].done).toBe(true);
    expect(after.columns[done].cards[0].text).toContain("@done(2026-11-04)");
    // the card left behind is untouched: still open, no stamp
    expect(after.columns[doing].cards).toHaveLength(1);
    expect(after.columns[doing].cards[0].done).toBe(false);
    expect(after.columns[doing].cards[0].text).not.toContain("@done");
  });

  it("keeps the order when a card moves within its own column", () => {
    const b = ["---", "", "kanban-plugin: basic", "", "---", "", "## To do", "", "- [ ] A", "- [ ] B", "- [ ] C", ""].join("\n");
    const out = parseBoard(moveCard(b, { col: 0, card: 0 }, { col: 0, index: 2 }, { today: "2026-11-04" }));
    expect(out.columns[0].cards.map((c) => c.text)).toEqual(["B", "A", "C"]);
  });
});
