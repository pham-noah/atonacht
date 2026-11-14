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

/** The long edge a big photo is written at. A 12 MP phone photo is 4032 px wide; 2000 is still sharp in a note. */
export const MAX_PHOTO_EDGE = 2000;
/** What a re-encoded photo is written at: at a note's width the difference is not visible, the bytes are. */
export const PHOTO_QUALITY = 0.85;

/** The format a picture is re-encoded in, or null when it is written exactly as it arrived. */
export function photoType(name: string, type = ""): "image/jpeg" | "image/webp" | null {
  if (/^image\/(jpeg|webp)$/i.test(type)) return type.toLowerCase() as "image/jpeg" | "image/webp";
  if (/^image\//i.test(type)) return null; // the browser named a format we do not re-encode: png keeps its alpha, svg is text
  return /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.webp$/i.test(name) ? "image/webp" : null;
}

/** The extension a photo of this type has to carry, so the link written into the note is not a lie. */
export const photoExt = (type: string) => (/webp/i.test(type) ? "webp" : "jpg");

/** `image.png` holding JPEG bytes — which is what a clipboard often hands over — is written as `image.jpg`. */
export function photoName(name: string, type = ""): string {
  const t = photoType(name, type);
  if (!t) return name;
  if (t === "image/webp" ? /\.webp$/i.test(name) : /\.jpe?g$/i.test(name)) return name;
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${photoExt(t)}`;
}

/** The size a picture is written at: the long edge capped, never enlarged. */
export function fitWithin(width: number, height: number, maxEdge = MAX_PHOTO_EDGE): { width: number; height: number; scaled: boolean } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height, scaled: false };
  const k = maxEdge / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

/** What a redraw needs from the browser: how big the picture is, and the same picture drawn again smaller. */
export interface Raster {
  size(bytes: Uint8Array, type: string): Promise<{ width: number; height: number }>;
  redraw(bytes: Uint8Array, width: number, height: number, opts: { type: string; quality: number }): Promise<Uint8Array>;
}

/** A Blob over the bytes without copying them (TypeScript 5.9 types the buffer as ArrayBufferLike). */
const blobOf = (bytes: Uint8Array) => new Blob([bytes as unknown as ArrayBufferView<ArrayBuffer>]);

/** The browser's own canvas — the only part of the resize that needs a browser. */
export const canvasRaster: Raster = {
  async size(bytes) {
    const bmp = await createImageBitmap(blobOf(bytes));
    try {
      return { width: bmp.width, height: bmp.height };
    } finally {
      bmp.close();
    }
  },
  async redraw(bytes, width, height, { type, quality }) {
    const bmp = await createImageBitmap(blobOf(bytes));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, width, height);
    bmp.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, quality));
    if (!blob) throw new Error("the canvas gave nothing back");
    return new Uint8Array(await blob.arrayBuffer());
  },
};

export interface Written {
  bytes: Uint8Array;
  scaled: boolean;
  width?: number;
  height?: number;
}

/**
 * The bytes to write for a picked or pasted picture. A JPEG/WebP whose long edge is over `maxEdge` is drawn again at
 * that edge with PHOTO_QUALITY; PNG (which keeps its alpha channel), GIF, SVG and AVIF are left alone, as is a
 * picture that is already small. Anything that goes wrong — a decode the browser refuses, an encode that comes back
 * bigger than the original — keeps the original bytes, because a note must never lose its picture to a resize.
 */
export async function shrinkPhoto(
  file: { name: string; type?: string; bytes: Uint8Array },
  raster: Raster = canvasRaster,
  maxEdge = MAX_PHOTO_EDGE,
): Promise<Written> {
  const type = photoType(file.name, file.type);
  if (!type) return { bytes: file.bytes, scaled: false };
  try {
    const size = await raster.size(file.bytes, type);
    const fit = fitWithin(size.width, size.height, maxEdge);
    if (!fit.scaled) return { bytes: file.bytes, scaled: false, width: size.width, height: size.height };
    const smaller = await raster.redraw(file.bytes, fit.width, fit.height, { type, quality: PHOTO_QUALITY });
    if (smaller.byteLength >= file.bytes.byteLength) return { bytes: file.bytes, scaled: false, width: size.width, height: size.height };
    return { bytes: smaller, scaled: true, width: fit.width, height: fit.height };
  } catch {
    return { bytes: file.bytes, scaled: false };
  }
}
