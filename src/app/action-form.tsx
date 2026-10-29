"use client";

import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useActionState,
  useContext,
} from "react";
import type { ActionState } from "./actions.ts";

const SubmittedValues = createContext<ActionState["values"]>(undefined);

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
      <SubmittedValues value={state.values}>{children}</SubmittedValues>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}

// An input that keeps what was submitted when the action fails. React resets
// the form after every action, back to the default value, so a failed action
// makes the submitted value the default.
export function Field({
  name,
  defaultValue,
  ...props
}: ComponentProps<"input"> & { name: string }) {
  const submitted = useContext(SubmittedValues);
  return <input name={name} defaultValue={submitted?.[name] ?? defaultValue} {...props} />;
}
