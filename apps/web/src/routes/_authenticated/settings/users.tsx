import { useState, type SyntheticEvent } from "react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  addAllowedEmailServerFn,
  listAllowedEmailsServerFn,
  listUsersServerFn,
  removeAllowedEmailServerFn,
  removeUserServerFn,
} from "~/lib/server-fns/users";

export interface UsersLoaderData {
  users: Awaited<ReturnType<typeof listUsersServerFn>>;
  allowedEmails: Awaited<ReturnType<typeof listAllowedEmailsServerFn>>;
  currentUserId: string;
}

export const Route = createFileRoute("/_authenticated/settings/users")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { roles?: string[] } };
    if (!ctx.user?.roles?.includes("OWNER")) {
      throw redirect({ to: "/settings" });
    }
  },
  loader: async ({ context }) => {
    const ctx = context as { user?: { id: string } | null };
    const [users, allowedEmails] = await Promise.all([
      listUsersServerFn(),
      listAllowedEmailsServerFn(),
    ]);
    return {
      users,
      allowedEmails,
      currentUserId: ctx.user?.id ?? "",
    } satisfies UsersLoaderData;
  },
  component: UsersPage,
});

export function UsersPage() {
  const { users, allowedEmails, currentUserId } = Route.useLoaderData();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAddEmail(e: SyntheticEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await addAllowedEmailServerFn({ data: { email: trimmed } });
      toast.success(`Added ${trimmed} to allowlist`);
      setEmail("");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add email");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveAllowed(id: string) {
    try {
      await removeAllowedEmailServerFn({ data: { id } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  async function handleRemoveUser(userId: string) {
    try {
      await removeUserServerFn({ data: { userId } });
      toast.success("User removed");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove user");
    }
  }

  return (
    <div className="container mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground">
          Manage who can access this library.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Current users</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.email ?? "—"}</TableCell>
                <TableCell>{u.name ?? "—"}</TableCell>
                <TableCell>
                  {u.roles.map((r) => (
                    <Badge key={r} variant="secondary" className="mr-1">
                      {r}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell>
                  {u.id !== currentUserId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void handleRemoveUser(u.id);
                      }}
                      aria-label={`Remove ${u.email ?? u.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Allow-listed emails</h2>
        <form
          onSubmit={(e) => {
            void handleAddEmail(e);
          }}
          className="mb-4 flex gap-2"
        >
          <Input
            type="email"
            placeholder="viewer@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            disabled={submitting}
          />
          <Button type="submit" disabled={submitting || !email.trim()}>
            Add
          </Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {allowedEmails.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.email}</TableCell>
                <TableCell>
                  {new Date(entry.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void handleRemoveAllowed(entry.id);
                    }}
                    aria-label={`Remove ${entry.email}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
