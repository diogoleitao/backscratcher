import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Feature } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { projectHref } from "./project-urls.ts";

export function FeaturePage({ project, feature }: { project: Project; feature: Feature }) {
  return (
    <>
      <p>
        <Link href={projectHref(project)}>All Features</Link>
      </p>
      <h3>{feature.slug}</h3>
      <article>
        <Markdown remarkPlugins={[remarkGfm]}>{feature.spec.source}</Markdown>
      </article>
    </>
  );
}
