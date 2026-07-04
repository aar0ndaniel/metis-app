# AGENTS.md

This file is mandatory operating guidance for any AI coding agent working in this repository.

## Mandatory First Step

Before changing, creating, deleting, formatting, or moving any file, read this entire file first.

After reading this file, inspect the repository carefully before touching code:

- Read every source file that can affect the requested change.
- Read every page, route, component, utility, Electron file, script, test, and configuration file related to the app area being changed.
- For broad UI, architecture, build, data, workspace, or release changes, read the full relevant app surface before proposing edits.
- Understand the current style, naming, structure, state flow, data flow, error handling, performance choices, and test patterns.
- Check `git status --short` and treat existing modified files as user work unless explicitly told otherwise.

If the agent cannot honestly complete this intake because the repo is too large, context is limited, files are inaccessible, or the request is unclear, it must stop and tell the user what it could not inspect. It must not edit code first and explain later.

## Permission Before Changes

Do not make code changes automatically after inspection.

Before every change, ask the user what should be changed and wait for confirmation. Explain:

- Which file or files would be touched.
- What small behavior or structure change would be made.
- Why that change is needed.
- What test or check will be run after the change.

Proceed only after the user approves that specific change.

## Change Size Rules

All changes must be small, reviewable, and incremental.

- Prefer one focused change at a time.
- Do not make bulky rewrites.
- Do not refactor unrelated code.
- Do not rename, reorganize, or restyle files unless the user specifically approves it.
- Do not mix feature work, cleanup, formatting, and bug fixes in the same change.
- After each small change, summarize exactly what changed and ask before continuing.

## Project Overview

Metis is a desktop workspace for PLS-SEM models, powered by `seminr`.

The app uses:

- React 18 and TypeScript.
- Vite for frontend development and build.
- Electron for the desktop shell.
- Tailwind CSS for styling.
- Node `.mjs` scripts and static tests.
- R runtime resources under `r-api` and runtime packaging scripts.

Important areas:

- `src/` contains the React app, pages, components, hooks, utilities, and types.
- `electron/` contains Electron main and preload code.
- `tests/` contains Node-based static and behavioral tests.
- `scripts/` contains build, release, icon, and runtime support scripts.
- `build/`, `resources/`, `runtime/`, and `r-api/` support packaging and bundled runtime behavior.
- `.github/workflows/` contains release and security workflows.

## Setup Commands

Use the existing package manager lockfile. Do not change package managers without explicit user approval.

- Install dependencies: `npm install` --current version
- Start development server: `npm run dev`
- Typecheck: `npm run typecheck`
- Security audit for high severity production issues: `npm run audit:high`
- Build full desktop release: `npm run build`
- Build lite desktop release: `npm run build:lite`
- Build bundled Windows release: `npm run build:bundle`

## Testing Instructions

Before claiming a change is complete, run the smallest checks that prove the change, then run broader checks when the change touches shared behavior.

Required baseline for most code changes:

- `npm run typecheck`
- Relevant tests from `tests/`

There is no `npm test` script in `package.json` at the time this file was written. Run individual test files with Node, for example:

```powershell
node tests\workspaceHomeSidebarStatic.test.mjs
```

For a full local static test sweep in PowerShell:

```powershell
Get-ChildItem tests\*.test.mjs | ForEach-Object { node $_.FullName }
```

For release, packaging, runtime, security, or Electron changes, also inspect and run the relevant build or audit command before reporting success.

If a command cannot be run, report the exact command, the reason it was not run, and what risk remains.

## Code Style And Architecture

Follow the existing code before inventing a new pattern.

- Keep TypeScript types explicit where the surrounding code does.
- Preserve existing React component structure and naming conventions.
- Prefer existing utilities, hooks, and local helpers over new abstractions.
- Keep UI changes consistent with the app's current visual language.
- Avoid global state, new dependencies, and broad architectural changes unless the user approves.
- Keep performance-sensitive work careful: avoid unnecessary rerenders, expensive synchronous work in UI paths, and repeated parsing or filesystem work.
- Do not add comments that merely restate the code. Add comments only when they explain a non-obvious decision.

## Git And User Work Safety

- Run `git status --short` before editing.
- Never overwrite or revert user changes unless the user explicitly asks.
- If a file already has user modifications, read it carefully and make the smallest compatible edit.
- Do not run destructive git commands.
- Do not stage, commit, push, or create branches unless the user asks.

## Pull Request Expectations

Before a PR or final handoff:

- Summarize the files changed.
- Summarize the behavior changed.
- List the checks run and their results.
- List any checks not run and why.
- Mention any remaining risk or follow-up work.

## Final Rule

The agent's job is not to move fast through the repo. The job is to understand first, ask before acting, change one small thing at a time, verify it, and keep the user in control.
