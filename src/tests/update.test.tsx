// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { JsonFetcher, checkForUpdate, isNewer, issueUrl, latestRelease, parseVersion } from "../lib/update";
import { AboutPanel } from "../ui/AboutPanel";
import { Update } from "../ui/Update";
import { NavProvider } from "../nav";
import { PrefsProvider } from "../prefs";

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

describe("the update screen", () => {
  const wrap = ({ children }: { children: ReactNode }) => (
    <PrefsProvider><NavProvider>{children}</NavProvider></PrefsProvider>
  );

  it("answers without being asked, and offers the download when there is one", async () => {
    render(<Update fetcher={async () => json(release("v0.9.0"))} />, { wrapper: wrap });
    // the check runs on open: by the time the card is readable the answer is there
    expect(await screen.findByText(/A newer version is available/)).toBeTruthy();
    expect(screen.getByText("0.9.0")).toBeTruthy();
    expect(screen.getByText(/What’s new in 0\.9\.0/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download the APK" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Release page" })).toBeTruthy();
  });

  it("says the build is current, with no download offered", async () => {
    render(<Update fetcher={async () => json(release("v0.0.1"))} />, { wrapper: wrap });
    expect(await screen.findByText(/You are on the latest version/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download the APK" })).toBeNull();
  });

  it("says so when GitHub cannot be reached, and can try again", async () => {
    render(<Update fetcher={async () => boom} />, { wrapper: wrap });
    expect(await screen.findByText(/Could not check/)).toBeTruthy();
    expect(screen.getByText(/offline/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });
});

describe("the About panel", () => {
  it("shows the version, the author, the repository and the licences, and opens the update screen", () => {
    render(<AboutPanel />, { wrapper: ({ children }: { children: ReactNode }) => <PrefsProvider><NavProvider>{children}</NavProvider></PrefsProvider> });
    expect(screen.getByText(/^Atonacht \d+\.\d+\.\d+$/)).toBeTruthy();
    expect(screen.getByText("Made by Pham-Noah")).toBeTruthy();
    expect(screen.getByText("Atonacht on GitHub")).toBeTruthy();
    expect(screen.getByText("Report a problem")).toBeTruthy();

    // licences are folded away until asked for
    expect(screen.queryByText("CodeMirror 6 and Lezer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("CodeMirror 6 and Lezer")).toBeTruthy();
    expect(screen.getAllByText("SIL Open Font License 1.1").length).toBe(2); // Inter and Fraunces

    // the check itself lives on its own screen now
    expect(screen.queryByRole("button", { name: "Check now" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
  });
});
