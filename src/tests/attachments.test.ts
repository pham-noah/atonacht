import { describe, expect, it, vi } from "vitest";
import { attachmentMarkdown, attachmentName, attachmentPath, attachmentsIn, isImage, mimeOf } from "../lib/attachments";

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
