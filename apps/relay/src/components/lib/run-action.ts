import { toast } from "@foundry/ui/toast";
import { errorText } from "./error-text";

type Invalidate = () => Promise<void>;

// A row action: toast the outcome, either way.
export async function runAction(action: () => Promise<unknown>, success: string, invalidate: Invalidate, fallback?: string): Promise<void> {
  try {
    await confirmAction(action, success, invalidate);
  } catch (err) {
    toast.error(errorText(err, fallback));
  }
}

// For a confirm dialog: rejects on failure so the dialog can show the error inline.
export async function confirmAction(action: () => Promise<unknown>, success: string, invalidate: Invalidate): Promise<void> {
  await action();
  toast.success(success);
  await invalidate();
}
