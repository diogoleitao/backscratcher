import { DEFAULT_TRACKER_FOLDER } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { ActionForm, Field } from "./action-form.tsx";
import { addProject, removeProject, setTrackerFolder } from "./actions.ts";
import { Button } from "./ui.tsx";

// A form's controls side by side, wrapping on a narrow window.
const INLINE_FIELDS = "flex flex-wrap items-center gap-2";
const LABEL = `${INLINE_FIELDS} text-sm font-medium`;

export function AddProjectForm() {
  return (
    <ActionForm action={addProject} label="Add a Project" className={INLINE_FIELDS}>
      <label className={LABEL}>
        Add a Project <Field name="path" placeholder="/absolute/path/to/folder" required />
      </label>
      <Button type="submit">Add</Button>
    </ActionForm>
  );
}

export function RemoveProjectButton({ project }: { project: Project }) {
  return (
    <ActionForm action={removeProject} label={`Remove ${project.path}`} className="ml-auto">
      <input type="hidden" name="path" value={project.path} />
      <Button type="submit" variant="danger">
        Remove
      </Button>
    </ActionForm>
  );
}

export function TrackerFolderForm({ project }: { project: Project }) {
  return (
    <ActionForm action={setTrackerFolder} label="Tracker folder" className={INLINE_FIELDS}>
      <input type="hidden" name="path" value={project.path} />
      <label className={LABEL}>
        Tracker folder{" "}
        <Field
          name="trackerFolder"
          defaultValue={project.trackerFolder ?? ""}
          placeholder={`${DEFAULT_TRACKER_FOLDER} (default)`}
        />
      </label>
      <Button type="submit">Set</Button>
      {project.trackerFolder !== undefined && (
        <Button type="submit" name="clear" value="clear">
          Clear
        </Button>
      )}
    </ActionForm>
  );
}
