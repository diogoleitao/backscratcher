## Summary

Closes #[issue]. [One sentence: what exists now that did not before, in GLOSSARY.md terms.]

<!-- Use "Part of #[issue]." instead when the PR does not meet every acceptance criterion. -->
<!-- The smallest view that makes the point: diff of the model, routes, CLI or file tree; pseudocode for rules. One block per concern. -->

<!-- Optional, delete the ones that do not apply: -->
- **Dependencies:** [added or removed packages, and why]
- **Config file:** [new or changed keys, and whether older builds still load it]
- **Glossary:** [terms added or changed]

## Evidence

- **Before:** [failing test, command output, or what the page showed on `main`]
  **After:** [the same thing now]
- **Tests:** `npm test`: [n] passed. `npm run typecheck`: clean. New cases: [one line per test name]
- **Manual:** [commands and output from a run against a scratch config or Project, or "none"]
- **Not tested:** [parts #1 leaves untested, and parts not exercised in a browser, or "none"]

## Merge Danger

**Door:** [one-way or two-way]

[What reverting means: data to migrate, config compatibility with `main`.]

**Blast Radius:** [area: the page, command or module affected]

- [user-facing change outside the area]
- [changed contract other code relies on, such as a required field on the Project model]

**Known gaps:** [what still fails, each linked to the issue that tracks it, or "none"]

**Related:** [open PRs or issues this interacts with, and how, or "none"]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
