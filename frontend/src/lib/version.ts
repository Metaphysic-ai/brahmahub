// Frontend version info — injected at build time by vite.config.ts
// Format from git describe: v1.0.0 | v1.0.0-3-gabc1234 | abc1234 | abc1234-dirty
export const APP_VERSION = __APP_VERSION__;
export const APP_COMMIT = __APP_COMMIT__;
export const APP_BUILD_DATE = __APP_BUILD_DATE__;

interface ParsedVersion {
  tag: string | null;
  commits: number;
  hash: string;
  dirty: boolean;
  isRelease: boolean;
}

export function parseGitDescribe(version: string): ParsedVersion {
  const isDirty = version.endsWith("-dirty");
  const cleanVersion = isDirty ? version.slice(0, -6) : version;

  // v1.0.0-3-gabc1234 or v1.0.0
  const tagPattern = /^(v?\d+\.\d+\.\d+(?:-(?![0-9]+-g)[a-zA-Z0-9.]+)?)(?:-(\d+)-g([a-f0-9]+))?$/;
  const hashOnlyPattern = /^([a-f0-9]+)$/;

  const tagMatch = cleanVersion.match(tagPattern);
  if (tagMatch) {
    const [, tag, commits, hash] = tagMatch;
    return {
      tag,
      commits: commits ? Number.parseInt(commits, 10) : 0,
      hash: hash || APP_COMMIT.slice(0, 7),
      dirty: isDirty,
      isRelease: !commits && !isDirty,
    };
  }

  const hashMatch = cleanVersion.match(hashOnlyPattern);
  if (hashMatch) {
    return {
      tag: null,
      commits: 0,
      hash: hashMatch[1],
      dirty: isDirty,
      isRelease: false,
    };
  }

  return {
    tag: cleanVersion === "dev" ? null : cleanVersion,
    commits: 0,
    hash: APP_COMMIT.slice(0, 7),
    dirty: isDirty,
    isRelease: false,
  };
}

/** Short display: v1.0.0 | v1.0.0+3 | dev+abc1234 | suffix * for dirty */
export function formatVersionShort(version: string = APP_VERSION): string {
  const parsed = parseGitDescribe(version);

  let s: string;
  if (parsed.tag && parsed.commits > 0) {
    s = `${parsed.tag}+${parsed.commits}`;
  } else if (parsed.tag) {
    s = parsed.tag;
  } else if (parsed.hash && parsed.hash !== "unknown") {
    s = `dev+${parsed.hash.slice(0, 7)}`;
  } else {
    s = "dev";
  }

  return parsed.dirty ? `${s}*` : s;
}

/** Full display: v1.0.0 | v1.0.0+3.abc1234 | dev+abc1234 | suffix * for dirty */
export function formatVersion(version: string = APP_VERSION): string {
  const parsed = parseGitDescribe(version);

  let s: string;
  if (parsed.tag && parsed.commits > 0) {
    s = `${parsed.tag}+${parsed.commits}.${parsed.hash}`;
  } else if (parsed.tag) {
    s = parsed.tag;
  } else if (parsed.hash && parsed.hash !== "unknown") {
    s = `dev+${parsed.hash}`;
  } else {
    s = "dev";
  }

  return parsed.dirty ? `${s}*` : s;
}

export function isDevBuild(version: string = APP_VERSION): boolean {
  if (version === "dev" || version === "unknown") return true;
  return !parseGitDescribe(version).isRelease;
}

// ---------------------------------------------------------------------------
// Version comparison (for update detection)
// ---------------------------------------------------------------------------

/** Extract semver tuple from a version string. Returns null if not parseable. */
function parseSemver(v: string): [number, number, number] | null {
  const m = v.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number.parseInt(m[1], 10), Number.parseInt(m[2], 10), Number.parseInt(m[3], 10)];
}

/** Compare two semver strings. Returns -1 if a < b, 0 if equal, 1 if a > b. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** True if version `a` is strictly older than version `b`. */
export function isOlderVersion(a: string, b: string): boolean {
  return compareSemver(a, b) === -1;
}

/**
 * Detect meaningful version mismatch between frontend build and backend.
 * Skips comparison for dev/unknown builds and allows 10-commit drift for
 * dev builds (git-describe format like v1.0.0-3-gabc1234).
 */
export function isVersionMismatch(backendVersion: string): boolean {
  const fe = APP_VERSION;

  // Skip if either side is unknown/dev
  if (!fe || !backendVersion) return false;
  if (fe === "dev" || fe === "unknown" || fe === "0.0.0-dev") return false;
  if (backendVersion === "dev" || backendVersion === "unknown" || backendVersion === "0.0.0-dev") return false;

  // Skip if frontend is a bare commit hash (no tag reachable in git describe)
  if (!parseGitDescribe(fe).tag) return false;

  // Skip if backend is a PEP 440 dev version (e.g. 0.0.1.dev13+g...)
  if (/\.dev\d/.test(backendVersion)) return false;

  // Exact match (including git-describe suffix)
  if (fe === backendVersion) return false;

  // Compare base semver
  const feSemver = parseSemver(fe);
  const beSemver = parseSemver(backendVersion);

  // Can't compare non-semver strings meaningfully
  if (!feSemver || !beSemver) return fe !== backendVersion;

  // If base semver differs, it's a real mismatch
  if (compareSemver(fe, backendVersion) !== 0) return true;

  // Same base semver — check commit drift (v1.0.0-N-gHASH)
  const feCommits = parseGitDescribe(fe).commits;
  const beCommits = parseGitDescribe(backendVersion).commits;
  return Math.abs(feCommits - beCommits) > 10;
}
