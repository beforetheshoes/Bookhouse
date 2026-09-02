import { describe, expect, it } from "vitest";
import { DUPLICATE_REASON_LABELS, KOBO_DEVICE_STATUS_LABELS, labelFor } from "./labels";

describe("labelFor", () => {
  it("maps known values and passes unknown ones through", () => {
    expect(labelFor(DUPLICATE_REASON_LABELS, "SAME_ISBN")).toBe("Same ISBN");
    expect(labelFor(KOBO_DEVICE_STATUS_LABELS, "REVOKED")).toBe("Revoked");
    expect(labelFor(DUPLICATE_REASON_LABELS, "NEW_REASON")).toBe("NEW_REASON");
  });
});
