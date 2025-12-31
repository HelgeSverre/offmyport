# offmyport 🔪

[![npm version](https://img.shields.io/npm/v/offmyport.svg)](https://www.npmjs.com/package/offmyport)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)

Interactive CLI tool to find and kill processes by port. No more memorizing `lsof -i :8080` or `netstat` flags.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [CLI Reference](#cli-reference)
- [Requirements](#requirements)
- [License](#license)

## Installation

```bash
# Using bun (recommended)
bun install -g offmyport

# Using npm
npm install -g offmyport

# Run without installing
npx offmyport
```

### Install from Source

```shell
git clone https://github.com/HelgeSverre/offmyport.git
cd offmyport

# Install dependencies and make it accessible globally
bun install
bun link

```

## Usage

```shell
# List all listening ports, pick one to kill
offmyport

# Filter to a specific port
offmyport 8080

# Filter multiple ports (comma-separated)
offmyport 80,443,8080

# Filter port ranges (inclusive)
offmyport 3000-3005

# Mix and match
offmyport 80,443,3000-3005
```

### Non-Interactive Mode

```shell
# Kill all processes on port(s) with confirmation prompt
offmyport 3000 --kill

# Skip confirmation (use with caution)
offmyport 3000 --kill --force

# Shorthand flags
offmyport 3000 -k -f
```

### JSON Output

```shell
# Output process info as JSON (no TUI)
offmyport --json

# Filter and output as JSON
offmyport 3000-3005 --json
```

## Features

- Lists all TCP listening ports with process info
- Interactive selection with arrow keys
- Choose between SIGTERM (gentle) or SIGKILL (force)
- Filter by single port, multiple ports, or port ranges
- Non-interactive mode with `--kill` for scripting
- JSON output with `--json` for scripting and piping
- Press `q` to quit during selection
- Graceful cancellation with Ctrl+C or ESC

## Example

### Interactive Mode

```shell
$ offmyport 3000

Found 1 listening process (q to quit)

? Select a process to kill:
❯ Port  3000 │ node            │ PID 12345 │ user

? Kill node (PID 12345) with:
❯ SIGTERM (gentle - allows cleanup)
  SIGKILL (force - immediate)

Sent SIGTERM to PID 12345 (node on port 3000)
```

### Kill Mode

```shell
$ offmyport 3000-3005 --kill

Processes to kill (3):

  Port  3000 │ node            │ PID 12345 │ user
  Port  3001 │ python          │ PID 12346 │ user
  Port  3002 │ ruby            │ PID 12347 │ user

? Kill 3 processes? (y/N)
```

### JSON Output

```
$ offmyport 3000 --json
[
  {
    "pid": 12345,
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

## CLI Reference

| Flag        | Shorthand | Description                                    |
| ----------- | --------- | ---------------------------------------------- |
| `--json`    |           | Output as JSON (no TUI, for scripting)         |
| `--kill`    | `-k`      | Non-interactive mode, kills matching processes |
| `--force`   | `-f`      | Skip confirmation prompt (use with `--kill`)   |
| `--version` | `-v`      | Show version number                            |
| `--help`    | `-h`      | Show help                                      |

## Requirements

- **macOS**: Works out of the box (uses `lsof`)
- **Linux**: Uses `lsof` or falls back to `ss` (from iproute2)
- **Windows**: Requires PowerShell 5.0+ (uses `Get-NetTCPConnection`)
- Node.js 18+ or Bun

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
