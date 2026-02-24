import DiffMatchPatch from "diff-match-patch";

const dmp = new DiffMatchPatch();

export interface MergeResult {
  /** Whether the merge was clean (no conflicts) */
  clean: boolean;
  /** The merged content */
  content: string;
  /** If not clean, conflict markers are embedded in the content */
  hasConflictMarkers: boolean;
}

/**
 * Perform a three-way merge of text content.
 *
 * @param base   - The common ancestor content
 * @param local  - The locally modified content
 * @param remote - The remotely modified content
 * @returns MergeResult with merged content
 */
export function threeWayMerge(base: string, local: string, remote: string): MergeResult {
  // Compute patches from base → remote
  const patches = dmp.patch_make(base, remote);

  // Apply remote patches to local
  const [merged, results] = dmp.patch_apply(patches, local);

  const allApplied = results.every((r) => r);

  if (allApplied) {
    return { clean: true, content: merged, hasConflictMarkers: false };
  }

  // Some patches failed — fall back to conflict markers
  // TODO: Implement proper conflict marker insertion
  const conflictContent =
    `<<<<<<< LOCAL\n${local}\n=======\n${remote}\n>>>>>>> REMOTE\n`;

  return { clean: false, content: conflictContent, hasConflictMarkers: true };
}
