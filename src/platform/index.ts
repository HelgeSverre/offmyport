import type { PlatformAdapter } from "./types.js";
import { UnixAdapter } from "./unix.js";
import { WindowsAdapter } from "./windows.js";

export type { PlatformAdapter, ProcessInfo, ProcessMetadata } from "./types.js";

/**
 * Get the platform-specific adapter for the current OS.
 */
export function getAdapter(): PlatformAdapter {
  if (process.platform === "win32") {
    return new WindowsAdapter();
  }
  // macOS (darwin) and Linux both use Unix adapter
  return new UnixAdapter();
}
