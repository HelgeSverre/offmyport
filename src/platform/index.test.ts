import { describe, it, expect, vi, afterEach } from "vitest";
import { getAdapter } from "./index.js";
import { UnixAdapter } from "./unix.js";
import { WindowsAdapter } from "./windows.js";

describe("getAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns UnixAdapter for darwin (macOS)", () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });

    const adapter = getAdapter();

    expect(adapter).toBeInstanceOf(UnixAdapter);
  });

  it("returns UnixAdapter for linux", () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });

    const adapter = getAdapter();

    expect(adapter).toBeInstanceOf(UnixAdapter);
  });

  it("returns WindowsAdapter for win32", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });

    const adapter = getAdapter();

    expect(adapter).toBeInstanceOf(WindowsAdapter);
  });

  it("returns UnixAdapter for freebsd", () => {
    vi.stubGlobal("process", { ...process, platform: "freebsd" });

    const adapter = getAdapter();

    expect(adapter).toBeInstanceOf(UnixAdapter);
  });

  it("returns UnixAdapter for openbsd", () => {
    vi.stubGlobal("process", { ...process, platform: "openbsd" });

    const adapter = getAdapter();

    expect(adapter).toBeInstanceOf(UnixAdapter);
  });
});
