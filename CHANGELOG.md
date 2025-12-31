# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2025-12-31

### Added

- Comprehensive test suite with 128 tests covering platform adapters, kill mode, and utilities
- Cross-platform process abstraction layer with dedicated Unix and Windows adapter tests
- OG image generation script for website

### Changed

- Improved port parsing validation with regex pre-checks
- CI workflow now uses Vitest instead of Bun's native test runner
- CI workflow requires Node.js 22 for `@inquirer/prompts` compatibility

### Fixed

- Fixed `just test` and CI test commands to use `bun run test` (Vitest) instead of `bun test`

## [1.2.0] - 2025-12-31

### Added

- GitHub Actions workflows for CI and automated releases
- Comprehensive unit tests for CLI argument and port parsing
- Development tooling with vitest test runner
- Claude Code release command for streamlined releases

### Changed

- Refactored CLI to use meow for argument parsing
- Improved cross-platform support with dedicated Unix and Windows adapters

## [1.1.0] - 2025-12-31

### Changed

- Internal refactoring and code organization

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
