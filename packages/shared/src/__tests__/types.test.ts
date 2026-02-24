import { describe, it, expect } from "vitest";
import { parseDeviceId } from "../types.js";

describe("parseDeviceId", () => {
  it("extracts device ID from a valid token", () => {
    expect(parseDeviceId("my-device:abc123hmac")).toBe("my-device");
  });

  it("returns empty string when no colon is present", () => {
    expect(parseDeviceId("notokencolon")).toBe("");
  });

  it("returns the part before the first colon when multiple colons exist", () => {
    expect(parseDeviceId("device:hmac:extra")).toBe("device");
  });

  it("returns empty string for empty input", () => {
    expect(parseDeviceId("")).toBe("");
  });

  it("returns empty string for a leading colon", () => {
    expect(parseDeviceId(":hmaconly")).toBe("");
  });

  it("returns the device ID when token has a trailing colon", () => {
    expect(parseDeviceId("device:")).toBe("device");
  });
});
