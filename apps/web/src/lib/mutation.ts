import { toast } from "sonner";

/**
 * Wraps a server function call with success/error toasts.
 * Use this for all mutation actions to provide consistent user feedback.
 *
 * @example
 * ```ts
 * await runMutation(() => confirmDuplicateServerFn({ id }), {
 *   success: "Duplicate confirmed",
 * });
 * ```
 */
export async function runMutation<T>(
  fn: () => Promise<T>,
  opts: { success: string; error?: string },
): Promise<T | null> {
  try {
    const result = await fn();
    toast.success(opts.success);
    return result;
  } catch (e) {
    toast.error(
      opts.error ?? "Something went wrong",
      e instanceof Error ? { description: e.message } : undefined,
    );
    return null;
  }
}
