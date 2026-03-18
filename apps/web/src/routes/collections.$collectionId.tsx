import { useState } from "react";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentUserServerFn } from "../lib/auth-client";
import {
  createDeleteCollectionAction,
  createNavigateToCollections,
  createRenameCollectionAction,
  createTextInputChangeHandler,
} from "../lib/collection-route-helpers";
import { createCollectionMutationHandler } from "../lib/library-route-actions";
import {
  deleteCollectionServerFn,
  getCollectionDetailServerFn,
  renameCollectionServerFn,
} from "../lib/library-server";

export async function renameCollectionById(
  renameCollection: (input: { data: { collectionId: string; name: string } }) => Promise<unknown>,
  collectionId: string,
  name: string,
) {
  await renameCollection({
    data: {
      collectionId,
      name: name.trim(),
    },
  });
}

export async function deleteCollectionById(
  deleteCollection: (input: { data: { collectionId: string } }) => Promise<unknown>,
  collectionId: string,
) {
  await deleteCollection({
    data: {
      collectionId,
    },
  });
}

export const Route = createFileRoute("/collections/$collectionId")({
  loader: async ({ params, serverContext }) => {
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

    const collection = await getCollectionDetailServerFn({
      data: {
        collectionId: params.collectionId,
      },
    });

    if (!collection) {
      throw new Error("Collection not found");
    }

    return { collection, user };
  },
  component: CollectionDetailRoute,
});

export function CollectionDetailRoute() {
  const { collection } = Route.useLoaderData();
  const deleteCollection = useServerFn(deleteCollectionServerFn);
  const renameCollection = useServerFn(renameCollectionServerFn);
  const router = useRouter();
  const [name, setName] = useState(collection.name);
  const [pending, setPending] = useState(false);
  const handleNameChange = createTextInputChangeHandler(setName);
  const handleRename = createCollectionMutationHandler({
    action: createRenameCollectionAction(
      renameCollectionById.bind(null, renameCollection),
      collection.id,
      name,
    ),
    router,
    setPending,
  });
  const handleDelete = createCollectionMutationHandler({
    action: createDeleteCollectionAction(
      deleteCollectionById.bind(null, deleteCollection),
      collection.id,
    ),
    onSuccess: createNavigateToCollections(router.navigate),
    router,
    setPending,
  });

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{collection.name}</h1>
          <p className="text-sm text-gray-600">
            {collection.itemCount} item{collection.itemCount === 1 ? "" : "s"} on this shelf.
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link to="/collections">Collections</Link>
          <Link to="/">Home</Link>
        </nav>
      </header>

      <section className="mb-6 rounded border border-gray-200 p-4">
        <p className="mb-3 font-medium">Shelf settings</p>
        <div className="mb-3 flex gap-3">
          <input
            className="flex-1 rounded border border-gray-300 px-3 py-2"
            onChange={handleNameChange}
            type="text"
            value={name}
          />
          <button
            disabled={pending || name.trim().length === 0 || name.trim() === collection.name}
            onClick={handleRename}
            type="button"
          >
            Rename
          </button>
        </div>
        <button
          disabled={pending}
          onClick={handleDelete}
          type="button"
        >
          Delete shelf
        </button>
      </section>

      <section className="space-y-4">
        {collection.works.map((work) => (
          <article key={work.id} className="rounded border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{work.titleDisplay}</p>
                <p className="text-sm text-gray-600">{work.id}</p>
              </div>
              <Link className="text-sm underline" to="/works/$workId" params={{ workId: work.id }}>
                Open work
              </Link>
            </div>
          </article>
        ))}

        {collection.works.length === 0 ? (
          <p className="text-sm text-gray-600">This shelf is empty.</p>
        ) : null}
      </section>
    </main>
  );
}
