import { DEFAULT_TRACKER_FOLDER } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { ActionForm } from "./action-form.tsx";
import { addProject, removeProject, setTrackerFolder } from "./actions.ts";

export function AddProjectForm() {
  return (
    <ActionForm action={addProject} label="Add a Project">
      <label>
        Add a Project <input name="path" placeholder="/absolute/path/to/folder" required />
      </label>{" "}
      <button type="submit">Add</button>
    </ActionForm>
  );
}

export function RemoveProjectButton({ project }: { project: Project }) {
  return (
    <ActionForm action={removeProject} label={`Remove ${project.path}`}>
      <input type="hidden" name="path" value={project.path} />
      <button type="submit">Remove</button>
    </ActionForm>
  );
}

export function TrackerFolderForm({ project }: { project: Project }) {
  return (
    <ActionForm action={setTrackerFolder} label="Tracker folder">
      <input type="hidden" name="path" value={project.path} />
      <label>
        Tracker folder{" "}
        <input
          name="trackerFolder"
          defaultValue={project.trackerFolder ?? ""}
          placeholder={`${DEFAULT_TRACKER_FOLDER} (default)`}
        />
      </label>{" "}
      <button type="submit">Set</button>{" "}
      {project.trackerFolder !== undefined && (
        <button type="submit" name="clear" value="clear">
          Clear
        </button>
      )}
    </ActionForm>
  );
}
