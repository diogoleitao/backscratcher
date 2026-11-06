import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "./ui.tsx";

// A relative URL points into the Project's files, which the app does not
// serve, so it is dropped unless resolveRelative maps it to an app URL.
export function MarkdownArticle({
  source,
  resolveRelative,
}: {
  source: string;
  resolveRelative?: (url: string) => string | undefined;
}) {
  const transformUrl = (url: string) =>
    URL.canParse(url) || url.startsWith("#") ? defaultUrlTransform(url) : resolveRelative?.(url);
  return (
    <Card>
      <article className="prose max-w-none px-6 py-4">
        <Markdown remarkPlugins={[remarkGfm]} urlTransform={transformUrl}>
          {source}
        </Markdown>
      </article>
    </Card>
  );
}
