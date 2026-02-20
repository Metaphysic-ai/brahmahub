import { describe, expect, it, vi } from "vitest";
import {
  compareSemver,
  formatVersion,
  formatVersionShort,
  isDevBuild,
  isOlderVersion,
  isVersionMismatch,
  parseGitDescribe,
} from "../version";

describe("parseGitDescribe", () => {
  it("parses a clean release tag", () => {
    expect(parseGitDescribe("v1.0.0")).toEqual({
      tag: "v1.0.0",
      commits: 0,
      hash: expect.any(String),
      dirty: false,
      isRelease: true,
    });
  });

  it("parses tag with commits after", () => {
    const result = parseGitDescribe("v1.2.3-5-gabc1234");
    expect(result.tag).toBe("v1.2.3");
    expect(result.commits).toBe(5);
    expect(result.hash).toBe("abc1234");
    expect(result.dirty).toBe(false);
    expect(result.isRelease).toBe(false);
  });

  it("parses dirty tag", () => {
    const result = parseGitDescribe("v1.0.0-dirty");
    expect(result.tag).toBe("v1.0.0");
    expect(result.dirty).toBe(true);
    expect(result.isRelease).toBe(false);
  });

  it("parses dirty tag with commits", () => {
    const result = parseGitDescribe("v1.2.3-5-gabc1234-dirty");
    expect(result.tag).toBe("v1.2.3");
    expect(result.commits).toBe(5);
    expect(result.hash).toBe("abc1234");
    expect(result.dirty).toBe(true);
  });

  it("parses bare commit hash", () => {
    const result = parseGitDescribe("abc1234");
    expect(result.tag).toBeNull();
    expect(result.hash).toBe("abc1234");
    expect(result.isRelease).toBe(false);
  });

  it("parses bare commit hash dirty", () => {
    const result = parseGitDescribe("abc1234-dirty");
    expect(result.tag).toBeNull();
    expect(result.dirty).toBe(true);
  });

  it("parses 'dev' string", () => {
    const result = parseGitDescribe("dev");
    expect(result.tag).toBeNull();
    expect(result.isRelease).toBe(false);
  });

  it("parses pre-release tag", () => {
    const result = parseGitDescribe("v1.0.0-rc.1");
    expect(result.tag).toBe("v1.0.0-rc.1");
    expect(result.commits).toBe(0);
    expect(result.isRelease).toBe(true);
  });

  it("parses pre-release tag with commits after", () => {
    const result = parseGitDescribe("v1.0.0-rc.1-3-gdef5678");
    expect(result.tag).toBe("v1.0.0-rc.1");
    expect(result.commits).toBe(3);
    expect(result.hash).toBe("def5678");
  });

  it("parses tag without v prefix", () => {
    const result = parseGitDescribe("1.0.0");
    expect(result.tag).toBe("1.0.0");
    expect(result.isRelease).toBe(true);
  });
});

describe("formatVersionShort", () => {
  it("formats release tag", () => {
    expect(formatVersionShort("v1.0.0")).toBe("v1.0.0");
  });

  it("formats tag with commits", () => {
    expect(formatVersionShort("v1.2.3-5-gabc1234")).toBe("v1.2.3+5");
  });

  it("formats bare hash as dev", () => {
    expect(formatVersionShort("abc1234")).toBe("dev+abc1234");
  });

  it("appends * for dirty builds", () => {
    expect(formatVersionShort("v1.0.0-dirty")).toBe("v1.0.0*");
  });

  it("formats dev string (uses APP_COMMIT for context)", () => {
    expect(formatVersionShort("dev")).toBe("dev+abc1234");
  });
});

describe("formatVersion", () => {
  it("formats release tag", () => {
    expect(formatVersion("v1.0.0")).toBe("v1.0.0");
  });

  it("formats tag with commits (includes hash)", () => {
    expect(formatVersion("v1.2.3-5-gabc1234")).toBe("v1.2.3+5.abc1234");
  });

  it("formats bare hash as dev", () => {
    expect(formatVersion("abc1234")).toBe("dev+abc1234");
  });
});

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });

  it("returns 0 with v prefix", () => {
    expect(compareSemver("v1.0.0", "1.0.0")).toBe(0);
  });

  it("returns -1 when a < b (major)", () => {
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
  });

  it("returns 1 when a > b (major)", () => {
    expect(compareSemver("2.0.0", "1.0.0")).toBe(1);
  });

  it("returns -1 when a < b (minor)", () => {
    expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
  });

  it("returns -1 when a < b (patch)", () => {
    expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
  });

  it("returns 0 for non-semver inputs", () => {
    expect(compareSemver("abc", "def")).toBe(0);
  });

  it("returns 0 when one side is non-semver", () => {
    expect(compareSemver("v1.0.0", "not-a-version")).toBe(0);
  });

  it("ignores git-describe suffix", () => {
    expect(compareSemver("v1.0.0-3-gabc1234", "1.0.0")).toBe(0);
  });
});

describe("isOlderVersion", () => {
  it("returns true when a is older", () => {
    expect(isOlderVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("returns false when equal", () => {
    expect(isOlderVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false when a is newer", () => {
    expect(isOlderVersion("2.0.0", "1.0.0")).toBe(false);
  });
});

describe("isDevBuild", () => {
  it("returns true for 'dev'", () => {
    expect(isDevBuild("dev")).toBe(true);
  });

  it("returns true for 'unknown'", () => {
    expect(isDevBuild("unknown")).toBe(true);
  });

  it("returns true for bare hash", () => {
    expect(isDevBuild("abc1234")).toBe(true);
  });

  it("returns true for tag with commits", () => {
    expect(isDevBuild("v1.0.0-3-gabc1234")).toBe(true);
  });

  it("returns false for clean release tag", () => {
    expect(isDevBuild("v1.0.0")).toBe(false);
  });
});

// The global __APP_VERSION__ is stubbed to "v1.0.0" in test/setup.ts
describe("isVersionMismatch", () => {
  describe("skips comparison for dev builds", () => {
    it("returns false for empty backend version", () => {
      expect(isVersionMismatch("")).toBe(false);
    });

    it("returns false when backend is 'dev'", () => {
      expect(isVersionMismatch("dev")).toBe(false);
    });

    it("returns false when backend is 'unknown'", () => {
      expect(isVersionMismatch("unknown")).toBe(false);
    });

    it("returns false when backend is '0.0.0-dev'", () => {
      expect(isVersionMismatch("0.0.0-dev")).toBe(false);
    });

    it("returns false when backend is PEP 440 dev version", () => {
      expect(isVersionMismatch("0.0.1.dev13+gabc1234def.d20260218")).toBe(false);
    });

    it("returns false when backend is PEP 440 dev (short)", () => {
      expect(isVersionMismatch("0.1.dev5+ge2baf29")).toBe(false);
    });

    it("returns false when frontend is bare hash (no tag)", () => {
      vi.stubGlobal("__APP_VERSION__", "c74522a");
      expect(isVersionMismatch("1.0.0")).toBe(false);
      vi.stubGlobal("__APP_VERSION__", "v1.0.0"); // restore
    });

    it("returns false when frontend is 'dev'", () => {
      vi.stubGlobal("__APP_VERSION__", "dev");
      expect(isVersionMismatch("1.0.0")).toBe(false);
      vi.stubGlobal("__APP_VERSION__", "v1.0.0");
    });

    it("returns false when frontend is '0.0.0-dev'", () => {
      vi.stubGlobal("__APP_VERSION__", "0.0.0-dev");
      expect(isVersionMismatch("1.0.0")).toBe(false);
      vi.stubGlobal("__APP_VERSION__", "v1.0.0");
    });
  });

  describe("production version comparison", () => {
    it("returns false when versions match exactly", () => {
      expect(isVersionMismatch("v1.0.0")).toBe(false);
    });

    it("returns false when semver matches (v prefix difference)", () => {
      expect(isVersionMismatch("1.0.0")).toBe(false);
    });

    it("returns true when backend has newer major", () => {
      expect(isVersionMismatch("2.0.0")).toBe(true);
    });

    it("returns true when backend has newer minor", () => {
      expect(isVersionMismatch("1.1.0")).toBe(true);
    });

    it("returns true when backend has newer patch", () => {
      expect(isVersionMismatch("1.0.1")).toBe(true);
    });

    it("returns true when backend has older version", () => {
      // Backend rolled back — still a mismatch
      expect(isVersionMismatch("0.9.0")).toBe(true);
    });
  });

  describe("commit drift tolerance", () => {
    it("allows small drift on same base version", () => {
      vi.stubGlobal("__APP_VERSION__", "v1.0.0-3-gabc1234");
      expect(isVersionMismatch("v1.0.0-5-gdef5678")).toBe(false); // drift = 2
      vi.stubGlobal("__APP_VERSION__", "v1.0.0");
    });

    it("flags large drift on same base version", () => {
      vi.stubGlobal("__APP_VERSION__", "v1.0.0-3-gabc1234");
      expect(isVersionMismatch("v1.0.0-15-gdef5678")).toBe(true); // drift = 12
      vi.stubGlobal("__APP_VERSION__", "v1.0.0");
    });

    it("allows drift at the boundary (10 commits)", () => {
      vi.stubGlobal("__APP_VERSION__", "v1.0.0-0-gabc1234");
      expect(isVersionMismatch("v1.0.0-10-gdef5678")).toBe(false); // drift = 10
      vi.stubGlobal("__APP_VERSION__", "v1.0.0");
    });

    it("flags drift just past the boundary (11 commits)", () => {
      vi.stubGlobal("__APP_VERSION__", "v1.0.0-0-gabc1234");
      expect(isVersionMismatch("v1.0.0-11-gdef5678")).toBe(true); // drift = 11
      vi.stubGlobal("__APP_VERSION__", "v1.0.0");
    });
  });
});
