import { describe, expect, it } from "vitest";
import { createHistoryState, historyReducer } from "./history";

describe("historyReducer", () => {
  it("undoes and redoes committed states", () => {
    let history = createHistoryState({ masks: [] as string[] }, 4);
    history = historyReducer(history, { type: "commit", next: { masks: ["a"] } });
    history = historyReducer(history, {
      type: "commit",
      next: { masks: ["a", "b"] },
    });

    history = historyReducer(history, { type: "undo" });
    expect(history.present.masks).toEqual(["a"]);
    expect(history.future).toHaveLength(1);

    history = historyReducer(history, { type: "redo" });
    expect(history.present.masks).toEqual(["a", "b"]);
    expect(history.future).toHaveLength(0);
  });

  it("caps past states at the configured capacity", () => {
    let history = createHistoryState(0, 2);
    history = historyReducer(history, { type: "commit", next: 1 });
    history = historyReducer(history, { type: "commit", next: 2 });
    history = historyReducer(history, { type: "commit", next: 3 });

    expect(history.past).toEqual([1, 2]);
    history = historyReducer(history, { type: "undo" });
    history = historyReducer(history, { type: "undo" });
    const unchanged = historyReducer(history, { type: "undo" });
    expect(history.present).toBe(1);
    expect(unchanged).toBe(history);
  });

  it("clears redo states when a new branch is committed", () => {
    let history = createHistoryState("initial", 5);
    history = historyReducer(history, { type: "commit", next: "first" });
    history = historyReducer(history, { type: "commit", next: "second" });
    history = historyReducer(history, { type: "undo" });
    history = historyReducer(history, { type: "commit", next: "replacement" });

    expect(history.present).toBe("replacement");
    expect(history.future).toEqual([]);
    expect(historyReducer(history, { type: "redo" })).toBe(history);
  });

  it("supports replacement without adding an undo entry and reset with the same cap", () => {
    let history = createHistoryState(1, 3);
    history = historyReducer(history, { type: "replace", next: 2 });
    expect(history.present).toBe(2);
    expect(history.past).toEqual([]);

    history = historyReducer(history, { type: "commit", next: 3 });
    history = historyReducer(history, { type: "reset", next: 10 });
    expect(history).toEqual({ past: [], present: 10, future: [], capacity: 3 });
  });

  it("does not record referential no-ops and rejects invalid capacities", () => {
    const present = { masks: ["a"] };
    const history = createHistoryState(present);
    expect(historyReducer(history, { type: "commit", next: present })).toBe(history);
    expect(() => createHistoryState(0, 0)).toThrow(RangeError);
    expect(() => createHistoryState(0, 1.5)).toThrow(RangeError);
  });
});
