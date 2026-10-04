import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { browserCandidates, findBrowser } from "../src/browser/detect.js";
import { BrowserNotFoundError } from "../src/errors.js";
import { cacheDir, installedBrowser, RECORD_FILE } from "../src/browser/cache.js";
import { tempDir } from "./helpers.js";
import { setup } from "../src/browser/setup.js";
import { shouldRetryWithoutSandbox } from "../src/render/browser.js";
import { ExitCode } from "../src/exit-codes.js";

describe("browserCandidates", () => {
  it("lists Chrome before Edge in Program Files and LOCALAPPDATA on Windows", () => {
    const env = {
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: "C:\\Users\\yo\\AppData\\Local",
    };
    const list = browserCandidates("win32", env);
    expect(list[0]).toBe("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    expect(list).toContain("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(list).toContain(
      "C:\\Users\\yo\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    );
    const chrome = list.findIndex((p) => p.endsWith("chrome.exe"));
    const edge = list.findIndex((p) => p.endsWith("msedge.exe"));
    expect(chrome).toBeLessThan(edge);
  });

  it("reads Windows env variables case-insensitively", () => {
    const list = browserCandidates("win32", { PROGRAMFILES: "D:\\Apps" });
    expect(list).toContain("D:\\Apps\\Microsoft\\Edge\\Application\\msedge.exe");
  });

  it("searches PATH and well-known locations on Linux", () => {
    const list = browserCandidates("linux", { PATH: "/usr/local/bin:/usr/bin" });
    expect(list).toContain("/usr/bin/google-chrome");
    expect(list).toContain("/usr/local/bin/chromium");
    expect(list).toContain("/usr/bin/microsoft-edge");
    expect(list).toContain("/snap/bin/chromium");
    expect(new Set(list).size).toBe(list.length);
  });
});

describe("findBrowser", () => {
  const linux = {
    platform: "linux" as const,
    env: { PATH: "/usr/bin" },
    downloaded: () => undefined,
  };

  it("returns the first existing candidate", () => {
    const exists = (f: string) => f === "/usr/bin/chromium";
    expect(findBrowser(undefined, { ...linux, exists })).toBe("/usr/bin/chromium");
  });

  it("prefers an explicit path, then MDRENDER_BROWSER", () => {
    const exists = () => true;
    expect(findBrowser("/x/chrome", { ...linux, exists })).toBe("/x/chrome");
    const env = { ...linux.env, MDRENDER_BROWSER: "/y/edge" };
    expect(findBrowser(undefined, { ...linux, env, exists })).toBe("/y/edge");
  });

  it("fails when an explicit path does not exist instead of falling back", () => {
    const exists = (f: string) => f === "/usr/bin/chromium";
    expect(() => findBrowser("/nope", { ...linux, exists })).toThrow(/--browser/);
  });

  it("falls back to the browser downloaded by mdrender setup", () => {
    const options = {
      ...linux,
      exists: () => false,
      downloaded: () => "/cache/chrome-headless-shell",
    };
    expect(findBrowser(undefined, options)).toBe("/cache/chrome-headless-shell");
  });

  it("throws BrowserNotFoundError when nothing is installed", () => {
    expect(() => findBrowser(undefined, { ...linux, exists: () => false })).toThrow(
      BrowserNotFoundError,
    );
  });
});

describe("cacheDir", () => {
  it("follows each platform's convention and MDRENDER_CACHE_DIR", () => {
    expect(
      cacheDir({ LOCALAPPDATA: "C:\\Users\\yo\\AppData\\Local" }, "win32", "C:\\Users\\yo"),
    ).toBe("C:\\Users\\yo\\AppData\\Local\\mdrender");
    expect(cacheDir({}, "linux", "/home/yo")).toBe("/home/yo/.cache/mdrender");
    expect(cacheDir({ XDG_CACHE_HOME: "/xdg" }, "linux", "/home/yo")).toBe("/xdg/mdrender");
    expect(cacheDir({}, "darwin", "/Users/yo")).toBe("/Users/yo/Library/Caches/mdrender");
    expect(cacheDir({ MDRENDER_CACHE_DIR: "/tmp/x" }, "linux", "/home/yo")).toBe(
      path.resolve("/tmp/x"),
    );
  });

  it("reads the record written by setup, ignoring missing browsers", () => {
    const dir = tempDir();
    expect(installedBrowser(dir)).toBeUndefined();
    const exe = path.join(dir, "chrome");
    writeFileSync(exe, "");
    writeFileSync(path.join(dir, RECORD_FILE), JSON.stringify({ executablePath: exe }));
    expect(installedBrowser(dir)).toBe(exe);
    writeFileSync(path.join(dir, RECORD_FILE), JSON.stringify({ executablePath: exe + "x" }));
    expect(installedBrowser(dir)).toBeUndefined();
  });
});

describe("mdrender setup", () => {
  it("does not download when a browser is already available", async () => {
    const exe = path.join(tempDir(), "chrome");
    writeFileSync(exe, "");
    const previous = process.env.MDRENDER_BROWSER;
    process.env.MDRENDER_BROWSER = exe;
    try {
      let out = "";
      let err = "";
      const code = await setup({ io: { out: (t) => (out += t), err: (t) => (err += t) } });
      expect(code).toBe(ExitCode.Ok);
      expect(out.trim()).toBe(exe);
      expect(err).toContain("No download needed");
    } finally {
      if (previous === undefined) delete process.env.MDRENDER_BROWSER;
      else process.env.MDRENDER_BROWSER = previous;
    }
  });
});

describe("shouldRetryWithoutSandbox", () => {
  const sandboxError = new Error(
    "Failed to launch: FATAL ... No usable sandbox! If you are on Ubuntu",
  );

  it("retries on Linux when the sandbox is blocked", () => {
    expect(shouldRetryWithoutSandbox(sandboxError, ["--disable-gpu"], "linux")).toBe(true);
  });

  it("does not retry other errors, other platforms, or when already unsandboxed", () => {
    expect(shouldRetryWithoutSandbox(new Error("ENOENT"), [], "linux")).toBe(false);
    expect(shouldRetryWithoutSandbox(sandboxError, [], "win32")).toBe(false);
    expect(shouldRetryWithoutSandbox(sandboxError, ["--no-sandbox"], "linux")).toBe(false);
  });
});
