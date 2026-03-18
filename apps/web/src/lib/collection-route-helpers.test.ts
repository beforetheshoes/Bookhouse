import { describe, expect, it, vi } from "vitest";
import {
  createCreateCollectionAction,
  createDeleteCollectionAction,
  createNavigateToCollections,
  createRenameCollectionAction,
  createResetCallback,
  createTextInputChangeHandler,
} from "./collection-route-helpers";

describe("collection route helpers", () => {
  it("updates text inputs and resets input state", () => {
    const setValue = vi.fn();

    createTextInputChangeHandler(setValue)({ target: { value: "Favorites" } });
    createResetCallback(setValue)();

    expect(setValue).toHaveBeenNthCalledWith(1, "Favorites");
    expect(setValue).toHaveBeenNthCalledWith(2, "");
  });

  it("creates wrapped collection route actions", async () => {
    const createAction = vi.fn(async () => undefined);
    const renameAction = vi.fn(async () => undefined);
    const deleteAction = vi.fn(async () => undefined);
    const navigate = vi.fn(async () => undefined);
    const resetName = vi.fn();

    await createCreateCollectionAction(createAction, "Favorites", resetName)();
    await createRenameCollectionAction(renameAction, "collection-1", "Renamed")();
    await createDeleteCollectionAction(deleteAction, "collection-1")();
    await createNavigateToCollections(navigate)();

    expect(createAction).toHaveBeenCalledWith("Favorites", resetName);
    expect(renameAction).toHaveBeenCalledWith("collection-1", "Renamed");
    expect(deleteAction).toHaveBeenCalledWith("collection-1");
    expect(navigate).toHaveBeenCalledWith({ to: "/collections" });
  });
});
