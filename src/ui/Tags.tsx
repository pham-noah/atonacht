import { useMemo } from "react";
import { tagIndex } from "../lib/backlinks";
import { useNav } from "../nav";
import { useStore } from "../store";
import { BackBar, PageHead } from "./common";

/** Every #tag in the folder, with how many notes carry it. Tapping one opens those notes. */
export function Tags() {
  const { notes, ready } = useStore();
  const { go } = useNav();
  const tags = useMemo(() => tagIndex(notes), [notes]);

  return (
    <>
      <BackBar label="Library" />
      <PageHead
        title="Tags"
        sub={tags.length ? `${tags.length} tag${tags.length === 1 ? "" : "s"} across ${Object.keys(notes).length} notes` : "Tags are written #like-this in a note"}
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
              </span>
              <span className="muted small">{t.count} note{t.count === 1 ? "" : "s"}</span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}
