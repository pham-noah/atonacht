/**
 * A stack of things that can take the Android back gesture before the router does.
 *
 * Screens that own a temporary state - the sidebar drawer, a Settings section, a sheet - push a handler while that
 * state is open. The newest handler runs first, so back always undoes the most recent thing you opened, then the
 * router steps back through its own history, and only then does the activity finish.
 */
type Handler = () => boolean;

const stack: Handler[] = [];

export function pushBack(fn: Handler): () => void {
  stack.push(fn);
  return () => {
    const i = stack.indexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Runs the newest handler that claims the gesture. Returns false when nothing wanted it. */
export function runBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    try {
      if (stack[i]()) return true;
    } catch {
      // a broken handler must not swallow the gesture
    }
  }
  return false;
}
