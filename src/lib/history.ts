export interface HistoryState<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  readonly capacity: number;
}

export type HistoryAction<T> =
  | { type: "commit"; next: T }
  | { type: "replace"; next: T }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; next: T };

export const DEFAULT_HISTORY_CAPACITY = 100;

function validateCapacity(capacity: number): number {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError("History capacity must be a positive safe integer.");
  }
  return capacity;
}

export function createHistoryState<T>(
  initial: T,
  capacity = DEFAULT_HISTORY_CAPACITY,
): HistoryState<T> {
  return {
    past: [],
    present: initial,
    future: [],
    capacity: validateCapacity(capacity),
  };
}

function appendCapped<T>(
  values: readonly T[],
  value: T,
  capacity: number,
): readonly T[] {
  const start = Math.max(0, values.length + 1 - capacity);
  return [...values.slice(start), value];
}

/**
 * A framework-agnostic reducer suitable for React.useReducer. Only `commit`
 * records an undo step; `replace` is useful for transient state updates.
 */
export function historyReducer<T>(
  state: HistoryState<T>,
  action: HistoryAction<T>,
): HistoryState<T> {
  switch (action.type) {
    case "commit": {
      if (Object.is(action.next, state.present)) return state;
      return {
        ...state,
        past: appendCapped(state.past, state.present, state.capacity),
        present: action.next,
        future: [],
      };
    }

    case "replace": {
      if (Object.is(action.next, state.present)) return state;
      return { ...state, present: action.next, future: [] };
    }

    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future].slice(0, state.capacity),
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...remaining] = state.future;
      return {
        ...state,
        past: appendCapped(state.past, state.present, state.capacity),
        present: next,
        future: remaining,
      };
    }

    case "reset":
      return createHistoryState(action.next, state.capacity);
  }
}
