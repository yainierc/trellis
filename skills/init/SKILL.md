---
name: init
description: Adopt Trellis in this repository — detect the stack, write .trellis/profile.yml with build/test/lint commands that are verified to actually run, and create the specs, contracts and decisions directories. Use when the user says "adopt trellis here", "set up trellis", "initialise trellis in this project", "wire this repo to trellis", or asks how to start using the plugin in a project.
---

# Adopt Trellis in this repository

Trellis does nothing in a repository until that repository opts in. Opting in means one file:
`.trellis/profile.yml`. Your job is to write it correctly, and correctly means **every command in it
has been run and observed to work** — not inferred from the presence of a file.

A profile full of plausible commands that fail is worse than an empty one. The Stop gate runs these
on every attempt to close a session; a wrong command there marks healthy work `blocked` and sends the
human hunting for a bug that is in the config.

## Steps

### 1. Refuse to guess about an existing profile

If `.trellis/profile.yml` already exists, **stop and show the user what is in it.** Ask whether to
leave it, fill only the `~` fields, or replace it. Overwriting a profile someone tuned by hand is a
silent regression of their work.

### 2. Read the repository before deciding anything

Look for what is actually there:

| Signal | Likely stack |
|---|---|
| `*.sln`, `*.csproj` | .NET |
| `angular.json` | Angular |
| `package.json` | Node — read its `scripts` block, do not assume |
| `*.bicep`, `main.bicep` | Bicep / Azure |
| `pyproject.toml`, `requirements.txt` | Python |

`package.json` scripts are the single best source of truth in any JS repo: the human already wrote
the commands there, so use theirs instead of inventing `npm test`.

Also read the default branch (`git symbolic-ref refs/remotes/origin/HEAD`, falling back to the
current branch) rather than assuming `main`.

### 2b. If there is no code yet, say so and set up for that

A folder holding requirement documents, notes and nothing executable is a perfectly good Trellis
repository, and it is the phase where the framework has most to offer. **Do not treat it as a
failure to detect a stack.**

When none of the signals above match and there is no source tree:

- Set every command to `~`, with the reason stated: there is nothing to build or test **yet**. This
  is the declared-`none` rule, not an empty profile.
- Create `docs/specs/` and `docs/adr/` first. Those are the artifacts that matter now; `docs/contracts/`
  can exist and stay empty.
- Point out that `/trellis:spec` turns their requirement documents into a spec, and that it is the
  next thing to do.
- Re-run this skill once a stack exists. Say that explicitly, because a profile full of `~` is
  correct today and wrong the moment there is a build.

**Git is not required.** Verified: the write boundary, the Stop gate and the validator all work in a
folder with no repository. Only *automatic* contract resolution needs git, since it reads the branch
name — and there is an explicit substitute, covered in step 5b.

Still recommend `git init`. Not because Trellis needs it, but because specs and decision records are
documents *about decisions*, and their value is knowing when one was taken and what changed after.
Offer the command; do not run it uninvited.

### 3. Verify every candidate command before it goes in the file

For each of `build`, `test_fast`, `lint`, run it and watch what happens. A command that exits
non-zero because the code is genuinely broken is still a *valid* command — what you are checking is
that it exists and runs, not that the repo is green. Distinguish:

- **"command not found" / "no such script" / a task-runner error** → the command is wrong. Try
  another, or set `~`.
- **compiler or test failures** → the command is right. Keep it, and tell the user the repo is not
  green right now.

If a build takes longer than about two minutes, say so and ask before running it again.

`test_fast` must be the *fast* suite — unit and architecture tests that fail in under a minute.
If the only test command runs integration tests against real dependencies, that is `test_slow`, and
`test_fast` is `~`. Putting a slow suite in `test_fast` makes the Stop gate cost minutes, and a gate
that expensive gets switched off.

### 4. Write the profile

Copy `${CLAUDE_PLUGIN_ROOT}/templates/project-profile.yml` to `.trellis/profile.yml`, then fill it.

- Anything that does not exist in this repo is `~`. **That is a real answer**, not a blank: the gate
  that would have used it is skipped while saying so. Never invent a command to avoid a `~`.
- `project.code` — a short slug for this repo, used in contract ids. Propose one, confirm it.
- `git.base_branch` — what you found in step 2.
- Leave `git.branch_pattern` at `task/{id}-{slug}` unless the repo has a strong existing convention.
  **If you change it, tell the user clearly**: that pattern is how every hook works out which
  contract it is enforcing, and a branch that does not match it means no enforcement at all.
- `concurrency.ceilings` — ports a dev server holds, licence seats, a shared test database. If you
  cannot tell, write `none` and say you could not tell, so the human can correct a real ceiling.

### 5. Create the directories the profile points at

`docs/specs/`, `docs/contracts/`, `docs/adr/` — or wherever `paths:` points. Add a `.gitkeep` to
each so they survive a commit.

Check whether the scratch path (`paths.scratch`, default `tmp/`) is gitignored. If not, add it:
committed files must never reference a gitignored scratch location, and a scratch directory that is
*not* ignored gets committed by accident.

### 5b. Explain how a contract is pointed at

Every hook has to know which contract is in flight. There are two ways, and which one applies depends
on whether this repository has git:

- **With git** — the branch does it. A branch matching `branch_pattern` names the contract, and
  nothing else is needed. This is the normal path and it cannot desynchronise.
- **Without git** — a one-line file:

  ```
  echo "MY-T-01" > .trellis/active
  ```

  The hooks read it exactly as they would read a branch name. Delete the file when the contract is
  done, or the boundary keeps enforcing a contract nobody is working on.

If the repo has git, add `.trellis/active` to `.gitignore`: it is working state, not a decision, and
committing it means someone else's session inherits your active contract.

### 6. Prove it works, then report

Run the validator over the (empty) contracts directory to confirm the plugin can read the repo:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-contract.mjs" <contracts path> --all
```

Then report, in this shape:

- Which commands you filled in, and **that you ran each one**.
- Which fields are `~` and why — one line each.
- That enforcement is currently **silent**, and the two conditions that arm it: this profile, plus a
  branch matching `branch_pattern`. Say this explicitly. The most common confusion with Trellis is a
  user assuming the guardrails are active when they are on `main`.
- What to do next: `/trellis:contract` to start the first piece of work.

## Failure modes seen in the wild

| Symptom | Cause | Fix |
|---|---|---|
| Stop gate marks good work `blocked` on every close | A command in the profile does not exist; its non-zero exit reads as a failed gate | Run every command at init time. That is step 3, and it is not optional |
| Hooks never fire and nobody knows why | Branch does not match `branch_pattern` | Report the two arming conditions at the end of init, every time |
| A documents-only folder was treated as a broken repo | Init looked only for stacks | Step 2b: no code is a valid state, not a detection failure |
| Hooks never fire in a repo with no git | No branch to read and no `.trellis/active` | Step 5b — the marker file is the explicit form |
| The gate takes four minutes | An integration suite was put in `test_fast` | `test_fast` is the sub-minute suite; slow suites are `test_slow`, which runs at `pre_pr` |
| A hand-tuned profile was silently overwritten | Init assumed a fresh repo | Step 1 |
