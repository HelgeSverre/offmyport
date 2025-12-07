#!/usr/bin/env bun

import { select } from "@inquirer/prompts";
import { ExitPromptError } from "@inquirer/core";

// Calculate page size as half the terminal height (min 5, max 20)
function getPageSize(): number {
  const rows = process.stdout.rows || 24;
  return Math.min(20, Math.max(5, Math.floor(rows / 2)));
}

interface ProcessInfo {
  command: string;
  pid: number;
  user: string;
  port: number;
  protocol: string;
}

function getListeningProcesses(): ProcessInfo[] {
  const proc = Bun.spawnSync(["lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n"]);

  if (proc.exitCode !== 0) {
    console.error("Failed to run lsof. Are you on macOS/Linux?");
    process.exit(1);
  }

  const output = proc.stdout.toString();
  const lines = output.split("\n").slice(1); // skip header

  const processes: ProcessInfo[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const parts = line.split(/\s+/);
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    // node    123 user 45u IPv4 0x123  0t0      TCP  127.0.0.1:3000 (LISTEN)

    const command = parts[0];
    const pid = parseInt(parts[1], 10);
    const user = parts[2];
    const name = parts[8] || "";

    // Extract port from name like "127.0.0.1:3000" or "*:8080"
    const portMatch = name.match(/:(\d+)$/);
    if (!portMatch) continue;

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

async function main() {
  const filterPort = Bun.argv[2] ? parseInt(Bun.argv[2], 10) : null;

  let processes = getListeningProcesses();

  if (filterPort) {
    processes = processes.filter((p) => p.port === filterPort);
  }

  // Sort by port
  processes.sort((a, b) => a.port - b.port);

  if (processes.length === 0) {
    if (filterPort) {
      console.log(`No process found listening on port ${filterPort}`);
    } else {
      console.log("No listening TCP processes found");
    }
    process.exit(0);
  }

  console.log(
    `\nFound ${processes.length} listening process${processes.length > 1 ? "es" : ""}:\n`,
  );

  const pageSize = getPageSize();

  let selectedPid: number;
  let selectedProcess: ProcessInfo;

  try {
    // Show the list and let user pick
    selectedPid = await select({
      message: "Select a process to kill:",
      pageSize,
      choices: processes.map((p) => ({
        name: `Port ${p.port.toString().padStart(5)} │ ${p.command.padEnd(15)} │ PID ${p.pid} │ ${p.user}`,
        value: p.pid,
      })),
    });

    selectedProcess = processes.find((p) => p.pid === selectedPid)!;

    // Ask for kill method
    const signal = await select({
      message: `Kill ${selectedProcess.command} (PID ${selectedPid}) with:`,
      pageSize: 2,
      choices: [
        {
          name: "SIGTERM (gentle - allows cleanup)",
          value: "SIGTERM" as const,
        },
        { name: "SIGKILL (force - immediate)", value: "SIGKILL" as const },
      ],
    });

    process.kill(selectedPid, signal);
    console.log(
      `\nSent ${signal} to PID ${selectedPid} (${selectedProcess.command} on port ${selectedProcess.port})`,
    );
  } catch (err: any) {
    if (err instanceof ExitPromptError) {
      // User pressed Ctrl+C or ESC
      console.log("\nCancelled");
      process.exit(0);
    }
    if (err.code === "EPERM") {
      console.error(
        `\nPermission denied. Try: sudo offmyport ${filterPort || ""}`,
      );
    } else if (err.code === "ESRCH") {
      console.error(`\nProcess no longer exists`);
    } else {
      console.error(`\nFailed to kill process: ${err.message}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof ExitPromptError) {
    console.log("\nCancelled");
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
