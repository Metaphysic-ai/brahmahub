import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatResolution,
  relativeTime,
  pluralize,
  isNew,
} from "../formatters";

describe("formatBytes", () => {
  it("returns '0 B' for 0", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  it("formats terabytes", () => {
    expect(formatBytes(1099511627776)).toBe("1 TB");
  });
});

describe("formatDuration", () => {
  it("formats zero", () => {
    expect(formatDuration(0)).toBe("00:00");
  });

  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("00:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("02:05");
  });

  it("formats large values", () => {
    expect(formatDuration(3661)).toBe("61:01");
  });
});

describe("formatResolution", () => {
  it("formats resolution", () => {
    expect(formatResolution(1920, 1080)).toBe("1920 × 1080");
  });

  it("returns dash for null width", () => {
    expect(formatResolution(null, 1080)).toBe("—");
  });

  it("returns dash for null height", () => {
    expect(formatResolution(1920, null)).toBe("—");
  });

  it("returns dash for both null", () => {
    expect(formatResolution(null, null)).toBe("—");
  });
});

describe("relativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for recent timestamps", () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:30:00Z"));
    expect(relativeTime("2025-06-01T12:15:00Z")).toBe("15m ago");
    vi.useRealTimers();
  });

  it("returns hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T15:00:00Z"));
    expect(relativeTime("2025-06-01T12:00:00Z")).toBe("3h ago");
    vi.useRealTimers();
  });

  it("returns days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-10T12:00:00Z"));
    expect(relativeTime("2025-06-05T12:00:00Z")).toBe("5d ago");
    vi.useRealTimers();
  });

  it("returns months ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-09-01T12:00:00Z"));
    expect(relativeTime("2025-06-01T12:00:00Z")).toBe("3mo ago");
    vi.useRealTimers();
  });
});

describe("pluralize", () => {
  it("uses singular for 1", () => {
    expect(pluralize(1, "file")).toBe("1 file");
  });

  it("uses auto plural for > 1", () => {
    expect(pluralize(5, "file")).toBe("5 files");
  });

  it("uses custom plural", () => {
    expect(pluralize(3, "proxy", "proxies")).toBe("3 proxies");
  });

  it("uses auto plural for 0", () => {
    expect(pluralize(0, "file")).toBe("0 files");
  });
});

describe("isNew", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for recent timestamps (< 12h)", () => {
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    expect(isNew(recent)).toBe(true);
  });

  it("returns false for old timestamps (> 12h)", () => {
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
    expect(isNew(old)).toBe(false);
  });
});
