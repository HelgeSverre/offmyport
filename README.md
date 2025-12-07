# offmyport

Interactive CLI tool to find and kill processes by port. No more memorizing `lsof` flags.

## Installation

```bash
# npm
npm install -g offmyport

# bun
bun install -g offmyport

# npx (no install)
npx offmyport
```

## Usage

```bash
# List all listening ports, pick one to kill
offmyport

# Pre-filter to a specific port
offmyport 8080
```

## Features

- Lists all TCP listening ports with process info
- Interactive selection with arrow keys
- Choose between SIGTERM (gentle) or SIGKILL (force)
- Pre-filter by port number
- Graceful cancellation with Ctrl+C or ESC

## Example

```
$ offmyport 3000

Found 1 listening process:

? Select a process to kill:
❯ Port  3000 │ node            │ PID 12345 │ user

? Kill node (PID 12345) with:
❯ SIGTERM (gentle - allows cleanup)
  SIGKILL (force - immediate)

Sent SIGTERM to PID 12345 (node on port 3000)
```

## Requirements

- macOS or Linux (uses `lsof`)
- Node.js 18+ or Bun

## License

MIT
