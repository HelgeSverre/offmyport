# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-12-31

### Added

- Interactive TUI for selecting and killing processes by port
- Filter by single port, multiple ports (comma-separated), or port ranges
- Choose between SIGTERM (gentle) or SIGKILL (force) termination
- `--kill` flag for non-interactive batch killing
- `--force` flag to skip confirmation prompts
- `--json` flag for JSON output (scripting/piping)
- Press `q` to quit during selection
- Graceful cancellation with Ctrl+C or ESC
- Cross-platform support (macOS, Linux, Windows)
- Extended process metadata in JSON output (CPU, memory, path, cwd)
