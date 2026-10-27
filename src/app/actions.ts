"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import path from "node:path";
import { projectHref } from "./project-urls.ts";
import { appRegistry, errorMessage } from "./projects.ts";

// What a form shows after its action ran: the error, if the action failed.
export type ActionState = { error?: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Runs a registry change and refreshes every page on success. Gives the
// error to show when the change fails.
async function change(run: () => Promise<unknown>): Promise<ActionState> {
  try {
    await run();
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/", "layout");
  return {};
}

// The UI has no working directory, so a pasted path must be absolute.
export async function addProject(_state: ActionState, formData: FormData): Promise<ActionState> {
  const pasted = field(formData, "path");
  if (!path.isAbsolute(pasted)) {
    return { error: `${pasted || "An empty path"} is not an absolute path` };
  }
  let added = "";
  const state = await change(async () => {
    added = (await appRegistry().add(pasted)).path;
  });
  if (state.error) return state;
  redirect(projectHref({ path: added }));
}

export async function removeProject(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const state = await change(() => appRegistry().remove(field(formData, "path")));
  if (state.error) return state;
  redirect("/");
}

// Clear, or Set with an empty field, removes the override.
export async function setTrackerFolder(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectPath = field(formData, "path");
  const trackerFolder = formData.has("clear") ? "" : field(formData, "trackerFolder");
  return change(() =>
    trackerFolder === ""
      ? appRegistry().clearTrackerFolder(projectPath)
      : appRegistry().setTrackerFolder(projectPath, trackerFolder),
  );
}
