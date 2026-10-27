# Backscratcher

A read-only visualizer for the local markdown issue tracker defined by Matt Pocock's skills, where specs and tickets live as markdown files inside a repo.

## Language

**Project**:
A folder the dev has added to the app, usually a repo root, whose tickets the app displays.
_Avoid_: Workspace, repo

**Tracker folder**:
The folder inside a Project that holds its Features, `.scratch/` unless the dev overrides it.
_Avoid_: Scratch folder, issues folder

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
Where a Ticket stands, as one of the five triage roles, done, or another value the app shows as written.
_Avoid_: State, label, stage

**Referenced PR**:
A GitHub pull request that a Spec or Ticket names explicitly; the reference alone does not mean the PR implements it.
_Avoid_: Linked PR, implementation PR

**Blocker**:
A Ticket in the same Feature that must be done before another Ticket can start.
_Avoid_: Dependency, prerequisite
