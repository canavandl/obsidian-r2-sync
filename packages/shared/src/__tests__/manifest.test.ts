import { describe, it, expect, vi } from "vitest";
import { diffManifests, applyDiffToManifest } from "../manifest.js";
import type { FileEntry, SyncManifest, DiffResult } from "../types.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function entry(
  path: string,
  hash: string,
  overrides?: Partial<FileEntry>,
): FileEntry {
  return {
    path,
    hash,
    mtime: 1000,
    size: 100,
    lastModifiedBy: "device-a",
    ...overrides,
  };
}

function manifest(files: Record<string, FileEntry>): SyncManifest {
  return { files, lastUpdated: "2024-01-01T00:00:00.000Z", lastUpdatedBy: "device-a" };
}

const EMPTY: SyncManifest = manifest({});

/* ------------------------------------------------------------------ */
/*  diffManifests                                                     */
/* ------------------------------------------------------------------ */

describe("diffManifests", () => {
  it("detects a new local file → toUpload", () => {
    const local = manifest({ "a.md": entry("a.md", "aaa") });
    const result = diffManifests(local, EMPTY, EMPTY);

    expect(result.toUpload).toHaveLength(1);
    expect(result.toUpload[0]!.path).toBe("a.md");
    expect(result.toDownload).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("detects a new remote file → toDownload", () => {
    const remote = manifest({ "b.md": entry("b.md", "bbb") });
    const result = diffManifests(EMPTY, remote, EMPTY);

    expect(result.toDownload).toHaveLength(1);
    expect(result.toDownload[0]!.path).toBe("b.md");
    expect(result.toUpload).toHaveLength(0);
  });

  it("accepts remote deletion when local is unmodified → toDeleteLocal", () => {
    const e = entry("a.md", "aaa");
    const base = manifest({ "a.md": e });
    const local = manifest({ "a.md": e }); // unchanged
    const remote = manifest({}); // deleted

    const result = diffManifests(local, remote, base);
    expect(result.toDeleteLocal).toContain("a.md");
    expect(result.conflicts).toHaveLength(0);
  });

  it("conflicts when deleted remotely but modified locally", () => {
    const base = manifest({ "a.md": entry("a.md", "aaa") });
    const local = manifest({ "a.md": entry("a.md", "aaa-modified") });
    const remote = manifest({}); // deleted

    const result = diffManifests(local, remote, base);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.path).toBe("a.md");
  });

  it("accepts local deletion when remote is unmodified → toDeleteRemote", () => {
    const e = entry("a.md", "aaa");
    const base = manifest({ "a.md": e });
    const local = manifest({}); // deleted
    const remote = manifest({ "a.md": e }); // unchanged

    const result = diffManifests(local, remote, base);
    expect(result.toDeleteRemote).toContain("a.md");
    expect(result.conflicts).toHaveLength(0);
  });

  it("conflicts when deleted locally but modified remotely", () => {
    const base = manifest({ "a.md": entry("a.md", "aaa") });
    const local = manifest({}); // deleted
    const remote = manifest({ "a.md": entry("a.md", "aaa-modified") });

    const result = diffManifests(local, remote, base);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.path).toBe("a.md");
  });

  it("does nothing when both sides have the same hash", () => {
    const e = entry("a.md", "same");
    const result = diffManifests(manifest({ "a.md": e }), manifest({ "a.md": e }), EMPTY);

    expect(result.toUpload).toHaveLength(0);
    expect(result.toDownload).toHaveLength(0);
    expect(result.toDeleteLocal).toHaveLength(0);
    expect(result.toDeleteRemote).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("uploads when only local changed (with base)", () => {
    const base = manifest({ "a.md": entry("a.md", "old") });
    const local = manifest({ "a.md": entry("a.md", "new-local") });
    const remote = manifest({ "a.md": entry("a.md", "old") }); // same as base

    const result = diffManifests(local, remote, base);
    expect(result.toUpload).toHaveLength(1);
    expect(result.toUpload[0]!.hash).toBe("new-local");
  });

  it("downloads when only remote changed (with base)", () => {
    const base = manifest({ "a.md": entry("a.md", "old") });
    const local = manifest({ "a.md": entry("a.md", "old") }); // same as base
    const remote = manifest({ "a.md": entry("a.md", "new-remote") });

    const result = diffManifests(local, remote, base);
    expect(result.toDownload).toHaveLength(1);
    expect(result.toDownload[0]!.hash).toBe("new-remote");
  });

  it("conflicts when both sides changed (with base)", () => {
    const base = manifest({ "a.md": entry("a.md", "old") });
    const local = manifest({ "a.md": entry("a.md", "new-local") });
    const remote = manifest({ "a.md": entry("a.md", "new-remote") });

    const result = diffManifests(local, remote, base);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.local.hash).toBe("new-local");
    expect(result.conflicts[0]!.remote.hash).toBe("new-remote");
  });

  it("conflicts on first sync (null base) when hashes differ", () => {
    const local = manifest({ "a.md": entry("a.md", "local-hash") });
    const remote = manifest({ "a.md": entry("a.md", "remote-hash") });

    const result = diffManifests(local, remote, null);
    expect(result.conflicts).toHaveLength(1);
  });

  it("no-ops on first sync (null base) when hashes match", () => {
    const e = entry("a.md", "same");
    const result = diffManifests(manifest({ "a.md": e }), manifest({ "a.md": e }), null);

    expect(result.toUpload).toHaveLength(0);
    expect(result.toDownload).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("no-ops when file deleted on both sides", () => {
    const base = manifest({ "a.md": entry("a.md", "aaa") });
    const local = manifest({}); // deleted
    const remote = manifest({}); // deleted

    const result = diffManifests(local, remote, base);
    expect(result.toUpload).toHaveLength(0);
    expect(result.toDownload).toHaveLength(0);
    expect(result.toDeleteLocal).toHaveLength(0);
    expect(result.toDeleteRemote).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("handles mixed operations across multiple files", () => {
    const base = manifest({
      "keep.md": entry("keep.md", "same"),
      "changed-local.md": entry("changed-local.md", "old"),
      "changed-remote.md": entry("changed-remote.md", "old"),
      "deleted-remote.md": entry("deleted-remote.md", "old"),
    });
    const local = manifest({
      "keep.md": entry("keep.md", "same"),
      "changed-local.md": entry("changed-local.md", "new"),
      "changed-remote.md": entry("changed-remote.md", "old"),
      "deleted-remote.md": entry("deleted-remote.md", "old"), // not modified
      "new-local.md": entry("new-local.md", "brand-new"),
    });
    const remote = manifest({
      "keep.md": entry("keep.md", "same"),
      "changed-local.md": entry("changed-local.md", "old"),
      "changed-remote.md": entry("changed-remote.md", "new"),
      // deleted-remote.md absent
      "new-remote.md": entry("new-remote.md", "brand-new"),
    });

    const result = diffManifests(local, remote, base);

    expect(result.toUpload.map((e) => e.path)).toContain("changed-local.md");
    expect(result.toUpload.map((e) => e.path)).toContain("new-local.md");
    expect(result.toDownload.map((e) => e.path)).toContain("changed-remote.md");
    expect(result.toDownload.map((e) => e.path)).toContain("new-remote.md");
    expect(result.toDeleteLocal).toContain("deleted-remote.md");
    expect(result.conflicts).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  applyDiffToManifest                                               */
/* ------------------------------------------------------------------ */

describe("applyDiffToManifest", () => {
  it("applies uploads, downloads, and deletions", () => {
    const base = manifest({
      "existing.md": entry("existing.md", "old"),
      "to-delete-remote.md": entry("to-delete-remote.md", "x"),
      "to-delete-local.md": entry("to-delete-local.md", "y"),
    });

    const diff: DiffResult = {
      toUpload: [entry("uploaded.md", "u-hash")],
      toDownload: [entry("downloaded.md", "d-hash")],
      toDeleteRemote: ["to-delete-remote.md"],
      toDeleteLocal: ["to-delete-local.md"],
      conflicts: [],
    };

    const result = applyDiffToManifest(base, diff, "device-b");

    // Uploads and downloads applied
    expect(result.files["uploaded.md"]).toBeDefined();
    expect(result.files["uploaded.md"]!.hash).toBe("u-hash");
    expect(result.files["downloaded.md"]).toBeDefined();
    expect(result.files["downloaded.md"]!.hash).toBe("d-hash");

    // Deletions applied
    expect(result.files["to-delete-remote.md"]).toBeUndefined();
    expect(result.files["to-delete-local.md"]).toBeUndefined();

    // Existing file preserved
    expect(result.files["existing.md"]).toBeDefined();
  });

  it("sets deviceId and timestamp", () => {
    const result = applyDiffToManifest(EMPTY, {
      toUpload: [],
      toDownload: [],
      toDeleteRemote: [],
      toDeleteLocal: [],
      conflicts: [],
    }, "device-x");

    expect(result.lastUpdatedBy).toBe("device-x");
    expect(result.lastUpdated).toBeTruthy();
    // Should be a valid ISO 8601 timestamp
    expect(new Date(result.lastUpdated).toISOString()).toBe(result.lastUpdated);
  });

  it("does not mutate the input manifest", () => {
    const base = manifest({ "a.md": entry("a.md", "aaa") });
    const originalFiles = { ...base.files };

    applyDiffToManifest(base, {
      toUpload: [entry("new.md", "nnn")],
      toDownload: [],
      toDeleteRemote: ["a.md"],
      toDeleteLocal: [],
      conflicts: [],
    }, "device-b");

    // Original manifest should be unchanged
    expect(base.files).toEqual(originalFiles);
  });
});
