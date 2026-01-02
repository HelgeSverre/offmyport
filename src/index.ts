#!/usr/bin/env bun

import { select, confirm } from "@inquirer/prompts";
import { ExitPromptError } from "@inquirer/core";
import * as readline from "readline";
import meow from "meow";
import {
  getAdapter,
  type ProcessInfo,
  type ProcessMetadata,
} from "./platform/index.js";

export interface CliFlags {
  ports: string | null;
  kill: boolean;
  force: boolean;
  murder: boolean; // 🔪 undocumented: uses SIGKILL instead of SIGTERM
  json: boolean;
}

const helpText = `
  Usage
    $ offmyport [ports] [options]

  Options
    --kill, -k    Kill matching processes (with confirmation)
    --force, -f   Skip confirmation prompt (use with --kill)
    --json        Output process info as JSON (no TUI)
    --version     Show version number
    --help        Show this help

  Examples
    $ offmyport                   List all listening ports
    $ offmyport 3000              Filter to port 3000
    $ offmyport 80,443            Filter multiple ports
    $ offmyport 3000-3005         Filter port range
    $ offmyport 80,443,3000-3005  Mix ports and ranges
    $ offmyport 3000 --kill       Kill process on port 3000
    $ offmyport 3000 -k -f        Kill without confirmation
    $ offmyport --json            Output all ports as JSON
`;

/**
 * Parse CLI arguments using meow.
 * Exported for testing compatibility.
 */
export function parseArgs(argv: string[]): CliFlags {
  const cli = meow(helpText, {
    importMeta: import.meta,
    argv: argv.slice(2), // skip 'bun' and script path
    flags: {
      kill: {
        type: "boolean",
        shortFlag: "k",
        default: false,
      },
      force: {
        type: "boolean",
        shortFlag: "f",
        default: false,
      },
      murder: {
        type: "boolean",
        default: false,
      },
      json: {
        type: "boolean",
        default: false,
      },
    },
    autoHelp: false, // Handle manually to avoid auto-exit during tests
    autoVersion: false, // Handle manually to avoid auto-exit during tests
  });

  // Handle --help and --version manually when running as CLI
  if (import.meta.main) {
    if (argv.includes("--help") || argv.includes("-h")) {
      cli.showHelp(0);
    }
    if (argv.includes("--version") || argv.includes("-v")) {
      cli.showVersion();
    }
  }

  const murder = cli.flags.murder;

  return {
    ports: cli.input[0] ?? null,
    kill: cli.flags.kill || murder, // --murder implies --kill
    force: cli.flags.force || murder, // --murder implies --force
    murder,
    json: cli.flags.json,
  };
}

// Calculate page size as half the terminal height (min 5, max 20)
export function getPageSize(): number {
  const rows = process.stdout.rows || 24;
  return Math.min(20, Math.max(5, Math.floor(rows / 2)));
}

/**
 * Setup keyboard listener for 'q' to quit.
 * Returns cleanup function and AbortController for cancelling prompts.
 */
export function setupQuitHandler(): {
  cleanup: () => void;
  controller: AbortController;
} {
  const controller = new AbortController();

  // Save original raw mode state
  const wasRaw = process.stdin.isRaw;

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);

    const onKeypress = (char: string, key: readline.Key) => {
      if (char === "q" || char === "Q") {
        controller.abort();
      }
    };

    process.stdin.on("keypress", onKeypress);

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
    };

    return { cleanup, controller };
  }

  return { cleanup: () => {}, controller };
}

// JSON output format (--json flag)
// Uses common denominator fields across macOS, Linux, and Windows
export interface ProcessJsonOutput {
  pid: number;
  name: string;
  port: number;
  protocol: string;
  user: string;
  cpuPercent: number | null; // Can be null if unavailable (Windows edge cases)
  memoryBytes: number | null; // Working set (Win) or RSS (Unix), null if unavailable
  startTime: string | null; // ISO 8601 format, null if unavailable
  path: string | null; // Full executable path, null if unavailable (Win 32-bit accessing 64-bit)
  cwd: string | null; // Current working directory of the process
}

/**
 * Parse port specification supporting:
 * - Single port: "80" → [80]
 * - Comma-separated: "80,8080,3000" → [80, 8080, 3000]
 * - Ranges (inclusive): "3000-3005" → [3000, 3001, 3002, 3003, 3004, 3005]
 * - Mixed: "80,8080,3000-3005" → [80, 8080, 3000, 3001, 3002, 3003, 3004, 3005]
 */
export function parsePorts(input: string): number[] {
  const ports: number[] = [];
  const segments = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (segment.includes("-")) {
      const rangeParts = segment.split("-").map((s) => s.trim());
      const startStr = rangeParts[0] ?? "";
      const endStr = rangeParts[1] ?? "";

      // Validate range parts contain only digits
      if (!/^\d+$/.test(startStr) || !/^\d+$/.test(endStr)) {
        console.error(`Invalid port range: ${segment}`);
        process.exit(1);
      }

      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (start > end) {
        console.error(`Invalid port range (start > end): ${segment}`);
        process.exit(1);
      }

      if (start < 1 || end > 65535) {
        console.error(`Port out of range (1-65535): ${segment}`);
        process.exit(1);
      }

      for (let p = start; p <= end; p++) {
        ports.push(p);
      }
    } else {
      // Validate segment contains only digits (reject decimals, letters, etc.)
      if (!/^\d+$/.test(segment)) {
        console.error(`Invalid port number: ${segment}`);
        process.exit(1);
      }

      const port = parseInt(segment, 10);

      if (port < 1 || port > 65535) {
        console.error(`Port out of range (1-65535): ${port}`);
        process.exit(1);
      }

      ports.push(port);
    }
  }

  // Deduplicate and sort
  return [...new Set(ports)].sort((a, b) => a - b);
}

/**
 * Format bytes to human-readable string (e.g., "52.4 MB").
 */
function formatBytes(bytes: number | null): string {
  if (bytes === null) return "n/a";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format process metadata as description text for @inquirer/select.
 */
function formatProcessDescription(meta: ProcessMetadata): string {
  const lines: string[] = [];

  if (meta.path) lines.push(`Path: ${meta.path}`);
  if (meta.cwd) lines.push(`CWD:  ${meta.cwd}`);
  if (meta.cpuPercent !== null) lines.push(`CPU:  ${meta.cpuPercent.toFixed(1)}%`);
  if (meta.memoryBytes !== null) lines.push(`Mem:  ${formatBytes(meta.memoryBytes)}`);
  if (meta.startTime) {
    const date = new Date(meta.startTime);
    const formatted = isNaN(date.getTime()) ? meta.startTime : date.toLocaleString();
    lines.push(`Started: ${formatted}`);
  }

  return lines.length > 0 ? lines.join("\n") : "No additional info available";
}

/**
 * Generate table header for process list.
 */
function getTableHeader(): string {
  return `  ${"Port".padEnd(7)}│ ${"Command".padEnd(16)}│ ${"PID".padEnd(8)}│ ${"User".padEnd(11)}│ CWD`;
}

/**
 * Format a single process row for display.
 */
function formatProcessRow(p: ProcessInfo, cwd: string | null): string {
  const cwdDisplay = cwd ?? "(n/a)";
  return `Port ${p.port.toString().padStart(5)} │ ${p.command.padEnd(15)} │ PID ${p.pid.toString().padEnd(6)} │ ${p.user.padEnd(10)} │ ${cwdDisplay}`;
}

/**
 * Fetch metadata for all processes using batch call for performance.
 */
function fetchAllMetadata(processes: ProcessInfo[]): Map<number, ProcessMetadata> {
  const platform = getPlatformAdapter();
  const pids = processes.map((p) => p.pid);

  // Show loading indicator for long lists
  if (pids.length > 5) {
    process.stdout.write(`\x1b[2mLoading process details...\x1b[0m`);
  }

  const metadataMap = platform.getProcessMetadataBatch(pids);

  // Clear loading indicator
  if (pids.length > 5) {
    process.stdout.write(`\r\x1b[K`);
  }

  return metadataMap;
}

// Platform adapter instance (lazy initialized)
let adapter: ReturnType<typeof getAdapter> | null = null;

function getPlatformAdapter() {
  if (!adapter) {
    adapter = getAdapter();
  }
  return adapter;
}

/**
 * Convert ProcessInfo to ProcessJsonOutput with extended metadata.
 */
export function toJsonOutput(p: ProcessInfo): ProcessJsonOutput {
  const platform = getPlatformAdapter();
  const meta = platform.getProcessMetadata(p.pid);
  return {
    pid: p.pid,
    name: p.command,
    port: p.port,
    protocol: p.protocol,
    user: p.user,
    cpuPercent: meta.cpuPercent,
    memoryBytes: meta.memoryBytes,
    startTime: meta.startTime,
    path: meta.path,
    cwd: meta.cwd,
  };
}

async function main() {
  const flags = parseArgs(Bun.argv);
  const filterPorts = flags.ports ? parsePorts(flags.ports) : null;
  const platform = getPlatformAdapter();

  let processes = platform.getListeningProcesses();

  if (filterPorts && filterPorts.length > 0) {
    const portSet = new Set(filterPorts);
    processes = processes.filter((p) => portSet.has(p.port));
  }

  // Sort by port
  processes.sort((a, b) => a.port - b.port);

  // --json mode: output JSON and exit (no TUI)
  if (flags.json) {
    const output = processes.map(toJsonOutput);
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  }

  if (processes.length === 0) {
    if (filterPorts && filterPorts.length > 0) {
      const portDisplay =
        filterPorts.length === 1
          ? `port ${filterPorts[0]}`
          : `ports ${filterPorts.join(", ")}`;
      console.log(`No process found listening on ${portDisplay}`);
    } else {
      console.log("No listening TCP processes found");
    }
    process.exit(0);
  }

  // --kill mode: kill all matching processes without interactive selection
  if (flags.kill) {
    await handleKillMode(processes, flags.force, flags.murder, flags.ports);
    return;
  }

  // Interactive mode

  // Fetch metadata for all processes upfront
  const metadataMap = fetchAllMetadata(processes);

  console.log(
    `\nFound ${processes.length} listening process${processes.length > 1 ? "es" : ""} \x1b[2m(q to quit)\x1b[0m\n`,
  );
  console.log(`\x1b[2m${getTableHeader()}\x1b[0m`);

  const pageSize = getPageSize();
  const { cleanup, controller } = setupQuitHandler();

  let selectedPid: number;
  let selectedProcess: ProcessInfo;

  try {
    // Show the list and let user pick
    selectedPid = await select(
      {
        message: "Select a process to kill:",
        pageSize,
        choices: processes.map((p) => {
          const meta = metadataMap.get(p.pid)!;
          return {
            name: formatProcessRow(p, meta.cwd),
            value: p.pid,
            description: formatProcessDescription(meta),
          };
        }),
      },
      { signal: controller.signal },
    );

    selectedProcess = processes.find((p) => p.pid === selectedPid)!;

    // Ask for kill method
    const signal = await select(
      {
        message: `Kill ${selectedProcess.command} (PID ${selectedPid}) with:`,
        pageSize: 2,
        choices: [
          {
            name: "SIGTERM (gentle - allows cleanup)",
            value: "SIGTERM" as const,
          },
          { name: "SIGKILL (force - immediate)", value: "SIGKILL" as const },
        ],
      },
      { signal: controller.signal },
    );

    cleanup();

    platform.killProcess(selectedPid, signal);
    console.log(
      `\nSent ${signal} to PID ${selectedPid} (${selectedProcess.command} on port ${selectedProcess.port})`,
    );
  } catch (err: any) {
    cleanup();

    const isAbortError =
      err instanceof ExitPromptError ||
      err.name === "AbortError" ||
      err.code === "ABORT_ERR" ||
      (typeof err.message === "string" &&
        err.message.toLowerCase().includes("abort"));

    if (isAbortError) {
      // User pressed Ctrl+C, ESC, or 'q'
      console.log("\nCancelled");
      process.exit(0);
    }
    if (err.code === "EPERM") {
      console.error(
        `\nPermission denied. Try: sudo offmyport ${flags.ports || ""}`,
      );
    } else if (err.code === "ESRCH") {
      console.error(`\nProcess no longer exists`);
    } else {
      console.error(`\nFailed to kill process: ${err.message}`);
    }
    process.exit(1);
  }
}

/**
 * Handle --kill mode: kill all matching processes with optional confirmation.
 */
export async function handleKillMode(
  processes: ProcessInfo[],
  force: boolean,
  murder: boolean,
  portArg: string | null,
): Promise<void> {
  const signal: "SIGTERM" | "SIGKILL" = murder ? "SIGKILL" : "SIGTERM";
  const platform = getPlatformAdapter();

  // Display what will be killed
  const metadataMap = fetchAllMetadata(processes);

  console.log(`\nProcesses to kill (${processes.length}):\n`);
  console.log(`\x1b[2m${getTableHeader()}\x1b[0m`);
  for (const p of processes) {
    const meta = metadataMap.get(p.pid)!;
    console.log(`  ${formatProcessRow(p, meta.cwd)}`);
  }
  console.log();

  // Require confirmation unless --force is set
  if (!force) {
    try {
      const confirmed = await confirm({
        message: `Kill ${processes.length} process${processes.length > 1 ? "es" : ""}?`,
        default: false,
      });

      if (!confirmed) {
        console.log("Cancelled");
        process.exit(0);
      }
    } catch (err: any) {
      const isAbortError =
        err instanceof ExitPromptError ||
        err.name === "AbortError" ||
        err.code === "ABORT_ERR" ||
        (typeof err.message === "string" &&
          err.message.toLowerCase().includes("abort"));

      if (isAbortError) {
        console.log("\nCancelled");
        process.exit(0);
      }
      throw err;
    }
  }

  // Kill all processes
  let killed = 0;
  let failed = 0;

  for (const p of processes) {
    try {
      platform.killProcess(p.pid, signal);
      if (murder) {
        console.log(
          `Process ${p.command} \x1b[91mELIMINATED\x1b[0m! 👁️👅👁️ 🔪`,
        );
      } else {
        console.log(`Killed PID ${p.pid} (${p.command} on port ${p.port})`);
      }
      killed++;
    } catch (err: any) {
      if (err.code === "EPERM") {
        console.error(
          `Permission denied for PID ${p.pid}. Try: sudo offmyport ${portArg || ""} --kill`,
        );
      } else if (err.code === "ESRCH") {
        console.error(`PID ${p.pid} no longer exists`);
      } else {
        console.error(`Failed to kill PID ${p.pid}: ${err.message}`);
      }
      failed++;
    }
  }

  console.log(
    `\nKilled ${killed} process${killed !== 1 ? "es" : ""}${failed > 0 ? `, ${failed} failed` : ""}`,
  );

  if (failed > 0) {
    process.exit(1);
  }
}

// Only run when executed directly (not when imported for testing)
if (import.meta.main) {
  main().catch((err) => {
    if (err instanceof ExitPromptError) {
      console.log("\nCancelled");
      process.exit(0);
    }
    console.error(err);
    process.exit(1);
  });
}
