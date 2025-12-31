/**
 * Process information from port listing.
 */
export interface ProcessInfo {
  command: string;
  pid: number;
  user: string;
  port: number;
  protocol: string;
}

/**
 * Extended process metadata for JSON output.
 */
export interface ProcessMetadata {
  cpuPercent: number | null;
  memoryBytes: number | null;
  startTime: string | null;
  path: string | null;
  cwd: string | null;
}

/**
 * Platform-specific adapter interface.
 * Implementations exist for Unix (macOS/Linux) and Windows.
 */
export interface PlatformAdapter {
  /**
   * Get all processes listening on TCP ports.
   */
  getListeningProcesses(): ProcessInfo[];

  /**
   * Get extended metadata for a process.
   */
  getProcessMetadata(pid: number): ProcessMetadata;

  /**
   * Kill a process with the specified signal.
   */
  killProcess(pid: number, signal: "SIGTERM" | "SIGKILL"): void;
}
