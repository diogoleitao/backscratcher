"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import path from "node:path";
import { projectHref } from "./project-urls.ts";
import { appRegistry, errorMessage } from "./projects.ts";

// What a form shows after its action ran: the error, if the action failed,
// with the values that were submitted so the fields keep them.
export type ActionState = { error?: string; values?: Record<string, string> };

// A value as submitted. The hidden Project path is read this way: it is the
// stored path, and a folder name may end in a space.
function submitted(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// What the dev typed or pasted, without surrounding whitespace.
function typed(formData: FormData, name: string): string {
  return submitted(formData, name).trim();
}

function failed(formData: FormData, error: string): ActionState {
  const values: Record<string, string> = {};
  for (const [name, value] of formData) {
    if (typeof value === "string") values[name] = value;
  }
  return { error, values };
}

// Runs a registry change and refreshes every page on success. Gives the
// error to show when the change fails.
async function change(formData: FormData, run: () => Promise<unknown>): Promise<ActionState> {
  try {
    await run();
  } catch (error) {
    return failed(formData, errorMessage(error));
  }
  revalidatePath("/", "layout");
  return {};
}

// The UI has no working directory, so a pasted path must be absolute.
export async function addProject(_state: ActionState, formData: FormData): Promise<ActionState> {
  const pasted = typed(formData, "path");
  if (!path.isAbsolute(pasted)) {
    return failed(formData, `${pasted || "An empty path"} is not an absolute path`);
  }
  let added = "";
  const state = await change(formData, async () => {
    added = (await appRegistry().add(pasted)).path;
  });
  if (state.error) return state;
  redirect(projectHref({ path: added }));
}

export async function removeProject(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const state = await change(formData, () => appRegistry().remove(submitted(formData, "path")));
  if (state.error) return state;
  redirect("/");
}

// Clear, or Set with an empty field, removes the override.
export async function setTrackerFolder(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectPath = submitted(formData, "path");
  const trackerFolder = formData.has("clear") ? "" : typed(formData, "trackerFolder");
  return change(formData, () =>
    trackerFolder === ""
      ? appRegistry().clearTrackerFolder(projectPath)
      : appRegistry().setTrackerFolder(projectPath, trackerFolder),
  );
}
