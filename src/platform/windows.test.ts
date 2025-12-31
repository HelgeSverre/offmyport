import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WindowsAdapter } from "./windows.js";

// Mock Bun.spawnSync
const mockSpawnSync = vi.fn();
vi.stubGlobal("Bun", { spawnSync: mockSpawnSync });

describe("WindowsAdapter", () => {
  let adapter: WindowsAdapter;

  beforeEach(() => {
    adapter = new WindowsAdapter();
    mockSpawnSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getListeningProcesses", () => {
    it("parses PowerShell JSON array output", () => {
      const psOutput = JSON.stringify([
        { Port: 80, PID: 1234, Name: "nginx", User: "SYSTEM" },
        { Port: 443, PID: 1234, Name: "nginx", User: "SYSTEM" },
        { Port: 3000, PID: 5678, Name: "node", User: "user" },
      ]);

      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => psOutput },
        stderr: { toString: () => "" },
      });

      const result = adapter.getListeningProcesses();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        port: 80,
        pid: 1234,
        command: "nginx",
        user: "SYSTEM",
        protocol: "TCP",
      });
      expect(result[2]).toEqual({
        port: 3000,
        pid: 5678,
        command: "node",
        user: "user",
        protocol: "TCP",
      });
    });

    it("parses PowerShell single object output (not array)", () => {
      // PowerShell returns single object when only one result
      const psOutput = JSON.stringify({
        Port: 3000,
        PID: 5678,
        Name: "node",
        User: "user",
      });

      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => psOutput },
        stderr: { toString: () => "" },
      });

      const result = adapter.getListeningProcesses();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        port: 3000,
        pid: 5678,
        command: "node",
        user: "user",
        protocol: "TCP",
      });
    });

    it("returns empty array for null output", () => {
      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => "null" },
        stderr: { toString: () => "" },
      });

      const result = adapter.getListeningProcesses();

      expect(result).toEqual([]);
    });

    it("returns empty array for empty output", () => {
      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => "" },
        stderr: { toString: () => "" },
      });

      const result = adapter.getListeningProcesses();

      expect(result).toEqual([]);
    });

    it("returns empty array for whitespace-only output", () => {
      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => "   \n  " },
        stderr: { toString: () => "" },
      });

      const result = adapter.getListeningProcesses();

      expect(result).toEqual([]);
    });

    it("handles missing User field gracefully", () => {
      const psOutput = JSON.stringify([
        { Port: 3000, PID: 5678, Name: "node" }, // No User field
      ]);

      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => psOutput },
        stderr: { toString: () => "" },
      });

      const result = adapter.getListeningProcesses();

      expect(result).toHaveLength(1);
      expect(result[0].user).toBe("unknown");
    });

    it("exits on PowerShell failure", () => {
      const mockExit = vi.spyOn(process, "exit").mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
      const mockConsoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockSpawnSync.mockReturnValue({
        exitCode: 1,
        stdout: { toString: () => "" },
        stderr: { toString: () => "PowerShell error" },
      });

      expect(() => adapter.getListeningProcesses()).toThrow("process.exit(1)");
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Failed to query listening ports via PowerShell.",
      );

      mockExit.mockRestore();
      mockConsoleError.mockRestore();
    });

    it("returns empty array on JSON parse error", () => {
      const mockConsoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => "not valid json" },
        stderr: { toString: () => "" },
      });

      const result = adapter.getListeningProcesses();

      expect(result).toEqual([]);
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Failed to parse PowerShell output.",
      );

      mockConsoleError.mockRestore();
    });
  });

  describe("getProcessMetadata", () => {
    it("parses PowerShell metadata output", () => {
      const psOutput = JSON.stringify({
        CPU: 12.5,
        Memory: 52428800,
        StartTime: "2025-01-06T10:30:00.0000000Z",
        Path: "C:\\Program Files\\nodejs\\node.exe",
        Cwd: "C:\\Users\\user\\project",
      });

      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => psOutput },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result.cpuPercent).toBe(12.5);
      expect(result.memoryBytes).toBe(52428800);
      expect(result.startTime).toBe("2025-01-06T10:30:00.0000000Z");
      expect(result.path).toBe("C:\\Program Files\\nodejs\\node.exe");
      expect(result.cwd).toBe("C:\\Users\\user\\project");
    });

    it("returns empty metadata when process not found", () => {
      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => "{}" },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(99999);

      expect(result).toEqual({
        cpuPercent: null,
        memoryBytes: null,
        startTime: null,
        path: null,
        cwd: null,
      });
    });

    it("returns empty metadata when output is null", () => {
      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => "null" },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result).toEqual({
        cpuPercent: null,
        memoryBytes: null,
        startTime: null,
        path: null,
        cwd: null,
      });
    });

    it("returns empty metadata on PowerShell error", () => {
      mockSpawnSync.mockReturnValue({
        exitCode: 1,
        stdout: { toString: () => "" },
        stderr: { toString: () => "error" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result).toEqual({
        cpuPercent: null,
        memoryBytes: null,
        startTime: null,
        path: null,
        cwd: null,
      });
    });

    it("returns empty metadata on JSON parse error", () => {
      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => "invalid json" },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result).toEqual({
        cpuPercent: null,
        memoryBytes: null,
        startTime: null,
        path: null,
        cwd: null,
      });
    });

    it("handles partial metadata (some fields null)", () => {
      const psOutput = JSON.stringify({
        CPU: 5.0,
        Memory: 10240000,
        StartTime: null,
        Path: null,
        Cwd: null,
      });

      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => psOutput },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result.cpuPercent).toBe(5.0);
      expect(result.memoryBytes).toBe(10240000);
      expect(result.startTime).toBeNull();
      expect(result.path).toBeNull();
      expect(result.cwd).toBeNull();
    });

    it("handles non-number CPU value", () => {
      const psOutput = JSON.stringify({
        CPU: "not a number",
        Memory: 10240000,
        StartTime: null,
        Path: null,
        Cwd: null,
      });

      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => psOutput },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result.cpuPercent).toBeNull();
      expect(result.memoryBytes).toBe(10240000);
    });
  });

  describe("killProcess", () => {
    it("calls process.kill with SIGTERM", () => {
      const mockKill = vi.spyOn(process, "kill").mockImplementation(() => true);

      adapter.killProcess(12345, "SIGTERM");

      expect(mockKill).toHaveBeenCalledWith(12345, "SIGTERM");

      mockKill.mockRestore();
    });

    it("calls process.kill with SIGKILL", () => {
      const mockKill = vi.spyOn(process, "kill").mockImplementation(() => true);

      adapter.killProcess(12345, "SIGKILL");

      expect(mockKill).toHaveBeenCalledWith(12345, "SIGKILL");

      mockKill.mockRestore();
    });

    it("falls back to taskkill on process.kill failure", () => {
      const mockKill = vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("process.kill failed");
      });

      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => "" },
        stderr: { toString: () => "" },
      });

      adapter.killProcess(12345, "SIGTERM");

      expect(mockSpawnSync).toHaveBeenCalledWith(["taskkill", "/PID", "12345"]);

      mockKill.mockRestore();
    });

    it("falls back to taskkill with /F for SIGKILL", () => {
      const mockKill = vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("process.kill failed");
      });

      mockSpawnSync.mockReturnValue({
        exitCode: 0,
        stdout: { toString: () => "" },
        stderr: { toString: () => "" },
      });

      adapter.killProcess(12345, "SIGKILL");

      expect(mockSpawnSync).toHaveBeenCalledWith([
        "taskkill",
        "/PID",
        "12345",
        "/F",
      ]);

      mockKill.mockRestore();
    });

    it("rethrows original error when taskkill also fails", () => {
      const mockKill = vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("process.kill failed");
      });

      mockSpawnSync.mockReturnValue({
        exitCode: 1,
        stdout: { toString: () => "" },
        stderr: { toString: () => "Access denied" },
      });

      expect(() => adapter.killProcess(12345, "SIGTERM")).toThrow(
        "process.kill failed",
      );

      mockKill.mockRestore();
    });
  });
});
