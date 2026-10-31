import { type ExecFileException, execFile } from "node:child_process";
import type { PrLookup, PullRequest, PullRequestRef } from "../project-reader/project-reader.ts";

type IssueOrPullRequest = {
  __typename: "PullRequest" | "Issue";
  title?: string;
  state?: "OPEN" | "CLOSED" | "MERGED";
  isDraft?: boolean;
  url?: string;
} | null;

type GraphqlResponse = {
  data?: Record<string, { issueOrPullRequest: IssueOrPullRequest } | null>;
};

type GhResult = { stdout: string; stderr: string; error: ExecFileException | null };

const GH_TIMEOUT_MS = 15_000;

function queryFor(refs: PullRequestRef[]): string {
  const fields = refs.map(({ repo, number }, index) => {
    const [owner, name] = repo.split("/");
    return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { issueOrPullRequest(number: ${number}) { __typename ... on PullRequest { title state isDraft url } } }`;
  });
  return `query { ${fields.join(" ")} }`;
}

function gh(args: string[]): Promise<GhResult> {
  return new Promise((resolve) => {
    execFile("gh", args, { timeout: GH_TIMEOUT_MS }, (error, stdout, stderr) =>
      resolve({ stdout, stderr, error }),
    );
  });
}

function failureMessage({ stderr, error }: GhResult): string {
  if (error?.code === "ENOENT") return "the gh CLI is not installed";
  return stderr.trim() || error?.message || "gh returned no data";
}

function parse(result: GhResult): GraphqlResponse {
  try {
    return JSON.parse(result.stdout) as GraphqlResponse;
  } catch {
    throw new Error(failureMessage(result));
  }
}

function stateOf(node: NonNullable<IssueOrPullRequest>): PullRequest["state"] {
  if (node.state === "MERGED") return "merged";
  if (node.state === "CLOSED") return "closed";
  return node.isDraft ? "draft" : "open";
}

export const ghPrLookup: PrLookup = async (refs) => {
  const result = await gh(["api", "graphql", "-f", `query=${queryFor(refs)}`]);
  const { data } = parse(result);
  if (data === undefined) throw new Error(failureMessage(result));
  return refs.flatMap((ref, index) => {
    const node = data[`r${index}`]?.issueOrPullRequest;
    if (node?.__typename !== "PullRequest") return [];
    return [{ ...ref, title: node.title ?? "", state: stateOf(node), url: node.url ?? "" }];
  });
};
