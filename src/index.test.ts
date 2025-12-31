import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs, parsePorts, type CliFlags } from "./index.js";

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
  });
});
