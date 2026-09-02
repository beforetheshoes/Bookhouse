import { describe, expect, it } from "vitest";
import { getErrorCode, isFileAccessError, isTransientError } from "./fs-errors";

function withCode(code?: string): Error & { code?: string } {
  return Object.assign(new Error(code ?? "plain"), code === undefined ? {} : { code });
}

describe("fs-errors", () => {
  it("reads the Node error code", () => {
    expect(getErrorCode(withCode("ENOENT"))).toBe("ENOENT");
    expect(getErrorCode(withCode())).toBeUndefined();
  });

  it("classifies transient infrastructure errors", () => {
    expect(isTransientError(withCode("EIO"))).toBe(true);
    expect(isTransientError(withCode("ENOENT"))).toBe(false);
    expect(isTransientError(withCode())).toBe(false);
  });

  it("classifies file-access errors as anything that stops the file being read at all", () => {
    for (const code of ["ENOENT", "EACCES", "EPERM", "ENOTDIR", "EISDIR", "ENOTCONN"]) {
      expect(isFileAccessError(withCode(code)), code).toBe(true);
    }
    expect(isFileAccessError(withCode("EINVAL"))).toBe(false);
    expect(isFileAccessError(withCode())).toBe(false);
  });
});
