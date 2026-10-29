import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

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
    <article>
      <Markdown remarkPlugins={[remarkGfm]} urlTransform={transformUrl}>
        {source}
      </Markdown>
    </article>
  );
}
