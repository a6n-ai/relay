import { toast } from "@foundry/ui/toast";
import { errorText } from "./error-text";

export async function runAction(action: () => Promise<unknown>, success: string, invalidate: () => Promise<void>): Promise<void> {
  try {
    await action();
    toast.success(success);
    await invalidate();
  } catch (err) {
    toast.error(errorText(err));
  }
}
