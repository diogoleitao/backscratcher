"use client";

import { type ReactNode, useActionState } from "react";
import type { ActionState } from "./actions.ts";

// A form that runs a server action and shows the error it returns.
export function ActionForm({
  action,
  label,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} aria-label={label} aria-busy={pending}>
      {children}
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
