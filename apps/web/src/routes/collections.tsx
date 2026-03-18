import { useState } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentUserServerFn } from "../lib/auth-client";
import {
  createCreateCollectionAction,
  createResetCallback,
  createTextInputChangeHandler,
} from "../lib/collection-route-helpers";
import { createCollectionMutationHandler } from "../lib/library-route-actions";
import {
  createCollectionServerFn,
  listCollectionsServerFn,
} from "../lib/library-server";

export async function createCollectionAndReset(
  createCollection: (input: { data: { name: string } }) => Promise<unknown>,
  name: string,
  resetName: () => void,
) {
  await createCollection({
    data: {
      name: name.trim(),
    },
  });
  resetName();
}

export const Route = createFileRoute("/collections")({
  loader: async ({ serverContext }) => {
    const authContext = serverContext as
      | {
          auth?: {
            user?: Awaited<ReturnType<typeof getCurrentUserServerFn>>;
          };
        }
      | undefined;
    const user = authContext?.auth?.user ?? (await getCurrentUserServerFn());

    if (!user) {
      throw redirect({
        href: "/auth/login",
      });
    }

    const collections = await listCollectionsServerFn();
    return { collections, user };
  },
  component: CollectionsRoute,
});

export function CollectionsRoute() {
  const { collections } = Route.useLoaderData();
  const createCollection = useServerFn(createCollectionServerFn);
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const resetName = createResetCallback(setName);
  const handleNameChange = createTextInputChangeHandler(setName);
  const handleCreate = createCollectionMutationHandler({
    action: createCreateCollectionAction(
      createCollectionAndReset.bind(null, createCollection),
      name,
      resetName,
    ),
    router,
    setPending,
  });

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Collections</h1>
          <p className="text-sm text-gray-600">Manual shelves for works in your library.</p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link to="/library">Library</Link>
          <Link to="/">Home</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>

      <section className="mb-6 rounded border border-gray-200 p-4">
        <p className="mb-3 font-medium">Create a shelf</p>
        <div className="flex gap-3">
          <input
            className="flex-1 rounded border border-gray-300 px-3 py-2"
            onChange={handleNameChange}
            placeholder="Shelf name"
            type="text"
            value={name}
          />
          <button
            disabled={pending || name.trim().length === 0}
            onClick={handleCreate}
            type="button"
          >
            Create
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {collections.map((collection) => (
          <article key={collection.id} className="rounded border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{collection.name}</p>
                <p className="text-sm text-gray-600">
                  {collection.itemCount} item{collection.itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <Link className="text-sm underline" to="/collections/$collectionId" params={{ collectionId: collection.id }}>
                Open shelf
              </Link>
            </div>
          </article>
        ))}

        {collections.length === 0 ? (
          <p className="text-sm text-gray-600">No collections yet.</p>
        ) : null}
      </section>
    </main>
  );
}
