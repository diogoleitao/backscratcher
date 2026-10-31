# Backscratcher

A read-only visualizer for the local markdown issue tracker defined by Matt Pocock's skills, where specs and tickets live as markdown files inside a repo.

## Language

**Project**:
A folder the dev has added to the app, usually a repo root, whose tickets the app displays.
_Avoid_: Workspace, repo

**Project registry**:
The list of Projects the dev has added, kept in the app's own config file, each by the real absolute path of its folder.
_Avoid_: Project list, bookmarks

**Tracker folder**:
The folder inside a Project that holds its Features, `.scratch/` unless the dev overrides it.
_Avoid_: Scratch folder, issues folder

**Project-level page**:
A markdown file belonging to the Project as a whole rather than to a Feature, shown on its own page: the glossary, an ADR, a loose file at the root of the Tracker folder, or an out-of-scope record.
_Avoid_: Doc, project page

**Feature**:
One directory inside a Project's tracker folder, grouping a Spec and its Tickets under a slug.
_Avoid_: Effort, epic

**Spec**:
The document describing what a Feature should achieve, from which its Tickets are cut; a directory without one is not a Feature.
_Avoid_: PRD, plan

**Ticket**:
One numbered unit of work inside a Feature, stored as its own markdown file.
_Avoid_: Issue, task, story

**Status**:
Where a Ticket stands, as one of the five Triage roles, done, or another value the app shows as written; the app reads it from the Ticket's `Status:` line and shows the line's text as written next to it.
_Avoid_: State, label, stage

**Triage role**:
One of the five roles the skills use to triage work: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` and `wontfix`.
_Avoid_: Triage state, triage status

**Triage label**:
The string a Project's tracker uses for a Triage role, taken from its `docs/agents/triage-labels.md` and otherwise the role's own string.
_Avoid_: Tag, alias

**Referenced PR**:
A GitHub pull request that a Spec or Ticket names explicitly; the reference alone does not mean the PR implements it.
_Avoid_: Linked PR, implementation PR

**Blocker**:
A Ticket in the same Feature that must be done before another Ticket can start.
_Avoid_: Dependency, prerequisite

**Broken Blocker reference**:
An entry in a Ticket's `Blocked by:` line that names no other Ticket in the same Feature, kept and shown as broken rather than dropped.
_Avoid_: Dangling dependency, missing Blocker
