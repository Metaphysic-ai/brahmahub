/**
 * Path display and rewriting utilities.
 *
 * Workstations mount the share at /mnt/x (symlink to /mnt/data/DGX_SHARE/SHOTGRID_SYNC).
 * DGX machines mount it at /home/jovyan/x.
 */

const LONG_PREFIX = '/mnt/data/DGX_SHARE/SHOTGRID_SYNC';
const SHORT_PREFIX = '/mnt/x';
const DGX_PREFIX = '/home/jovyan/x';

/** Normalise a path for display — collapse the long mount to /mnt/x/ */
export function displayPath(path: string): string {
  if (path.startsWith(LONG_PREFIX)) {
    return SHORT_PREFIX + path.slice(LONG_PREFIX.length);
  }
  return path;
}

/** Convert a path to its DGX equivalent (/home/jovyan/x/…) */
export function toDgxPath(path: string): string {
  const normalized = displayPath(path);
  if (normalized.startsWith(SHORT_PREFIX)) {
    return DGX_PREFIX + normalized.slice(SHORT_PREFIX.length);
  }
  return normalized;
}
