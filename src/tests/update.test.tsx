// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JsonFetcher, checkForUpdate, isNewer, issueUrl, latestRelease, parseVersion } from "../lib/update";
import { AboutPanel } from "../ui/AboutPanel";

const json = (body: unknown, status = 200): JsonFetcher => async () => ({ ok: status < 400, status, json: async () => body });
const boom: JsonFetcher = async () => {
  throw new Error("offline");
};

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/pham-noah/atonacht/releases/tag/${tag}`,
  body: "Fixes and a nicer board.",
  assets: [
    { name: "notes.txt", browser_download_url: "https://example.com/notes.txt" },
    { name: "Atonacht.apk", browser_download_url: "https://example.com/Atonacht.apk" },
  ],
  ...extra,
});

afterEach(cleanup);

describe("version comparison", () => {
  it("reads tags with or without a v, and pads missing parts", () => {
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("0.4")).toEqual([0, 4, 0]);
    expect(parseVersion("nonsense")).toEqual([0, 0, 0]);
  });
  it("knows which side is newer", () => {
    expect(isNewer("0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("0.1.10", "0.1.9")).toBe(true);
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
  });
});

describe("the release check", () => {
  it("picks the version, page, notes and APK out of GitHub's answer", async () => {
    const r = await latestRelease(json(release("v0.2.0")));
    expect(r.version).toBe("0.2.0");
    expect(r.url).toContain("releases/tag/v0.2.0");
    expect(r.notes).toContain("nicer board");
    expect(r.apk).toBe("https://example.com/Atonacht.apk"); // the .txt is not the app
  });
  it("says the build is current when the release is not newer", async () => {
    expect(await checkForUpdate(json(release("v0.1.0")), "0.1.0")).toEqual({ kind: "current", version: "0.1.0" });
    expect((await checkForUpdate(json(release("v0.0.9")), "0.1.0")).kind).toBe("current");
  });
  it("reports a newer release with its download", async () => {
    const s = await checkForUpdate(json(release("v1.0.0")), "0.1.0");
    expect(s.kind).toBe("available");
    if (s.kind === "available") expect(s.release.apk).toContain(".apk");
  });
  it("turns a missing release or a dead network into a message, never a crash", async () => {
    expect(await checkForUpdate(json({ message: "Not Found" }, 404), "0.1.0")).toEqual({ kind: "failed", message: "No release has been published yet." });
    expect(await checkForUpdate(json({}, 500), "0.1.0")).toEqual({ kind: "failed", message: "GitHub answered 500." });
    expect(await checkForUpdate(boom, "0.1.0")).toEqual({ kind: "failed", message: "offline" });
  });
});

describe("reporting a problem", () => {
  it("prefills the issue with the version and platform", () => {
    const url = issueUrl("Android", "0.1.0");
    expect(url.startsWith("https://github.com/pham-noah/atonacht/issues/new")).toBe(true);
    expect(decodeURIComponent(url)).toContain("Atonacht 0.1.0 · Android");
    expect(url).toContain("labels=bug");
  });
});

describe("the About panel", () => {
  it("shows the version, the author, the repository, licences and the update answer", async () => {
    const fetcher = async () => json(release("v0.9.0"));
    render(<AboutPanel fetcher={fetcher} />);
    expect(screen.getByText(/^Atonacht \d+\.\d+\.\d+$/)).toBeTruthy();
    expect(screen.getByText("Made by Pham-Noah")).toBeTruthy();
    expect(screen.getByText("Atonacht on GitHub")).toBeTruthy();
    expect(screen.getByText("Report a problem")).toBeTruthy();

    // licences are folded away until asked for
    expect(screen.queryByText("CodeMirror 6 and Lezer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("CodeMirror 6 and Lezer")).toBeTruthy();
    expect(screen.getAllByText("SIL Open Font License 1.1").length).toBe(2); // Inter and Fraunces

    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(screen.getByText(/Version 0\.9\.0 is available/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Download APK" })).toBeTruthy();
  });

  it("says so when it cannot reach GitHub", async () => {
    render(<AboutPanel fetcher={async () => boom} />);
    fireEvent.click(screen.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(screen.getByText(/Could not check: offline/)).toBeTruthy());
  });
});
