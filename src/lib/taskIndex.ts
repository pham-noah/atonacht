import { Task, parseTasks } from "./tasks";

/**
 * Remembers the tasks found in each note. After a save only the note that changed is parsed again,
 * so typing in a big notes folder doesn't re-read every note on every keystroke.
 */
export class TaskIndex {
  private cache = new Map<string, { content: string; tasks: Task[] }>();
  parsed = 0; // how many notes were parsed on the last build (for tests)

  build(notes: Record<string, string>): Task[] {
    const next = new Map<string, { content: string; tasks: Task[] }>();
    const out: Task[] = [];
    this.parsed = 0;
    for (const path in notes) {
      const content = notes[path];
      let entry = this.cache.get(path);
      if (!entry || entry.content !== content) {
        entry = { content, tasks: parseTasks(path, content) };
        this.parsed++;
      }
      next.set(path, entry);
      for (const t of entry.tasks) out.push(t);
    }
    this.cache = next; // notes that were deleted or renamed drop out here
    return out;
  }
}
