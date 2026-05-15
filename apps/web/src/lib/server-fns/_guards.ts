export async function ownerOnly() {
  const { requireOwner } = await import("../auth-server");
  return requireOwner();
}

export async function authenticatedOnly() {
  const { requireAuthenticated } = await import("../auth-server");
  return requireAuthenticated();
}
