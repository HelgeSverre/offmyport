import type { PlatformAdapter, ProcessInfo, ProcessMetadata } from "./types.js";

/**
 * Windows platform adapter.
 * Uses PowerShell for port discovery and process metadata.
 */
export class WindowsAdapter implements PlatformAdapter {
  /**
   * Get all processes listening on TCP ports using PowerShell.
   */
  getListeningProcesses(): ProcessInfo[] {
    // PowerShell script to get listening ports with process info
    const script = `
      Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object {
        $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        [PSCustomObject]@{
          Port = $_.LocalPort
          PID = $_.OwningProcess
          Name = if ($proc) { $proc.ProcessName } else { "unknown" }
          User = try { (Get-Process -Id $_.OwningProcess -IncludeUserName -ErrorAction SilentlyContinue).UserName } catch { "unknown" }
        }
      } | ConvertTo-Json -Compress
    `;

    const proc = Bun.spawnSync([
      "powershell",
      "-NoProfile",
      "-Command",
      script,
    ]);

    if (proc.exitCode !== 0) {
      console.error("Failed to query listening ports via PowerShell.");
      process.exit(1);
    }

    const output = proc.stdout.toString().trim();
    if (!output || output === "null") {
      return [];
    }

    try {
      const data = JSON.parse(output);
      // PowerShell returns single object (not array) when only one result
      const items = Array.isArray(data) ? data : [data];

      return items.map(
        (item: { Port: number; PID: number; Name: string; User: string }) => ({
          port: item.Port,
          pid: item.PID,
          command: item.Name,
          user: item.User ?? "unknown",
          protocol: "TCP",
        }),
      );
    } catch {
      console.error("Failed to parse PowerShell output.");
      return [];
    }
  }

  /**
   * Get extended metadata for a process using PowerShell.
   */
  getProcessMetadata(pid: number): ProcessMetadata {
    const script = `
      $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
      if ($p) {
        $wmi = Get-WmiObject Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue
        [PSCustomObject]@{
          CPU = $p.CPU
          Memory = $p.WorkingSet64
          StartTime = if ($p.StartTime) { $p.StartTime.ToString("o") } else { $null }
          Path = $p.Path
          Cwd = if ($wmi) { Split-Path -Parent $wmi.ExecutablePath -ErrorAction SilentlyContinue } else { $null }
        } | ConvertTo-Json -Compress
      } else {
        "{}"
      }
    `;

    try {
      const proc = Bun.spawnSync([
        "powershell",
        "-NoProfile",
        "-Command",
        script,
      ]);

      if (proc.exitCode !== 0) {
        return this.emptyMetadata();
      }

      const output = proc.stdout.toString().trim();
      if (!output || output === "{}" || output === "null") {
        return this.emptyMetadata();
      }

      const data = JSON.parse(output);

      return {
        cpuPercent: typeof data.CPU === "number" ? data.CPU : null,
        memoryBytes: typeof data.Memory === "number" ? data.Memory : null,
        startTime: data.StartTime ?? null,
        path: data.Path ?? null,
        cwd: data.Cwd ?? null,
      };
    } catch {
      return this.emptyMetadata();
    }
  }

  /**
   * Get extended metadata for multiple processes in a batch.
   * Much faster than calling getProcessMetadata for each PID individually.
   */
  getProcessMetadataBatch(pids: number[]): Map<number, ProcessMetadata> {
    const metadataMap = new Map<number, ProcessMetadata>();

    if (pids.length === 0) return metadataMap;

    // Initialize with defaults
    for (const pid of pids) {
      metadataMap.set(pid, this.emptyMetadata());
    }

    // PowerShell script to get metadata for all PIDs at once
    const pidsArray = pids.join(",");
    const script = `
      $pids = @(${pidsArray})
      $results = @()
      foreach ($pid in $pids) {
        $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($p) {
          $wmi = Get-WmiObject Win32_Process -Filter "ProcessId = $pid" -ErrorAction SilentlyContinue
          $results += [PSCustomObject]@{
            PID = $pid
            CPU = $p.CPU
            Memory = $p.WorkingSet64
            StartTime = if ($p.StartTime) { $p.StartTime.ToString("o") } else { $null }
            Path = $p.Path
            Cwd = if ($wmi) { Split-Path -Parent $wmi.ExecutablePath -ErrorAction SilentlyContinue } else { $null }
          }
        }
      }
      $results | ConvertTo-Json -Compress
    `;

    try {
      const proc = Bun.spawnSync([
        "powershell",
        "-NoProfile",
        "-Command",
        script,
      ]);

      if (proc.exitCode !== 0) {
        return metadataMap;
      }

      const output = proc.stdout.toString().trim();
      if (!output || output === "null" || output === "[]") {
        return metadataMap;
      }

      const data = JSON.parse(output);
      // PowerShell returns single object (not array) when only one result
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        const existing = metadataMap.get(item.PID);
        if (existing) {
          existing.cpuPercent = typeof item.CPU === "number" ? item.CPU : null;
          existing.memoryBytes =
            typeof item.Memory === "number" ? item.Memory : null;
          existing.startTime = item.StartTime ?? null;
          existing.path = item.Path ?? null;
          existing.cwd = item.Cwd ?? null;
        }
      }
    } catch {
      // Return what we have
    }

    return metadataMap;
  }

  /**
   * Return empty metadata object.
   */
  private emptyMetadata(): ProcessMetadata {
    return {
      cpuPercent: null,
      memoryBytes: null,
      startTime: null,
      path: null,
      cwd: null,
    };
  }

  /**
   * Kill a process with the specified signal.
   * Uses process.kill which works on Windows for SIGTERM/SIGKILL.
   */
  killProcess(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
    try {
      process.kill(pid, signal);
    } catch (err: unknown) {
      // Fallback to taskkill if process.kill fails
      const force = signal === "SIGKILL" ? "/F" : "";
      const args = ["/PID", String(pid)];
      if (force) args.push(force);

      const proc = Bun.spawnSync(["taskkill", ...args]);
      if (proc.exitCode !== 0) {
        throw err; // Re-throw original error
      }
    }
  }
}
