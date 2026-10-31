import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type PullRequestRef = { repo: string; number: number };

export type PullRequest = PullRequestRef & {
  title: string;
  state: "open" | "draft" | "merged" | "closed";
  url: string;
};

export type PrLookup = (refs: PullRequestRef[]) => Promise<PullRequest[]>;

export type ReferencedPrIndex = {
  prsIn: (source: string) => PullRequest[];
  error?: string;
};

type Mention = { at: number; repo?: string; number: number };

const KEYWORD_MENTION =
  /\b(?:PRs?|Pull\s+requests?)\b(?:\*\*)?:?(?:\*\*)?:?\s*(#\d+\b(?:(?:\s*(?:,?\s*\band\b|[,&])\s*|\s+)#\d+\b)*)/gi;

const NUMBER = /#(\d+)/g;

const PULL_LINK = /(?<![\w-])github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)\b/gi;

const GITHUB_REMOTE = /(?<![\w-])github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/;

const execFileAsync = promisify(execFile);

function mentionsIn(source: string): Mention[] {
  const keywords = [...source.matchAll(KEYWORD_MENTION)].flatMap((match) =>
    [...match[1].matchAll(NUMBER)].map((number) => ({
      at: match.index,
      number: Number(number[1]),
    })),
  );
  const links = [...source.matchAll(PULL_LINK)].map((match) => ({
    at: match.index,
    repo: match[1],
    number: Number(match[2]),
  }));
  return [...keywords, ...links].sort((a, b) => a.at - b.at);
}

async function originRepo(projectPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      projectPath,
      "remote",
      "get-url",
      "origin",
    ]);
    return GITHUB_REMOTE.exec(stdout.trim())?.[1];
  } catch {
    return undefined;
  }
}

const refKey = (ref: PullRequestRef) => `${ref.repo.toLowerCase()}#${ref.number}`;

function distinct(refs: PullRequestRef[]): PullRequestRef[] {
  return [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];
}

export async function lookUpReferencedPrs(
  projectPath: string,
  sources: string[],
  lookup: PrLookup,
): Promise<ReferencedPrIndex> {
  const mentions = new Map(sources.map((source) => [source, mentionsIn(source)]));
  const needsOrigin = [...mentions.values()].flat().some((mention) => mention.repo === undefined);
  const origin = needsOrigin ? await originRepo(projectPath) : undefined;
  const refsIn = (source: string) =>
    distinct(
      (mentions.get(source) ?? []).flatMap(({ repo = origin, number }) =>
        repo === undefined ? [] : [{ repo, number }],
      ),
    );
  const refs = distinct(sources.flatMap(refsIn));
  if (refs.length === 0) return { prsIn: () => [] };
  let found: PullRequest[];
  try {
    found = await lookup(refs);
  } catch (error) {
    return { prsIn: () => [], error: (error as Error).message };
  }
  const byKey = new Map(found.map((pr) => [refKey(pr), pr]));
  return { prsIn: (source) => refsIn(source).flatMap((ref) => byKey.get(refKey(ref)) ?? []) };
}
