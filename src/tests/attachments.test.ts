import { describe, expect, it, vi } from "vitest";
import {
  attachmentMarkdown,
  attachmentName,
  attachmentPath,
  attachmentsIn,
  fitWithin,
  isImage,
  MAX_PHOTO_EDGE,
  mimeOf,
  PHOTO_QUALITY,
  photoName,
  shrinkPhoto,
} from "../lib/attachments";

describe("naming an attachment", () => {
  it("puts the date and time in front so the folder sorts by when it arrived", () => {
    const name = attachmentName("Screenshot 2026-11-05 at 14.22.33.png", new Date(2026, 10, 5, 14, 22, 33));
    expect(name).toBe("2026-11-05-142233-screenshot-2026-11-05-at-14-22-33.png"); // dots in the name become dashes
    expect(attachmentPath(name)).toBe(`Attachments/${name}`);
  });

  it("keeps the extension, survives odd names, and never produces an empty base", () => {
    expect(attachmentName("###.PNG", new Date(2026, 0, 2, 3, 4, 5))).toBe("2026-01-02-030405-attachment.png");
    expect(attachmentName("no-extension", new Date(2026, 0, 2, 3, 4, 5))).toBe("2026-01-02-030405-no-extension.bin");
  });
});

describe("writing the link into a note", () => {
  it("shows pictures inline and links everything else", () => {
    expect(attachmentMarkdown("Attachments/a.png", "a")).toBe("![a](Attachments/a.png)");
    expect(attachmentMarkdown("Attachments/report.pdf")).toBe("[report.pdf](Attachments/report.pdf)");
  });

  it("encodes spaces so the link does not break at the first one", () => {
    expect(attachmentMarkdown("Attachments/my photo.jpg", "my photo")).toBe("![my photo](Attachments/my%20photo.jpg)");
  });

  it("finds the attachments a note refers to, decoding the names", () => {
    const note = "![x](Attachments/my%20photo.jpg)\n[pdf](Attachments/report.pdf)\n![out](https://example.com/a.png)";
    expect(attachmentsIn(note)).toEqual(["Attachments/my photo.jpg", "Attachments/report.pdf"]);
  });

  it("knows which extensions are pictures, and the type to hand a Blob", () => {
    expect(isImage("a.PNG")).toBe(true);
    expect(isImage("a.pdf")).toBe(false);
    expect(mimeOf("a.webp")).toBe("image/webp");
    expect(mimeOf("a.bin")).toBe("application/octet-stream");
  });
});

describe("the folder layer carries bytes", () => {
  it("stores and returns them through the demo backend", async () => {
    vi.resetModules();
    const { createMemFs } = await import("../lib/memFs");
    const mem = createMemFs({ dirs: [], files: {} });
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
    await mem.writeBytes!("demo", "Attachments/x.png", bytes);
    const back = await mem.readBytes!("demo", "Attachments/x.png");
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });
});

/** A fake bitmap: `width x height` pixels, redrawn to ~0.1 byte per pixel so the byte count follows the pixels. */
function fakeRaster(width: number, height: number, drawn: { width: number; height: number; type: string; quality: number }[]) {
  return {
    size: async () => ({ width, height }),
    redraw: async (_bytes: Uint8Array, w: number, h: number, opts: { type: string; quality: number }) => {
      drawn.push({ width: w, height: h, ...opts });
      return new Uint8Array(Math.round(w * h * 0.1));
    },
  };
}

describe("a big photo is written smaller", () => {
  it("caps a 12 MP photo's long edge at 2000 px and writes fewer bytes than arrived", async () => {
    const drawn: { width: number; height: number; type: string; quality: number }[] = [];
    const original = new Uint8Array(4_000_000);
    const out = await shrinkPhoto({ name: "IMG_4021.JPG", bytes: original }, fakeRaster(4032, 3024, drawn));

    expect(drawn).toEqual([{ width: 2000, height: 1500, type: "image/jpeg", quality: PHOTO_QUALITY }]);
    expect(out).toMatchObject({ scaled: true, width: 2000, height: 1500 });
    expect(out.bytes.byteLength).toBeLessThan(original.byteLength);
    expect(2000 * 1500).toBeLessThan(4032 * 3024); // 3 MP written instead of 12 MP
  });

  it("keeps a portrait photo's long edge capped too", async () => {
    const drawn: { width: number; height: number; type: string; quality: number }[] = [];
    const out = await shrinkPhoto({ name: "portrait.webp", bytes: new Uint8Array(900_000) }, fakeRaster(3024, 4032, drawn));
    expect(drawn[0]).toMatchObject({ width: 1500, height: 2000, type: "image/webp" });
    expect(out.scaled).toBe(true);
  });

  it("leaves a picture that is already inside the cap completely alone", async () => {
    const drawn: { width: number; height: number; type: string; quality: number }[] = [];
    const bytes = new Uint8Array([1, 2, 3]);
    const out = await shrinkPhoto({ name: "small.jpg", bytes }, fakeRaster(1600, 1200, drawn));
    expect(drawn).toEqual([]); // never even decoded
    expect(out).toEqual({ bytes, scaled: false, width: 1600, height: 1200 });
  });

  it("does not touch a PNG, so its transparency survives", async () => {
    const drawn: { width: number; height: number; type: string; quality: number }[] = [];
    const bytes = new Uint8Array(5_000_000);
    const out = await shrinkPhoto({ name: "screenshot.png", type: "image/png", bytes }, fakeRaster(4032, 3024, drawn));
    expect(drawn).toEqual([]);
    expect(out.bytes).toBe(bytes); // the very same bytes, not a copy
    expect(out.scaled).toBe(false);
  });

  it("keeps the original when the re-encode comes back bigger, or when the picture cannot be read", async () => {
    const bytes = new Uint8Array(1000);
    const bigger = { size: async () => ({ width: 4032, height: 3024 }), redraw: async () => new Uint8Array(9999) };
    expect((await shrinkPhoto({ name: "a.jpg", bytes }, bigger)).bytes).toBe(bytes);

    const broken = {
      size: async () => {
        throw new Error("not an image");
      },
      redraw: async () => new Uint8Array(1),
    };
    expect(await shrinkPhoto({ name: "b.jpg", bytes }, broken)).toEqual({ bytes, scaled: false });
  });

  it("does the arithmetic without enlarging anything", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2000, height: 1500, scaled: true });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000, scaled: true });
    expect(fitWithin(1000, 800)).toEqual({ width: 1000, height: 800, scaled: false });
    expect(fitWithin(1, 9000).height).toBe(MAX_PHOTO_EDGE);
    expect(fitWithin(1, 9000).width).toBe(1); // never rounds a side away to nothing
  });

  it("names a JPEG that arrived as image.png by what it really is", () => {
    expect(photoName("image.png", "image/jpeg")).toBe("image.jpg"); // what a clipboard hands over
    expect(photoName("photo.JPG", "image/jpeg")).toBe("photo.JPG"); // already honest
    expect(photoName("shot.png", "image/png")).toBe("shot.png");
    expect(photoName("clip.webp")).toBe("clip.webp");
  });
});
