import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseArgs,
  parsePorts,
  getPageSize,
  setupQuitHandler,
  toJsonOutput,
  handleKillMode,
  type CliFlags,
  type ProcessJsonOutput,
} from "./index.js";
import type { ProcessInfo, ProcessMetadata } from "./platform/index.js";

describe("parseArgs", () => {
  // Helper to simulate argv (bun, script path, then args)
  const argv = (...args: string[]) => ["bun", "script.ts", ...args];

  describe("port parsing", () => {
    it("returns null ports when no arguments provided", () => {
      const result = parseArgs(argv());
      expect(result.ports).toBeNull();
    });

    it("parses single port argument", () => {
      const result = parseArgs(argv("3000"));
      expect(result.ports).toBe("3000");
    });

    it("parses port with comma-separated values", () => {
      const result = parseArgs(argv("80,443,8080"));
      expect(result.ports).toBe("80,443,8080");
    });

    it("parses port range", () => {
      const result = parseArgs(argv("3000-3005"));
      expect(result.ports).toBe("3000-3005");
    });

    it("parses mixed ports and ranges", () => {
      const result = parseArgs(argv("80,443,3000-3005"));
      expect(result.ports).toBe("80,443,3000-3005");
    });
  });

  describe("--kill flag", () => {
    it("defaults kill to false", () => {
      const result = parseArgs(argv("3000"));
      expect(result.kill).toBe(false);
    });

    it("parses --kill flag", () => {
      const result = parseArgs(argv("3000", "--kill"));
      expect(result.kill).toBe(true);
    });

    it("parses -k shorthand", () => {
      const result = parseArgs(argv("3000", "-k"));
      expect(result.kill).toBe(true);
    });

    it("parses --kill before port", () => {
      const result = parseArgs(argv("--kill", "3000"));
      expect(result.kill).toBe(true);
      expect(result.ports).toBe("3000");
    });

    it("parses --kill with port range", () => {
      const result = parseArgs(argv("3000-3005", "--kill"));
      expect(result.kill).toBe(true);
      expect(result.ports).toBe("3000-3005");
    });

    it("parses --kill with mixed ports and ranges", () => {
      const result = parseArgs(argv("80,443,3000-3005", "-k", "-f"));
      expect(result.kill).toBe(true);
      expect(result.force).toBe(true);
      expect(result.ports).toBe("80,443,3000-3005");
    });
  });

  describe("--force flag", () => {
    it("defaults force to false", () => {
      const result = parseArgs(argv("3000"));
      expect(result.force).toBe(false);
    });

    it("parses --force flag", () => {
      const result = parseArgs(argv("3000", "--force"));
      expect(result.force).toBe(true);
    });

    it("parses -f shorthand", () => {
      const result = parseArgs(argv("3000", "-f"));
      expect(result.force).toBe(true);
    });
  });

  describe("--murder flag", () => {
    it("defaults murder to false", () => {
      const result = parseArgs(argv("3000"));
      expect(result.murder).toBe(false);
    });

    it("parses --murder flag", () => {
      const result = parseArgs(argv("3000", "--murder"));
      expect(result.murder).toBe(true);
    });

    it("--murder implies --kill", () => {
      const result = parseArgs(argv("3000", "--murder"));
      expect(result.kill).toBe(true);
    });

    it("--murder implies --force", () => {
      const result = parseArgs(argv("3000", "--murder"));
      expect(result.force).toBe(true);
    });
  });

  describe("flag combinations", () => {
    it("parses --kill --force together", () => {
      const result = parseArgs(argv("3000", "--kill", "--force"));
      expect(result.kill).toBe(true);
      expect(result.force).toBe(true);
      expect(result.murder).toBe(false);
    });

    it("parses -k -f shorthands together", () => {
      const result = parseArgs(argv("3000", "-k", "-f"));
      expect(result.kill).toBe(true);
      expect(result.force).toBe(true);
    });

    it("handles mixed order: --force port -k", () => {
      const result = parseArgs(argv("--force", "3000", "-k"));
      expect(result.ports).toBe("3000");
      expect(result.kill).toBe(true);
      expect(result.force).toBe(true);
    });

    it("handles all flags: port --kill --force --murder", () => {
      const result = parseArgs(argv("3000", "--kill", "--force", "--murder"));
      expect(result.ports).toBe("3000");
      expect(result.kill).toBe(true);
      expect(result.force).toBe(true);
      expect(result.murder).toBe(true);
    });
  });

  describe("unknown flags", () => {
    it("ignores unknown flags starting with -", () => {
      const result = parseArgs(argv("3000", "--unknown"));
      expect(result.ports).toBe("3000");
      expect(result.kill).toBe(false);
    });

    it("ignores unknown short flags", () => {
      const result = parseArgs(argv("3000", "-x"));
      expect(result.ports).toBe("3000");
    });
  });

  describe("--json flag", () => {
    it("defaults json to false", () => {
      const result = parseArgs(argv("3000"));
      expect(result.json).toBe(false);
    });

    it("parses --json flag", () => {
      const result = parseArgs(argv("3000", "--json"));
      expect(result.json).toBe(true);
    });

    it("--json works with other flags", () => {
      const result = parseArgs(argv("3000", "--json", "--kill"));
      expect(result.json).toBe(true);
      expect(result.kill).toBe(true);
    });

    it("--json works before port", () => {
      const result = parseArgs(argv("--json", "3000"));
      expect(result.json).toBe(true);
      expect(result.ports).toBe("3000");
    });

    it("--json works with mixed ports and ranges", () => {
      const result = parseArgs(argv("80,443,3000-3005", "--json"));
      expect(result.json).toBe(true);
      expect(result.ports).toBe("80,443,3000-3005");
    });
  });

  describe("edge cases", () => {
    it("handles empty argv (just bun and script)", () => {
      const result = parseArgs(argv());
      expect(result).toEqual({
        ports: null,
        kill: false,
        force: false,
        murder: false,
        json: false,
      });
    });

    it("uses first non-flag argument as ports", () => {
      // If multiple non-flag args provided, first one is used (meow behavior)
      const result = parseArgs(argv("3000", "4000"));
      expect(result.ports).toBe("3000");
    });
  });
});

describe("parsePorts", () => {
  let exitMock: ReturnType<typeof vi.spyOn>;
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock process.exit to throw instead of exiting
    exitMock = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    // Suppress console.error output during tests
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitMock.mockRestore();
    consoleErrorMock.mockRestore();
  });

  describe("valid inputs", () => {
    it("parses single port", () => {
      expect(parsePorts("3000")).toEqual([3000]);
    });

    it("parses comma-separated ports", () => {
      expect(parsePorts("80,443,8080")).toEqual([80, 443, 8080]);
    });

    it("parses port range (inclusive)", () => {
      expect(parsePorts("3000-3005")).toEqual([
        3000, 3001, 3002, 3003, 3004, 3005,
      ]);
    });

    it("parses mixed format (ports and ranges)", () => {
      expect(parsePorts("80,3000-3002,443")).toEqual([
        80, 443, 3000, 3001, 3002,
      ]);
    });

    it("handles whitespace around commas", () => {
      expect(parsePorts("80, 443, 8080")).toEqual([80, 443, 8080]);
    });

    it("handles whitespace around range dash", () => {
      expect(parsePorts("3000 - 3002")).toEqual([3000, 3001, 3002]);
    });

    it("deduplicates repeated ports", () => {
      expect(parsePorts("3000,3000,3000")).toEqual([3000]);
    });

    it("deduplicates overlapping ranges", () => {
      const result = parsePorts("3000-3005,3003-3008");
      expect(result).toEqual([
        3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008,
      ]);
    });

    it("sorts output in ascending order", () => {
      expect(parsePorts("8080,80,443")).toEqual([80, 443, 8080]);
    });

    it("accepts minimum valid port (1)", () => {
      expect(parsePorts("1")).toEqual([1]);
    });

    it("accepts maximum valid port (65535)", () => {
      expect(parsePorts("65535")).toEqual([65535]);
    });

    it("handles single element range (same start and end)", () => {
      expect(parsePorts("3000-3000")).toEqual([3000]);
    });

    it("handles complex mixed input", () => {
      const result = parsePorts("22,80,443,3000-3002,8080-8082,9000");
      expect(result).toEqual([
        22, 80, 443, 3000, 3001, 3002, 8080, 8081, 8082, 9000,
      ]);
    });
  });

  describe("invalid inputs - should exit with code 1", () => {
    it("rejects non-numeric port", () => {
      expect(() => parsePorts("abc")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith("Invalid port number: abc");
    });

    it("rejects port 0", () => {
      expect(() => parsePorts("0")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Port out of range (1-65535): 0",
      );
    });

    it("rejects port greater than 65535", () => {
      expect(() => parsePorts("70000")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Port out of range (1-65535): 70000",
      );
    });

    it("rejects reversed range (start > end)", () => {
      expect(() => parsePorts("3005-3000")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Invalid port range (start > end): 3005-3000",
      );
    });

    it("rejects non-numeric range start", () => {
      expect(() => parsePorts("abc-3000")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Invalid port range: abc-3000",
      );
    });

    it("rejects non-numeric range end", () => {
      expect(() => parsePorts("3000-abc")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Invalid port range: 3000-abc",
      );
    });

    it("rejects range with start below 1", () => {
      expect(() => parsePorts("0-100")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Port out of range (1-65535): 0-100",
      );
    });

    it("rejects range with end above 65535", () => {
      expect(() => parsePorts("65530-65540")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Port out of range (1-65535): 65530-65540",
      );
    });

    it("rejects invalid port in comma-separated list", () => {
      expect(() => parsePorts("80,abc,443")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith("Invalid port number: abc");
    });

    it("rejects out-of-range port in comma-separated list", () => {
      expect(() => parsePorts("80,70000,443")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Port out of range (1-65535): 70000",
      );
    });

    it("rejects negative port number", () => {
      expect(() => parsePorts("-80")).toThrow("process.exit(1)");
    });

    it("rejects decimal port number", () => {
      expect(() => parsePorts("3000.5")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Invalid port number: 3000.5",
      );
    });

    it("rejects decimal in port range", () => {
      expect(() => parsePorts("3000.5-3010")).toThrow("process.exit(1)");
      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Invalid port range: 3000.5-3010",
      );
    });
  });

  describe("edge cases", () => {
    it("handles empty segments (multiple commas)", () => {
      // "80,,443" should filter out empty string and parse correctly
      expect(parsePorts("80,,443")).toEqual([80, 443]);
    });

    it("handles trailing comma", () => {
      expect(parsePorts("80,443,")).toEqual([80, 443]);
    });

    it("handles leading comma", () => {
      expect(parsePorts(",80,443")).toEqual([80, 443]);
    });

    it("handles only commas (empty input)", () => {
      expect(parsePorts(",,,")).toEqual([]);
    });
  });
});

describe("getPageSize", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns half of terminal rows", () => {
    vi.stubGlobal("process", {
      ...process,
      stdout: { ...process.stdout, rows: 40 },
    });

    expect(getPageSize()).toBe(20);
  });

  it("returns minimum of 5 for small terminals", () => {
    vi.stubGlobal("process", {
      ...process,
      stdout: { ...process.stdout, rows: 6 },
    });

    expect(getPageSize()).toBe(5);
  });

  it("caps at maximum of 20 for large terminals", () => {
    vi.stubGlobal("process", {
      ...process,
      stdout: { ...process.stdout, rows: 100 },
    });

    expect(getPageSize()).toBe(20);
  });

  it("uses default of 24 rows when stdout.rows is undefined", () => {
    vi.stubGlobal("process", {
      ...process,
      stdout: { ...process.stdout, rows: undefined },
    });

    expect(getPageSize()).toBe(12); // floor(24/2) = 12
  });

  it("uses default of 24 rows when stdout.rows is 0", () => {
    vi.stubGlobal("process", {
      ...process,
      stdout: { ...process.stdout, rows: 0 },
    });

    expect(getPageSize()).toBe(12); // floor(24/2) = 12
  });
});

describe("setupQuitHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cleanup function and AbortController", () => {
    vi.stubGlobal("process", {
      ...process,
      stdin: { ...process.stdin, isTTY: false },
    });

    const result = setupQuitHandler();

    expect(result).toHaveProperty("cleanup");
    expect(result).toHaveProperty("controller");
    expect(typeof result.cleanup).toBe("function");
    expect(result.controller).toBeInstanceOf(AbortController);
  });

  it("returns no-op cleanup when not TTY", () => {
    vi.stubGlobal("process", {
      ...process,
      stdin: { ...process.stdin, isTTY: false },
    });

    const { cleanup } = setupQuitHandler();

    // Should not throw
    expect(() => cleanup()).not.toThrow();
  });
});

describe("toJsonOutput", () => {
  const mockGetProcessMetadata = vi.fn();
  const mockAdapter = {
    getListeningProcesses: vi.fn(),
    getProcessMetadata: mockGetProcessMetadata,
    killProcess: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    mockGetProcessMetadata.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts ProcessInfo to ProcessJsonOutput", async () => {
    // Mock the platform module
    vi.doMock("./platform/index.js", () => ({
      getAdapter: () => mockAdapter,
    }));

    mockGetProcessMetadata.mockReturnValue({
      cpuPercent: 5.5,
      memoryBytes: 52428800,
      startTime: "2025-01-06T10:30:00.000Z",
      path: "/usr/bin/node",
      cwd: "/home/user/project",
    } satisfies ProcessMetadata);

    // Re-import to get mocked version
    const { toJsonOutput: mockedToJsonOutput } = await import("./index.js");

    const processInfo: ProcessInfo = {
      pid: 12345,
      command: "node",
      port: 3000,
      protocol: "TCP",
      user: "testuser",
    };

    const result = mockedToJsonOutput(processInfo);

    expect(result.pid).toBe(12345);
    expect(result.name).toBe("node");
    expect(result.port).toBe(3000);
    expect(result.protocol).toBe("TCP");
    expect(result.user).toBe("testuser");
  });
});

describe("handleKillMode", () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;
  let mockKillProcess: ReturnType<typeof vi.fn>;

  const createProcess = (
    overrides: Partial<ProcessInfo> = {},
  ): ProcessInfo => ({
    pid: 12345,
    command: "node",
    port: 3000,
    protocol: "TCP",
    user: "testuser",
    ...overrides,
  });

  const createMockMetadata = () => ({
    cpuPercent: 1.0,
    memoryBytes: 1024 * 1024,
    startTime: "2025-01-01T00:00:00.000Z",
    path: "/usr/bin/node",
    cwd: "/home/testuser/project",
  });

  const mockGetProcessMetadata = () => createMockMetadata();

  beforeEach(async () => {
    mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockKillProcess = vi.fn();

    // Mock the platform adapter
    vi.doMock("./platform/index.js", () => ({
      getAdapter: () => ({
        getListeningProcesses: vi.fn(),
        getProcessMetadata: mockGetProcessMetadata,
        killProcess: mockKillProcess,
      }),
    }));
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    vi.resetModules();
  });

  describe("with --force flag", () => {
    it("kills processes without confirmation", async () => {
      vi.resetModules();
      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [createProcess()];

      await mockedHandleKillMode(processes, true, false, "3000");

      expect(mockKillProcess).toHaveBeenCalledWith(12345, "SIGTERM");
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Killed PID 12345"),
      );
    });

    it("kills multiple processes", async () => {
      vi.resetModules();
      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [
        createProcess({ pid: 111, port: 3000 }),
        createProcess({ pid: 222, port: 3001 }),
        createProcess({ pid: 333, port: 3002 }),
      ];

      await mockedHandleKillMode(processes, true, false, "3000-3002");

      expect(mockKillProcess).toHaveBeenCalledTimes(3);
      expect(mockKillProcess).toHaveBeenCalledWith(111, "SIGTERM");
      expect(mockKillProcess).toHaveBeenCalledWith(222, "SIGTERM");
      expect(mockKillProcess).toHaveBeenCalledWith(333, "SIGTERM");
    });
  });

  describe("with --murder flag", () => {
    it("uses SIGKILL instead of SIGTERM", async () => {
      vi.resetModules();
      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [createProcess()];

      await mockedHandleKillMode(processes, true, true, "3000");

      expect(mockKillProcess).toHaveBeenCalledWith(12345, "SIGKILL");
    });

    it("displays special murder message", async () => {
      vi.resetModules();
      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [createProcess({ command: "target" })];

      await mockedHandleKillMode(processes, true, true, "3000");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("ELIMINATED"),
      );
    });
  });

  describe("error handling", () => {
    it("handles EPERM error", async () => {
      vi.resetModules();
      const epermError = new Error("Operation not permitted") as Error & {
        code: string;
      };
      epermError.code = "EPERM";
      mockKillProcess.mockImplementation(() => {
        throw epermError;
      });

      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [createProcess()];

      await expect(
        mockedHandleKillMode(processes, true, false, "3000"),
      ).rejects.toThrow("process.exit(1)");
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Permission denied"),
      );
    });

    it("handles ESRCH error (process no longer exists)", async () => {
      vi.resetModules();
      const esrchError = new Error("No such process") as Error & {
        code: string;
      };
      esrchError.code = "ESRCH";
      mockKillProcess.mockImplementation(() => {
        throw esrchError;
      });

      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [createProcess()];

      await expect(
        mockedHandleKillMode(processes, true, false, "3000"),
      ).rejects.toThrow("process.exit(1)");
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("no longer exists"),
      );
    });

    it("handles generic errors", async () => {
      vi.resetModules();
      mockKillProcess.mockImplementation(() => {
        throw new Error("Some unexpected error");
      });

      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [createProcess()];

      await expect(
        mockedHandleKillMode(processes, true, false, "3000"),
      ).rejects.toThrow("process.exit(1)");
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining("Failed to kill PID"),
      );
    });

    it("continues killing after partial failure", async () => {
      vi.resetModules();
      let callCount = 0;
      mockKillProcess.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          const err = new Error("No such process") as Error & { code: string };
          err.code = "ESRCH";
          throw err;
        }
      });

      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [
        createProcess({ pid: 111 }),
        createProcess({ pid: 222 }),
        createProcess({ pid: 333 }),
      ];

      await expect(
        mockedHandleKillMode(processes, true, false, "3000"),
      ).rejects.toThrow("process.exit(1)");

      // All 3 should be attempted
      expect(mockKillProcess).toHaveBeenCalledTimes(3);

      // Should report partial success
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Killed 2 processes"),
      );
    });
  });

  describe("output formatting", () => {
    it("displays processes to be killed", async () => {
      vi.resetModules();
      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [
        createProcess({ command: "myapp", port: 8080, pid: 999 }),
      ];

      await mockedHandleKillMode(processes, true, false, "8080");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Processes to kill"),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Port  8080"),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("myapp"),
      );
    });

    it("reports correct kill count for single process", async () => {
      vi.resetModules();
      vi.doMock("./platform/index.js", () => ({
        getAdapter: () => ({
          getListeningProcesses: vi.fn(),
          getProcessMetadata: mockGetProcessMetadata,
          killProcess: mockKillProcess,
        }),
      }));

      const { handleKillMode: mockedHandleKillMode } =
        await import("./index.js");
      const processes = [createProcess()];

      await mockedHandleKillMode(processes, true, false, "3000");

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining("Killed 1 process"),
      );
      // Should use singular "process" not "processes"
      const calls = mockConsoleLog.mock.calls.flat();
      const killMessage = calls.find(
        (c) => typeof c === "string" && c.includes("Killed 1"),
      );
      expect(killMessage).not.toContain("processes");
    });
  });
});
