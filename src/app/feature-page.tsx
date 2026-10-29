import Link from "next/link";
import type { Feature } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { MarkdownArticle } from "./markdown.tsx";
import { projectHref } from "./project-urls.ts";

export function FeaturePage({ project, feature }: { project: Project; feature: Feature }) {
  return (
    <>
      <p>
        <Link href={projectHref(project)}>All Features</Link>
      </p>
      <h3>{feature.slug}</h3>
      <MarkdownArticle source={feature.spec.source} />
    </>
  );
}
