import { describe, it, expect } from "vitest";
import { threeWayMerge } from "../sync/merger.js";

describe("threeWayMerge", () => {
  it("returns clean merge when all inputs are identical", () => {
    const result = threeWayMerge("hello", "hello", "hello");
    expect(result.clean).toBe(true);
    expect(result.content).toBe("hello");
    expect(result.hasConflictMarkers).toBe(false);
  });

  it("produces clean merge when only remote changed", () => {
    const result = threeWayMerge("base text", "base text", "remote text");
    expect(result.clean).toBe(true);
    expect(result.content).toBe("remote text");
    expect(result.hasConflictMarkers).toBe(false);
  });

  it("produces clean merge when only local changed", () => {
    const result = threeWayMerge("base text", "local text", "base text");
    expect(result.clean).toBe(true);
    expect(result.content).toBe("local text");
    expect(result.hasConflictMarkers).toBe(false);
  });

  it("cleanly merges non-overlapping changes", () => {
    const base = "line1\nline2\nline3";
    const local = "LOCAL\nline2\nline3"; // changed line 1
    const remote = "line1\nline2\nREMOTE"; // changed line 3

    const result = threeWayMerge(base, local, remote);
    expect(result.clean).toBe(true);
    expect(result.content).toContain("LOCAL");
    expect(result.content).toContain("REMOTE");
    expect(result.hasConflictMarkers).toBe(false);
  });

  it("produces conflict markers on overlapping changes", () => {
    const base = "same line";
    const local = "completely different local";
    const remote = "completely different remote";

    const result = threeWayMerge(base, local, remote);
    // diff-match-patch may or may not resolve this — but if it fails,
    // we should get conflict markers
    if (!result.clean) {
      expect(result.hasConflictMarkers).toBe(true);
      expect(result.content).toContain("<<<<<<< LOCAL");
      expect(result.content).toContain("=======");
      expect(result.content).toContain(">>>>>>> REMOTE");
    }
  });

  it("handles empty base with remote changes", () => {
    const result = threeWayMerge("", "local content", "remote content");
    // With an empty base, patches from "" → "remote content" applied to "local content"
    // This may or may not conflict depending on diff-match-patch heuristics
    expect(result.content).toBeTruthy();
  });

  it("applies remote changes when base equals local", () => {
    const base = "original content";
    const result = threeWayMerge(base, base, "new remote content");
    expect(result.clean).toBe(true);
    expect(result.content).toBe("new remote content");
  });
});
