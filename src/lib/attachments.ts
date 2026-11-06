/** Pictures that live beside the notes, in Attachments/, written through the same folder the notes come from. */

export const ATTACHMENTS = "Attachments";

const pad = (n: number) => String(n).padStart(2, "0");

/** "Screenshot 2026-11-05 at 14.22.33.png" → "2026-11-05-142233-screenshot-2026-11-05-at-14.22.33.png", shortened. */
export function attachmentName(fileName: string, now = new Date()): string {
  const dot = fileName.lastIndexOf(".");
  const ext = (dot > 0 ? fileName.slice(dot + 1) : "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "attachment";
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${stamp}-${base}.${ext}`;
}

export const attachmentPath = (name: string) => `${ATTACHMENTS}/${name}`;

/** Images are shown inline; anything else is offered as a link. */
export const isImage = (name: string) => /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name);

/** What to put in the note. A space is encoded so the link does not break at the first space in a file name. */
export function attachmentMarkdown(path: string, label = ""): string {
  const safe = path.replace(/ /g, "%20");
  return isImage(path) ? `![${label}](${safe})` : `[${label || path.split("/").pop()}](${safe})`;
}

/** The attachment paths a note refers to, in order. */
export function attachmentsIn(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const p = decodeURIComponent(m[1]);
    if (/^Attachments\//.test(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

/** The MIME type to hand to a Blob when showing an attachment. */
export function mimeOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (
    { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml" }[ext] ??
    "application/octet-stream"
  );
}
