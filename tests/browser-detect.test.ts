import { describe, expect, it } from "vitest";
import { browserCandidates, findBrowser } from "../src/browser/detect.js";
import { BrowserNotFoundError } from "../src/errors.js";

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
  const linux = { platform: "linux" as const, env: { PATH: "/usr/bin" } };

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

  it("throws BrowserNotFoundError when nothing is installed", () => {
    expect(() => findBrowser(undefined, { ...linux, exists: () => false })).toThrow(
      BrowserNotFoundError,
    );
  });
});
