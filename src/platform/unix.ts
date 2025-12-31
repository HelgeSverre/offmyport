import type { PlatformAdapter, ProcessInfo, ProcessMetadata } from "./types.js";

/**
 * Unix (macOS/Linux) platform adapter.
 * Uses lsof with ss fallback for port discovery.
 */
export class UnixAdapter implements PlatformAdapter {
  /**
   * Get all processes listening on TCP ports.
   * Tries lsof first, falls back to ss on Linux.
   */
  getListeningProcesses(): ProcessInfo[] {
    // Try lsof first (available on macOS, usually on Linux)
    const lsofResult = this.tryLsof();
    if (lsofResult !== null) {
      return lsofResult;
    }

    // Fallback to ss (Linux when lsof unavailable)
    const ssResult = this.trySs();
    if (ssResult !== null) {
      return ssResult;
    }

    console.error("Neither lsof nor ss available. Install lsof or iproute2.");
    process.exit(1);
  }

  /**
   * Try to get listening processes using lsof.
   * Returns null if lsof is not available.
   */
  private tryLsof(): ProcessInfo[] | null {
    try {
      const proc = Bun.spawnSync(["lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n"]);

      if (proc.exitCode !== 0) {
        // Check if lsof is not found vs other errors
        const stderr = proc.stderr.toString();
        if (stderr.includes("not found") || proc.exitCode === 127) {
          return null; // lsof not available, try fallback
        }
        // lsof exists but failed (e.g., no listening processes)
        return [];
      }

      return this.parseLsofOutput(proc.stdout.toString());
    } catch (err: unknown) {
      // Bun throws ENOENT when executable not found
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Parse lsof output into ProcessInfo array.
   */
  private parseLsofOutput(output: string): ProcessInfo[] {
    const lines = output.split("\n").slice(1); // skip header
    const processes: ProcessInfo[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split(/\s+/);
      // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
      // node    123 user 45u IPv4 0x123  0t0      TCP  127.0.0.1:3000 (LISTEN)

      const command = parts[0];
      const pidStr = parts[1];
      const user = parts[2];
      const name = parts[8] ?? "";

      if (!command || !pidStr || !user) continue;

      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) continue;

      // Extract port from name like "127.0.0.1:3000" or "*:8080"
      const portMatch = name.match(/:(\d+)$/);
      if (!portMatch?.[1]) continue;

      const port = parseInt(portMatch[1], 10);

      processes.push({
        command,
        pid,
        user,
        port,
        protocol: "TCP",
      });
    }

    // Deduplicate by pid+port (same process may have multiple file descriptors)
    const seen = new Set<string>();
    return processes.filter((p) => {
      const key = `${p.pid}:${p.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Try to get listening processes using ss (Linux fallback).
   * Returns null if ss is not available.
   */
  private trySs(): ProcessInfo[] | null {
    try {
      // ss -tulnp shows TCP/UDP listening with process info
      const proc = Bun.spawnSync(["ss", "-tulnp"]);

      if (proc.exitCode !== 0) {
        const stderr = proc.stderr.toString();
        if (stderr.includes("not found") || proc.exitCode === 127) {
          return null; // ss not available
        }
        return [];
      }

      return this.parseSsOutput(proc.stdout.toString());
    } catch (err: unknown) {
      // Bun throws ENOENT when executable not found
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Parse ss output into ProcessInfo array.
   * Example line: LISTEN 0 128 *:3000 *:* users:(("node",pid=1234,fd=20))
   */
  private parseSsOutput(output: string): ProcessInfo[] {
    const lines = output.split("\n").slice(1); // skip header
    const processes: ProcessInfo[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // Only process LISTEN state
      if (!line.startsWith("LISTEN")) continue;

      // Extract port from local address (4th column)
      // Format: *:3000 or 0.0.0.0:3000 or [::]:3000
      const parts = line.split(/\s+/);
      const localAddr = parts[3] ?? "";
      const portMatch = localAddr.match(/:(\d+)$/);
      if (!portMatch?.[1]) continue;
      const port = parseInt(portMatch[1], 10);

      // Extract process info from users:((... ))
      // Format: users:(("node",pid=1234,fd=20))
      const usersMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
      if (!usersMatch) continue;

      const command = usersMatch[1] ?? "unknown";
      const pid = parseInt(usersMatch[2] ?? "0", 10);
      if (isNaN(pid) || pid === 0) continue;

      // ss doesn't show user, get it from /proc
      const user = this.getProcessUser(pid) ?? "unknown";

      processes.push({
        command,
        pid,
        user,
        port,
        protocol: "TCP",
      });
    }

    // Deduplicate
    const seen = new Set<string>();
    return processes.filter((p) => {
      const key = `${p.pid}:${p.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get the user owning a process from /proc on Linux.
   */
  private getProcessUser(pid: number): string | null {
    try {
      const proc = Bun.spawnSync(["stat", "-c", "%U", `/proc/${pid}`]);
      if (proc.exitCode === 0) {
        return proc.stdout.toString().trim();
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  /**
   * Get extended metadata for a process.
   */
  getProcessMetadata(pid: number): ProcessMetadata {
    const cwd = this.getProcessCwd(pid);

    try {
      // ps -p PID -o %cpu=,%mem=,rss=,lstart=,args=
      const proc = Bun.spawnSync([
        "ps",
        "-p",
        String(pid),
        "-o",
        "%cpu=,%mem=,rss=,lstart=,args=",
      ]);

      if (proc.exitCode !== 0) {
        return {
          cpuPercent: null,
          memoryBytes: null,
          startTime: null,
          path: null,
          cwd,
        };
      }

      const output = proc.stdout.toString().trim();
      if (!output) {
        return {
          cpuPercent: null,
          memoryBytes: null,
          startTime: null,
          path: null,
          cwd,
        };
      }

      // Output format varies by locale:
      // "0.0  0.1  12345 Mon Jan  1 12:00:00 2025     /usr/bin/node server.js"
      // "0,0  0,1  12345 ons 31 des 06:04:50 2025     /usr/bin/node server.js"
      // Note: lstart uses multiple spaces before args

      // Parse numbers first (handle both . and , as decimal separator)
      const parts = output.trim().split(/\s+/);
      const cpuStr = (parts[0] ?? "").replace(",", ".");
      const rssStr = parts[2] ?? "";

      const cpuParsed = parseFloat(cpuStr);
      const cpuPercent = isNaN(cpuParsed) ? null : cpuParsed;
      const rssKb = parseInt(rssStr, 10) || null;

      // Find the path - it's after the year (4 digits) and multiple spaces
      // lstart format: "Day Mon DD HH:MM:SS YYYY" then spaces then args
      const yearMatch = output.match(/\d{4}\s{2,}(.+)$/);
      const path = yearMatch?.[1]?.trim() ?? null;

      // Extract start time - between RSS and path
      // parts[3..7] is typically: Day Mon DD HH:MM:SS YYYY
      let startTime: string | null = null;
      if (parts.length >= 8) {
        const dateStr = parts.slice(3, 8).join(" ");
        try {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            startTime = date.toISOString();
          } else {
            // Keep raw string for non-English locales
            startTime = dateStr;
          }
        } catch {
          startTime = dateStr;
        }
      }

      return {
        cpuPercent,
        memoryBytes: rssKb ? rssKb * 1024 : null,
        startTime,
        path,
        cwd,
      };
    } catch {
      return {
        cpuPercent: null,
        memoryBytes: null,
        startTime: null,
        path: null,
        cwd,
      };
    }
  }

  /**
   * Get the current working directory of a process.
   * Tries lsof first, falls back to /proc on Linux.
   */
  private getProcessCwd(pid: number): string | null {
    // Try lsof first
    try {
      const proc = Bun.spawnSync([
        "lsof",
        "-a",
        "-p",
        String(pid),
        "-d",
        "cwd",
        "-Fn",
      ]);
      if (proc.exitCode === 0) {
        const output = proc.stdout.toString();
        // Output format: "p12345\nn/path/to/cwd\n"
        const match = output.match(/^n(.+)$/m);
        if (match?.[1]) {
          return match[1];
        }
      }
    } catch {
      // Ignore, try fallback
    }

    // Fallback: read /proc/PID/cwd symlink (Linux only)
    try {
      const proc = Bun.spawnSync(["readlink", `/proc/${pid}/cwd`]);
      if (proc.exitCode === 0) {
        const cwd = proc.stdout.toString().trim();
        if (cwd) return cwd;
      }
    } catch {
      // Ignore
    }

    return null;
  }

  /**
   * Kill a process with the specified signal.
   */
  killProcess(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
    process.kill(pid, signal);
  }
}
