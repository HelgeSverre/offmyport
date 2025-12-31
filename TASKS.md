# offmyport - Implementation Tasks

## Overview

This document outlines the phased implementation plan for enhancing `offmyport` with new features including multi-port support, JSON output mode, keyboard controls, and cross-platform compatibility.

---

## Phase 0: Repository Setup (No Dependencies) ✅ COMPLETE

### Task 0.1: Update GitHub Repository Metadata ✅

- [x] Add repository description: "Interactive CLI to find and kill processes on TCP ports"
- [x] Add topics (max 5): `cli`, `port`, `process-management`, `terminal`, `developer-tools`

---

## Phase 1: Multi-Port Specification (No Dependencies) ✅ COMPLETE

Implement ability to specify multiple ports with comma separation and ranges.

### Task 1.1: Create Port Parser Function ✅

- [x] Create `parsePorts(input: string): number[]` function
- [x] Support single port: `80` → `[80]`
- [x] Support comma-separated: `80,8080,3000` → `[80, 8080, 3000]`
- [x] Support ranges (inclusive): `3000-3005` → `[3000, 3001, 3002, 3003, 3004, 3005]`
- [x] Support mixed: `80,8080,3000-3005` → `[80, 8080, 3000, 3001, 3002, 3003, 3004, 3005]`
- [x] Handle invalid input gracefully (non-numeric, negative, out of range 1-65535)
- [x] Deduplicate resulting port array

### Task 1.2: Update CLI Argument Handling ✅

- [x] Modify `main()` to use new `parsePorts()` function
- [x] Update filter logic to check if port is in the parsed array
- [x] Update console output to show which ports are being filtered

### Task 1.3: Add Input Validation ✅

- [x] Validate port range (1-65535)
- [x] Provide helpful error messages for invalid input
- [x] Handle edge cases (empty string, only commas, invalid ranges like `5-3`)

---

## Phase 2: Keyboard Controls - Quit with 'q' (No Dependencies) ✅ COMPLETE

Implement ability to quit the tool by pressing 'q'.

### Task 2.1: Research @inquirer/prompts Key Handling ✅

- [x] Investigated `@inquirer/prompts` - select() supports AbortController for cancellation
- [x] Used `readline.emitKeypressEvents()` + AbortController pattern

### Task 2.2: Implement 'q' to Quit ✅

- [x] Added keyboard listener for 'q' key during process selection via `setupQuitHandler()`
- [x] Gracefully exits with "Cancelled" message (same as Ctrl+C/ESC)
- [x] Cleanup function removes keypress listener

---

## Phase 2.5: Kill Mode (--kill and --force flags) ✅ COMPLETE

Implement non-interactive kill mode for scripting.

### Task 2.5.1: Add CLI Flag Parsing ✅

- [x] Created `parseArgs()` function to parse CLI arguments
- [x] Added `--kill` / `-k` flag support
- [x] Added `--force` / `-f` flag support
- [x] Flags work in any order: `offmyport 3000 --kill` or `offmyport --kill 3000`

### Task 2.5.2: Implement Kill Mode ✅

- [x] `--kill` shows matching processes and prompts for Y/N confirmation (default: N)
- [x] `--force` skips confirmation prompt
- [x] Kills all matching processes with SIGTERM
- [x] Reports success/failure count

**Usage:**

```bash
offmyport 3000 --kill        # Asks for confirmation
offmyport 3000 --kill --force # No confirmation, kills immediately
offmyport 3000 -k -f          # Shorthand version
```

---

## Phase 3: Process Metadata Research (No Dependencies) ✅ COMPLETE

Research cross-platform process metadata collection.

### Task 3.1: Document Available Metadata per Platform ✅

#### macOS/Linux (`ps -p PID -o ...`)

Available fields (use `ps -L` to list all):
| Field | Description | JSON Key |
|-------|-------------|----------|
| `pid` | Process ID | `pid` |
| `comm` | Command name (short) | `name` |
| `%cpu` | CPU usage percentage | `cpuPercent` |
| `%mem` | Memory usage percentage | - |
| `rss` | Resident set size (KB) | `memoryBytes` (×1024) |
| `lstart` | Full start time | `startTime` |
| `args` | Full command with arguments | `path` (can extract) |

**Command:** `ps -p PID -o pid=,comm=,%cpu=,rss=,lstart=,args=`

#### Windows (PowerShell)

**Finding process by port:**

```powershell
Get-NetTCPConnection -LocalPort PORT -State Listen | Select-Object OwningProcess
Get-Process -Id PID
```

**Available via Get-Process:**
| Property | Description | JSON Key | Nullable? |
|----------|-------------|----------|-----------|
| `Id` | Process ID | `pid` | No |
| `ProcessName` | Process name | `name` | No |
| `Path` | Full executable path | `path` | **Yes** (32-bit PS → 64-bit process) |
| `CPU` | CPU time (seconds) | `cpuPercent` | **Yes** |
| `WorkingSet64` | Memory usage (bytes) | `memoryBytes` | No |
| `StartTime` | Process start time | `startTime` | No |

### Task 3.2: Define Cross-Platform Metadata Interface ✅

**Common denominator fields (implemented in `src/index.ts`):**

```typescript
// JSON output format (--json flag)
// Uses common denominator fields across macOS, Linux, and Windows
export interface ProcessJsonOutput {
  pid: number; // Always available
  name: string; // Always available (command/ProcessName)
  port: number; // Always available
  protocol: string; // Always available ("TCP")
  user: string; // Always available
  cpuPercent: number | null; // Can be null (Windows edge cases)
  memoryBytes: number | null; // Working set (Win) or RSS×1024 (Unix), null if unavailable
  startTime: string | null; // ISO 8601 format, null if unavailable
  path: string | null; // Full executable path, null if unavailable
}
```

**Nullability reasoning:**

- `cpuPercent`: Can be `null` on Windows in some edge cases
- `memoryBytes`: Should always be available, but null for safety
- `startTime`: Should always be available, but null for safety
- `path`: **Can be null** on Windows (32-bit PowerShell accessing 64-bit process)

---

## Phase 4: JSON Output Mode (Depends on Phase 3) ✅ COMPLETE

Implement `--json` flag for machine-readable output.

### Task 4.1: Add CLI Flag Parsing ✅

- [x] Parse `--json` flag from `process.argv` (via meow in `parseArgs()`)
- [x] Ensure flag works with port argument: `offmyport 80 --json` or `offmyport --json 80`

### Task 4.2: Implement Metadata Fetching Function ✅

- [x] Create `getProcessMetadata(pid: number): ProcessMetadata` function in platform adapters
- [x] On macOS/Linux: Call `ps -p PID -o %cpu=,%mem=,rss=,lstart=,args=`
- [x] Parse output into `ProcessMetadata` object
- [x] Handle cases where process no longer exists
- [x] Added `cwd` field (via lsof or /proc on Linux)

### Task 4.3: Implement JSON Output ✅

- [x] When `--json` flag is set, skip interactive prompts
- [x] Output array of process metadata objects to stdout
- [x] Use `JSON.stringify()` with proper formatting (2-space indent)
- [x] Exit immediately after output (no user interaction)

**Example output:**

```json
[
  {
    "pid": 1234,
    "name": "node",
    "port": 3000,
    "protocol": "TCP",
    "user": "helge",
    "cpuPercent": 0.5,
    "memoryBytes": 46137344,
    "startTime": "2025-12-31T10:30:15.000Z",
    "path": "/usr/local/bin/node server.js",
    "cwd": "/Users/helge/projects/myapp"
  }
]
```

---

## Phase 5: Cross-Platform Support (Depends on Phase 3, 4) ✅ COMPLETE

Make the tool work on Windows, macOS, and Linux.

### Task 5.1: Platform Detection ✅

- [x] Use `process.platform` to detect OS (`darwin`, `linux`, `win32`)
- [x] Created platform-specific adapter pattern in `src/platform/`
- [x] `PlatformAdapter` interface defined in `src/platform/types.ts`
- [x] `getAdapter()` factory function in `src/platform/index.ts`

### Task 5.2: Implement macOS/Linux Adapter ✅

- [x] Refactored `lsof` logic into `UnixAdapter` class (`src/platform/unix.ts`)
- [x] Added metadata fetching via `ps -p PID -o %cpu=,%mem=,rss=,lstart=,args=`
- [x] Added `cwd` fetching via `lsof -a -p PID -d cwd -Fn`
- [x] Works on both macOS and Linux

### Task 5.3: Implement Windows Adapter ✅

- [x] Created `WindowsAdapter` class (`src/platform/windows.ts`)
- [x] Uses PowerShell `Get-NetTCPConnection` for port lookup
- [x] Uses `Get-Process` and `Get-WmiObject` for process metadata
- [x] Handles PowerShell execution from Bun
- [x] Maps Windows-specific fields to cross-platform interface

**Windows implementation uses:**

```powershell
# Find listening processes with user info
Get-NetTCPConnection -State Listen | ForEach-Object { ... }

# Get process details with WMI for cwd
Get-Process -Id PID
Get-WmiObject Win32_Process -Filter "ProcessId = PID"
```

### Task 5.4: Implement Linux Alternative (ss command) ✅

- [x] Fallback to `ss -tulnp` when lsof not available
- [x] Parses ss output format: `LISTEN 0 128 *:3000 *:* users:(("node",pid=1234,fd=20))`
- [x] Gets user from `/proc/PID` via `stat -c %U`

### Task 5.5: Abstract Process Killing ✅

- [x] On Unix: `process.kill(pid, signal)`
- [x] On Windows: `process.kill(pid, signal)` with `taskkill` fallback
- [x] Both SIGTERM and SIGKILL supported on all platforms

---

## Phase 6: Testing & Documentation (Depends on All Phases) ✅ COMPLETE

### Task 6.1: Unit Tests ✅

- [x] Tests for `parseArgs()` function (port parsing, all flags)
- [x] Tests for `parsePorts()` function (single, ranges, mixed, edge cases, errors)
- [x] Test file: `src/index.test.ts` (61 tests)
- [x] Uses Vitest with mocking for `process.exit` and `console.error`

### Task 6.2: Manual Testing (macOS) ✅

- [x] Test JSON output (`--json` flag) - works correctly
- [x] Test port filtering with JSON (`offmyport 3000-3005 --json`)
- [x] Test kill mode with confirmation (`--kill`)
- [x] Test help and version flags
- [x] Test input validation (out of range ports, invalid input)
- [x] Test empty results (unused ports return `[]`)
- [ ] _(Deferred)_ Test on Linux/Windows - requires CI or manual testing on those platforms

### Task 6.3: Update README ✅

- [x] Document new multi-port syntax
- [x] Document `--json` flag with example output
- [x] Document 'q' key shortcut
- [x] Update platform compatibility section (macOS, Linux, Windows)
- [x] Added CLI reference table

### Task 6.4: Update package.json ✅

- [x] Bump version to 1.1.0
- [x] No new dependencies required (meow already handles CLI parsing)

---

## Dependency Graph

```
Phase 0 (Repo Setup)        ✅ ─────────────────────────────────┐
                                                                 │
Phase 1 (Multi-Port)        ✅ ─────────────────────────────────┤
                                                                 │
Phase 2 (Quit Key)          ✅ ─────────────────────────────────┤
                                                                 │
Phase 2.5 (Kill Mode)       ✅ ─────────────────────────────────┤
                                                                 ▼
Phase 3 (Metadata Research) ✅ ───┬───────────────────► Phase 6 (Testing) ✅
                                  │
                                  ▼
Phase 4 (JSON Output)       ✅ ───┤
                                  │
                                  ▼
Phase 5 (Cross-Platform)    ✅ ───┘
```

**Status Summary:**

- ✅ ALL PHASES COMPLETE
- Version: 1.2.0
- 61 unit tests passing

---

## Implementation Priority

1. **High Priority (Core Features):**
   - ✅ Phase 1: Multi-port support
   - ✅ Phase 4: JSON output

2. **Medium Priority (UX Improvements):**
   - ✅ Phase 2: Quit with 'q'
   - ✅ Phase 2.5: Kill mode (--kill, --force)
   - ✅ Phase 0: Repository metadata

3. **Lower Priority (Platform Expansion):**
   - ✅ Phase 5: Cross-platform support

4. **Testing & Documentation:**
   - ✅ Phase 6: Unit tests, manual testing, README, version 1.1.0

---

## Technical Notes

### Bun vs Node.js Considerations

- `Bun.spawnSync()` is used for subprocess execution
- For cross-platform, may need to add Node.js fallback with `child_process.spawnSync()`
- PowerShell execution on Windows: `powershell -Command "..."`

### Signal Handling on Windows

- Windows doesn't support Unix signals (SIGTERM, SIGKILL)
- Use `taskkill /PID xxx` (graceful) or `taskkill /PID xxx /F` (force)
- PowerShell: `Stop-Process -Id xxx` or `Stop-Process -Id xxx -Force`
