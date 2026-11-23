// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  JsonFetcher,
  abiOf,
  assetAbi,
  checkForUpdate,
  chooseApk,
  formatBytes,
  isNewer,
  issueUrl,
  latestRelease,
  parseVersion,
} from "../lib/update";
import { ApkTools } from "../lib/apkUpdate";
import { AboutPanel } from "../ui/AboutPanel";
import { Update } from "../ui/Update";
import { NavProvider } from "../nav";
import { PrefsProvider } from "../prefs";

const json = (body: unknown, status = 200): JsonFetcher => async () => ({ ok: status < 400, status, json: async () => body });
const boom: JsonFetcher = async () => {
  throw new Error("offline");
};

const asset = (name: string, size = 20_000_000) => ({ name, size, browser_download_url: `https://example.com/${name}` });

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/pham-noah/atonacht/releases/tag/${tag}`,
  body: "Fixes and a nicer board.",
  assets: [
    { name: "notes.txt", size: 10, browser_download_url: "https://example.com/notes.txt" },
    // GitHub lists the 32-bit ARM build first, which is the one the update used to hand a 64-bit phone.
    asset("Atonacht-v0.9.0-arm.apk", 16_769_977),
    asset("Atonacht-v0.9.0-arm64.apk", 21_304_247),
    asset("Atonacht-v0.9.0-x86_64.apk", 21_029_812),
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
  it("picks the version, page, notes and the APK that fits this device out of GitHub's answer", async () => {
    const r = await latestRelease(json(release("v0.2.0")), undefined, "aarch64");
    expect(r.version).toBe("0.2.0");
    expect(r.url).toContain("releases/tag/v0.2.0");
    expect(r.notes).toContain("nicer board");
    // the .txt is not the app, and the 32-bit build is not this phone's app either
    expect(r.apkName).toBe("Atonacht-v0.9.0-arm64.apk");
    expect(r.apk).toBe("https://example.com/Atonacht-v0.9.0-arm64.apk");
    expect(r.apkSize).toBe(21_304_247);
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

describe("which APK a device is offered", () => {
  const apk = (name: string, size = 20_000_000) => ({ name, url: `https://example.com/${name}`, size });
  const assets = [
    apk("Atonacht-v0.9.0-arm.apk", 16_769_977),
    apk("Atonacht-v0.9.0-arm64.apk", 21_304_247),
    apk("Atonacht-v0.9.0-x86.apk", 20_693_937),
    apk("Atonacht-v0.9.0-x86_64.apk", 21_029_812),
  ];

  it("reads the architecture the build reports", () => {
    expect(abiOf("aarch64")).toBe("arm64");
    expect(abiOf("arm64-v8a")).toBe("arm64");
    expect(abiOf("armv7")).toBe("arm");
    expect(abiOf("x86_64")).toBe("x86_64");
    expect(abiOf("x86")).toBe("x86");
    expect(abiOf("wasm32")).toBeUndefined();
  });

  it("reads the ABI out of an asset name, longest first", () => {
    expect(assetAbi("Atonacht-v0.9.0-arm64.apk")).toBe("arm64");
    expect(assetAbi("Atonacht-v0.9.0-arm.apk")).toBe("arm");
    expect(assetAbi("Atonacht-v0.9.0-x86_64.apk")).toBe("x86_64");
    expect(assetAbi("Atonacht-v0.9.0-x86.apk")).toBe("x86");
    expect(assetAbi("Atonacht-setup.exe")).toBeUndefined();
  });

  it("never hands a 64-bit phone the 32-bit build, even though GitHub lists it first", () => {
    expect(chooseApk(assets, "aarch64")?.name).toBe("Atonacht-v0.9.0-arm64.apk");
    expect(chooseApk(assets, "armv7")?.name).toBe("Atonacht-v0.9.0-arm.apk");
    expect(chooseApk(assets, "x86_64")?.name).toBe("Atonacht-v0.9.0-x86_64.apk");
  });

  it("takes the 64-bit build when nothing said what the device is, and never nothing at all", () => {
    expect(chooseApk(assets)?.name).toBe("Atonacht-v0.9.0-arm64.apk");
    // a release with only one APK still offers it
    expect(chooseApk([apk("Atonacht.apk")], "aarch64")?.name).toBe("Atonacht.apk");
    // a release with no APK at all offers none
    expect(chooseApk([apk("notes.txt", 1)])).toBeUndefined();
  });

  it("writes a size the way a download badge wants it", () => {
    expect(formatBytes(21_304_247)).toBe("20.3 MB");
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(0)).toBe("0 MB");
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

  it("answers without being asked, and on a computer offers the release page instead of an APK", async () => {
    render(<Update fetcher={async () => json(release("v0.9.0"))} />, { wrapper: wrap });
    // the check runs on open: by the time the card is readable the answer is there
    expect(await screen.findByText(/A newer version is available/)).toBeTruthy();
    expect(screen.getByText("0.9.0")).toBeTruthy();
    expect(screen.getByText(/What’s new in 0\.9\.0/)).toBeTruthy();
    // a desktop cannot install an APK, so it must not be offered one
    expect(screen.getByRole("button", { name: "Open the release page" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });

  it("says the build is current, with no download offered", async () => {
    render(<Update fetcher={async () => json(release("v0.0.1"))} />, { wrapper: wrap });
    expect(await screen.findByText(/You are on the latest version/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });

  it("says so when GitHub cannot be reached, and can try again", async () => {
    render(<Update fetcher={async () => boom} />, { wrapper: wrap });
    expect(await screen.findByText(/Could not check/)).toBeTruthy();
    expect(screen.getByText(/offline/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });
});

describe("the download on a phone", () => {
  const wrap = ({ children }: { children: ReactNode }) => (
    <PrefsProvider><NavProvider>{children}</NavProvider></PrefsProvider>
  );
  const originalUA = window.navigator.userAgent;
  const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
  const onAndroid = () => {
    // the two things that make this the Android build rather than the browser demo
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    Object.defineProperty(window.navigator, "userAgent", { value: ANDROID_UA, configurable: true });
  };
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    Object.defineProperty(window.navigator, "userAgent", { value: originalUA, configurable: true });
  });

  it("downloads the APK for this phone inside the app, and hands it to Android's installer", async () => {
    onAndroid();
    const path = "/data/user/0/app.atonacht.notes/cache/updates/Atonacht-v0.9.0-arm64.apk";
    let finish: (p: string) => void = () => {};
    const download = vi.fn((_u: string, _n: string, _s: number, moved: (p: { done: number; total: number }) => void) => {
      moved({ done: 5_326_061, total: 21_304_247 });
      return new Promise<string>((resolve) => { finish = resolve; });
    });
    const install = vi.fn(async () => {});
    const tools: ApkTools = { arch: async () => "aarch64", download, install };

    render(<Update fetcher={async () => json(release("v0.9.0"))} tools={tools} />, { wrapper: wrap });
    fireEvent.click(await screen.findByRole("button", { name: "Download and install" }));

    // the 64-bit build, by name and by size: the bug this replaces fetched the 32-bit one
    await waitFor(() => expect(download).toHaveBeenCalled());
    const [url, name, size] = download.mock.calls[0];
    expect(url).toBe("https://example.com/Atonacht-v0.9.0-arm64.apk");
    expect(name).toBe("Atonacht-v0.9.0-arm64.apk");
    expect(size).toBe(21_304_247);

    // the bar is the progress: a quarter of the bytes, said twice over (bar and text)
    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(screen.getByText("5.1 MB of 20.3 MB · 25%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download and install" })).toBeNull();

    await act(async () => { finish(path); });

    fireEvent.click(await screen.findByRole("button", { name: "Install update" }));
    await waitFor(() => expect(install).toHaveBeenCalledWith(path));
    // the browser is not involved anywhere in this: no openUrl, and the page still has its own button
    expect(screen.getByRole("button", { name: "Release page" })).toBeTruthy();
  });

  it("shows why a download failed and offers it again, rather than pointing the installer at a half file", async () => {
    onAndroid();
    const download = vi.fn(async () => {
      throw new Error("The download stopped at 1024 of 21304247 bytes, so it was thrown away.");
    });
    const install = vi.fn(async () => {});
    const tools: ApkTools = { arch: async () => "aarch64", download, install };

    render(<Update fetcher={async () => json(release("v0.9.0"))} tools={tools} />, { wrapper: wrap });
    fireEvent.click(await screen.findByRole("button", { name: "Download and install" }));

    expect(await screen.findByText(/so it was thrown away/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Install update" })).toBeNull();
    expect(install).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
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
