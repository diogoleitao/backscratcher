import Link from "next/link";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Feature } from "../project-reader/project-reader.ts";
import type { Project } from "../registry/registry.ts";
import { projectHref } from "./project-urls.ts";

function dropRelativeUrl(url: string): string | undefined {
  return URL.canParse(url) || url.startsWith("#") ? defaultUrlTransform(url) : undefined;
}

export function FeaturePage({ project, feature }: { project: Project; feature: Feature }) {
  return (
    <>
      <p>
        <Link href={projectHref(project)}>All Features</Link>
      </p>
      <h3>{feature.slug}</h3>
      <article>
        <Markdown remarkPlugins={[remarkGfm]} urlTransform={dropRelativeUrl}>
          {feature.spec.source}
        </Markdown>
      </article>
    </>
  );
}
