import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UnixAdapter } from "./unix.js";

// Mock Bun.spawnSync
const mockSpawnSync = vi.fn();
vi.stubGlobal("Bun", { spawnSync: mockSpawnSync });

describe("UnixAdapter", () => {
  let adapter: UnixAdapter;

  beforeEach(() => {
    adapter = new UnixAdapter();
    mockSpawnSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getListeningProcesses", () => {
    describe("lsof parsing", () => {
      it("parses standard lsof output correctly", () => {
        const lsofOutput = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   20u  IPv4 0x1234567890      0t0  TCP 127.0.0.1:3000 (LISTEN)
python    67890   admin  10u  IPv4 0x0987654321      0t0  TCP *:8080 (LISTEN)`;

        mockSpawnSync.mockReturnValue({
          exitCode: 0,
          stdout: { toString: () => lsofOutput },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          command: "node",
          pid: 12345,
          user: "user",
          port: 3000,
          protocol: "TCP",
        });
        expect(result[1]).toEqual({
          command: "python",
          pid: 67890,
          user: "admin",
          port: 8080,
          protocol: "TCP",
        });
      });

      it("handles IPv6 addresses", () => {
        const lsofOutput = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   20u  IPv6 0x1234567890      0t0  TCP [::1]:3000 (LISTEN)`;

        mockSpawnSync.mockReturnValue({
          exitCode: 0,
          stdout: { toString: () => lsofOutput },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          command: "node",
          pid: 12345,
          user: "user",
          port: 3000,
          protocol: "TCP",
        });
      });

      it("deduplicates entries with same pid and port", () => {
        const lsofOutput = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   20u  IPv4 0x1234567890      0t0  TCP 127.0.0.1:3000 (LISTEN)
node      12345   user   21u  IPv4 0x1234567891      0t0  TCP 0.0.0.0:3000 (LISTEN)`;

        mockSpawnSync.mockReturnValue({
          exitCode: 0,
          stdout: { toString: () => lsofOutput },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
        expect(result[0].pid).toBe(12345);
        expect(result[0].port).toBe(3000);
      });

      it("skips lines without valid port", () => {
        const lsofOutput = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   20u  IPv4 0x1234567890      0t0  TCP 127.0.0.1:3000 (LISTEN)
launchd       1   root    4u  IPv4 0x0987654321      0t0  TCP *:* (LISTEN)`;

        mockSpawnSync.mockReturnValue({
          exitCode: 0,
          stdout: { toString: () => lsofOutput },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
        expect(result[0].port).toBe(3000);
      });

      it("skips malformed lines", () => {
        const lsofOutput = `COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345   user   20u  IPv4 0x1234567890      0t0  TCP 127.0.0.1:3000 (LISTEN)
malformed line without proper columns
      incomplete   data`;

        mockSpawnSync.mockReturnValue({
          exitCode: 0,
          stdout: { toString: () => lsofOutput },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
      });

      it("handles empty output", () => {
        mockSpawnSync.mockReturnValue({
          exitCode: 0,
          stdout: {
            toString: () =>
              "COMMAND     PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME\n",
          },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toEqual([]);
      });

      it("returns empty array when lsof exits with non-zero but not 127", () => {
        mockSpawnSync.mockReturnValue({
          exitCode: 1,
          stdout: { toString: () => "" },
          stderr: { toString: () => "some error" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toEqual([]);
      });
    });

    describe("ss fallback", () => {
      it("falls back to ss when lsof not found (exit code 127)", () => {
        // First call: lsof not found
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 127,
          stdout: { toString: () => "" },
          stderr: { toString: () => "lsof: not found" },
        });

        // Second call: ss succeeds
        const ssOutput = `State      Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN     0      128          *:3000             *:*     users:(("node",pid=12345,fd=20))`;

        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => ssOutput },
          stderr: { toString: () => "" },
        });

        // Third call: stat for user
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => "testuser\n" },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          command: "node",
          pid: 12345,
          user: "testuser",
          port: 3000,
          protocol: "TCP",
        });
      });

      it("falls back to ss when lsof throws ENOENT", () => {
        // First call: lsof throws ENOENT
        const enoentError = new Error("spawn lsof ENOENT") as Error & {
          code: string;
        };
        enoentError.code = "ENOENT";
        mockSpawnSync.mockImplementationOnce(() => {
          throw enoentError;
        });

        // Second call: ss succeeds
        const ssOutput = `State      Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN     0      128          *:8080             *:*     users:(("python",pid=67890,fd=10))`;

        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => ssOutput },
          stderr: { toString: () => "" },
        });

        // Third call: stat for user
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => "admin\n" },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
        expect(result[0].command).toBe("python");
        expect(result[0].pid).toBe(67890);
      });

      it("parses ss output with IPv6 address format", () => {
        // First call: lsof not found
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 127,
          stdout: { toString: () => "" },
          stderr: { toString: () => "not found" },
        });

        // Second call: ss with IPv6
        const ssOutput = `State      Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN     0      128       [::]:443            [::]:*     users:(("nginx",pid=1234,fd=6))`;

        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => ssOutput },
          stderr: { toString: () => "" },
        });

        // Third call: stat for user
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => "www-data\n" },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
        expect(result[0].port).toBe(443);
        expect(result[0].command).toBe("nginx");
      });

      it("uses 'unknown' user when stat fails", () => {
        // First call: lsof not found
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 127,
          stdout: { toString: () => "" },
          stderr: { toString: () => "not found" },
        });

        // Second call: ss succeeds
        const ssOutput = `State      Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN     0      128          *:3000             *:*     users:(("node",pid=12345,fd=20))`;

        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => ssOutput },
          stderr: { toString: () => "" },
        });

        // Third call: stat fails
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 1,
          stdout: { toString: () => "" },
          stderr: { toString: () => "No such process" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
        expect(result[0].user).toBe("unknown");
      });

      it("skips non-LISTEN lines in ss output", () => {
        // First call: lsof not found
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 127,
          stdout: { toString: () => "" },
          stderr: { toString: () => "not found" },
        });

        // Second call: ss with mixed states
        const ssOutput = `State      Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN     0      128          *:3000             *:*     users:(("node",pid=12345,fd=20))
ESTAB      0      0      192.168.1.1:3000   192.168.1.2:45678
TIME-WAIT  0      0      192.168.1.1:3000   192.168.1.2:45679`;

        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => ssOutput },
          stderr: { toString: () => "" },
        });

        // stat call
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => "user\n" },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
      });

      it("deduplicates ss entries", () => {
        // First call: lsof not found
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 127,
          stdout: { toString: () => "" },
          stderr: { toString: () => "not found" },
        });

        // Second call: ss with duplicates
        const ssOutput = `State      Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN     0      128          *:3000             *:*     users:(("node",pid=12345,fd=20))
LISTEN     0      128       [::]:3000          [::]:*     users:(("node",pid=12345,fd=21))`;

        mockSpawnSync.mockReturnValueOnce({
          exitCode: 0,
          stdout: { toString: () => ssOutput },
          stderr: { toString: () => "" },
        });

        // stat calls (two)
        mockSpawnSync.mockReturnValue({
          exitCode: 0,
          stdout: { toString: () => "user\n" },
          stderr: { toString: () => "" },
        });

        const result = adapter.getListeningProcesses();

        expect(result).toHaveLength(1);
      });
    });

    describe("error handling", () => {
      it("exits when neither lsof nor ss available", () => {
        const mockExit = vi
          .spyOn(process, "exit")
          .mockImplementation((code) => {
            throw new Error(`process.exit(${code})`);
          });
        const mockConsoleError = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        // lsof not found
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 127,
          stdout: { toString: () => "" },
          stderr: { toString: () => "not found" },
        });

        // ss not found
        mockSpawnSync.mockReturnValueOnce({
          exitCode: 127,
          stdout: { toString: () => "" },
          stderr: { toString: () => "not found" },
        });

        expect(() => adapter.getListeningProcesses()).toThrow(
          "process.exit(1)",
        );
        expect(mockConsoleError).toHaveBeenCalledWith(
          "Neither lsof nor ss available. Install lsof or iproute2.",
        );

        mockExit.mockRestore();
        mockConsoleError.mockRestore();
      });

      it("rethrows non-ENOENT errors from lsof", () => {
        const customError = new Error("Some other error");
        mockSpawnSync.mockImplementationOnce(() => {
          throw customError;
        });

        expect(() => adapter.getListeningProcesses()).toThrow(
          "Some other error",
        );
      });
    });
  });

  describe("getProcessMetadata", () => {
    it("parses ps output correctly", () => {
      // Mock lsof for cwd
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 0,
        stdout: { toString: () => "p12345\nn/home/user/project\n" },
        stderr: { toString: () => "" },
      });

      // Mock ps output
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 0,
        stdout: {
          toString: () =>
            "  0.5  1.2  51200 Mon Jan  6 10:30:00 2025     /usr/bin/node server.js",
        },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result.cpuPercent).toBe(0.5);
      expect(result.memoryBytes).toBe(51200 * 1024);
      expect(result.path).toBe("/usr/bin/node server.js");
      expect(result.cwd).toBe("/home/user/project");
      expect(result.startTime).toBeDefined();
    });

    it("handles locale with comma decimal separator", () => {
      // Mock lsof for cwd
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 0,
        stdout: { toString: () => "p12345\nn/home/user/project\n" },
        stderr: { toString: () => "" },
      });

      // Mock ps output with comma as decimal separator (European locales)
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 0,
        stdout: {
          toString: () =>
            "  0,5  1,2  51200 ons 31 des 06:04:50 2025     /usr/bin/node",
        },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result.cpuPercent).toBe(0.5);
    });

    it("returns null values when ps fails", () => {
      // Mock lsof for cwd - fails
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 1,
        stdout: { toString: () => "" },
        stderr: { toString: () => "error" },
      });

      // Mock readlink for cwd fallback - fails
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 1,
        stdout: { toString: () => "" },
        stderr: { toString: () => "" },
      });

      // Mock ps - fails
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 1,
        stdout: { toString: () => "" },
        stderr: { toString: () => "No such process" },
      });

      const result = adapter.getProcessMetadata(99999);

      expect(result.cpuPercent).toBeNull();
      expect(result.memoryBytes).toBeNull();
      expect(result.startTime).toBeNull();
      expect(result.path).toBeNull();
    });

    it("returns null values when ps output is empty", () => {
      // Mock lsof for cwd
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 0,
        stdout: { toString: () => "" },
        stderr: { toString: () => "" },
      });

      // Mock readlink fallback
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 1,
        stdout: { toString: () => "" },
        stderr: { toString: () => "" },
      });

      // Mock ps with empty output
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 0,
        stdout: { toString: () => "" },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result.cpuPercent).toBeNull();
      expect(result.memoryBytes).toBeNull();
    });

    it("gets cwd from /proc fallback on Linux", () => {
      // Mock lsof for cwd - fails
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 1,
        stdout: { toString: () => "" },
        stderr: { toString: () => "" },
      });

      // Mock readlink for /proc/PID/cwd - succeeds
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 0,
        stdout: { toString: () => "/var/www/app\n" },
        stderr: { toString: () => "" },
      });

      // Mock ps output
      mockSpawnSync.mockReturnValueOnce({
        exitCode: 0,
        stdout: {
          toString: () =>
            "  0.0  0.1  12345 Mon Jan  6 10:00:00 2025     /usr/bin/node",
        },
        stderr: { toString: () => "" },
      });

      const result = adapter.getProcessMetadata(12345);

      expect(result.cwd).toBe("/var/www/app");
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

    it("throws EPERM error for permission denied", () => {
      const epermError = new Error("Operation not permitted") as Error & {
        code: string;
      };
      epermError.code = "EPERM";

      const mockKill = vi.spyOn(process, "kill").mockImplementation(() => {
        throw epermError;
      });

      expect(() => adapter.killProcess(12345, "SIGTERM")).toThrow(
        "Operation not permitted",
      );

      mockKill.mockRestore();
    });

    it("throws ESRCH error for non-existent process", () => {
      const esrchError = new Error("No such process") as Error & {
        code: string;
      };
      esrchError.code = "ESRCH";

      const mockKill = vi.spyOn(process, "kill").mockImplementation(() => {
        throw esrchError;
      });

      expect(() => adapter.killProcess(99999, "SIGTERM")).toThrow(
        "No such process",
      );

      mockKill.mockRestore();
    });
  });
});
