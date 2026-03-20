/**
 * In-memory concurrency lock manager.
 * Ensures only one task with a given concurrencyKey runs at a time.
 * Locks are released on process restart (by design — lightweight, no persistence needed).
 */

const locks = new Map<string, string>(); // concurrencyKey → taskId

export function canAcquire(key: string, taskId: string): boolean {
  const holder = locks.get(key);
  return !holder || holder === taskId;
}

export function acquire(key: string, taskId: string): boolean {
  if (!canAcquire(key, taskId)) return false;
  locks.set(key, taskId);
  return true;
}

export function release(key: string, taskId: string): void {
  if (locks.get(key) === taskId) {
    locks.delete(key);
  }
}

export function forceRelease(key: string): void {
  locks.delete(key);
}

export function getHolder(key: string): string | undefined {
  return locks.get(key);
}
