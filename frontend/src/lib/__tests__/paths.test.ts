import { describe, it, expect } from "vitest";
import { displayPath, toDgxPath } from "../paths";

describe("displayPath", () => {
  it("collapses long mount prefix to /mnt/x", () => {
    expect(
      displayPath("/mnt/data/DGX_SHARE/SHOTGRID_SYNC/projects/foo/bar.png")
    ).toBe("/mnt/x/projects/foo/bar.png");
  });

  it("leaves /mnt/x paths unchanged", () => {
    expect(displayPath("/mnt/x/projects/foo/bar.png")).toBe(
      "/mnt/x/projects/foo/bar.png"
    );
  });

  it("leaves unrelated paths unchanged", () => {
    expect(displayPath("/tmp/test/file.png")).toBe("/tmp/test/file.png");
  });

  it("handles exact prefix match", () => {
    expect(displayPath("/mnt/data/DGX_SHARE/SHOTGRID_SYNC")).toBe("/mnt/x");
  });
});

describe("toDgxPath", () => {
  it("converts long mount to DGX path", () => {
    expect(
      toDgxPath("/mnt/data/DGX_SHARE/SHOTGRID_SYNC/projects/foo/bar.png")
    ).toBe("/home/jovyan/x/projects/foo/bar.png");
  });

  it("converts /mnt/x to DGX path", () => {
    expect(toDgxPath("/mnt/x/projects/foo/bar.png")).toBe(
      "/home/jovyan/x/projects/foo/bar.png"
    );
  });

  it("leaves unrelated paths unchanged", () => {
    expect(toDgxPath("/tmp/test/file.png")).toBe("/tmp/test/file.png");
  });
});
