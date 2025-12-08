/**
 * Utility – safely extract an error message from an unknown thrown value.
 */
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Convert a bigint to its decimal string representation for the wasm boundary.
 */
export function u128ToString(v: bigint): string {
  return v.toString(10);
}
