export function createTextInputChangeHandler(
  setValue: (value: string) => void,
): (event: { target: { value: string } }) => void {
  return (event) => {
    setValue(event.target.value);
  };
}

export function createResetCallback(
  resetValue: (value: string) => void,
): () => void {
  return () => {
    resetValue("");
  };
}

export function createCreateCollectionAction(
  action: (name: string, resetName: () => void) => Promise<unknown>,
  name: string,
  resetName: () => void,
): () => Promise<unknown> {
  return () => action(name, resetName);
}

export function createRenameCollectionAction(
  action: (collectionId: string, name: string) => Promise<unknown>,
  collectionId: string,
  name: string,
): () => Promise<unknown> {
  return () => action(collectionId, name);
}

export function createDeleteCollectionAction(
  action: (collectionId: string) => Promise<unknown>,
  collectionId: string,
): () => Promise<unknown> {
  return () => action(collectionId);
}

export function createNavigateToCollections(
  navigate: (input: { to: "/collections" }) => Promise<unknown>,
): () => Promise<unknown> {
  return () => navigate({ to: "/collections" });
}
