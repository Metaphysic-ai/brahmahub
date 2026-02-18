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
