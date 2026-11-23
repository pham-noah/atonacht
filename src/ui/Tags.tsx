import { useMemo } from "react";
import { tagIndex } from "../lib/backlinks";
import { useNav } from "../nav";
import { useStore } from "../store";
import { BackBar, PageHead } from "./common";

/** The note names a tag appears in, as the row's second line. */
const where = (paths: string[]) => {
  const names = paths.map((p) => p.split("/").pop()!.replace(/\.md$/i, ""));
  return names.length > 2 ? `${names.slice(0, 2).join(" · ")} +${names.length - 2}` : names.join(" · ");
};

/** Every #tag in the folder, with how many notes carry it. Tapping one opens those notes. */
export function Tags() {
  const { notes, ready } = useStore();
  const { go } = useNav();
  const tags = useMemo(() => tagIndex(notes), [notes]);
  // notes that carry at least one tag — not the whole vault, which is what this used to count
  const tagged = useMemo(() => new Set(tags.flatMap((t) => t.paths)).size, [tags]);

  return (
    <>
      <BackBar label="Home" onBack={() => go({ name: "home" })} />
      <PageHead
        title="Tags"
        sub={tags.length ? `${tags.length} tag${tags.length === 1 ? "" : "s"} in ${tagged} note${tagged === 1 ? "" : "s"}` : "Tags are written #like-this in a note"}
      />
      {tags.length === 0 ? (
        <section className="card">
          <p className="muted">
            {ready ? "No tags yet. Write #thesis anywhere in a note and it appears here." : "Reading your notes…"}
          </p>
        </section>
      ) : (
        <section className="card stack">
          {tags.map((t) => (
            <button key={t.tag} className="srow tagrow" onClick={() => go({ name: "notes", query: `tag:${t.tag}` })}>
              <span className="grow">
                <span className="chip">#{t.tag}</span>
                <span className="muted small tagnotes">{where(t.paths)}</span>
              </span>
              <span className="muted small">{t.count} note{t.count === 1 ? "" : "s"}</span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}
