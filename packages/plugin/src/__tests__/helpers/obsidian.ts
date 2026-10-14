// Obsidian provides only types on npm; its runtime is supplied by the desktop app.
// Tests replace these exports with explicit mocks.
export function requestUrl(): never {
  throw new Error("requestUrl must be mocked in tests");
}

export class Modal {}
