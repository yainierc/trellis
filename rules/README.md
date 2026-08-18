# Trellis rules

Mandatory rules for humans and AI agents. **Read this index first, then the rule file for the
area you are touching.**

## The ontology — what each kind of file is

- A **rule** (`rules/*.md`) states what must be true of the artifact. Rules get **checked**.
- An **agent** (`agents/*.md`) is a role with a tool set and a stopping condition. Agents get **invoked**.
- A **skill** (`skills/*/SKILL.md`) is a recurring procedure — the *how*, written once so it is not
  re-improvised each session. Skills get **followed**.

When a skill and a rule appear to disagree, **the rule wins and the skill is the bug**.

## The enforcement ladder

A rule is enforced at the **earliest tier that can express it precisely**. Moving a rule down this
ladder is always an improvement; moving it up is a regression that must be justified.

```
1. compiler / analyzer      strictest, cheapest, fails before anything runs
2. architecture test        structural rules the compiler cannot express
3. hook                     tool-call boundaries: what may be written, run, or pushed
4. runtime test             behaviour
5. pipeline script          what only CI can see
6. skill                    procedure the model must follow
7. this rule file           the model must read and remember it
```

Tiers 1–5 are mechanical: the model cannot forget them. Tiers 6–7 depend on the model
remembering, so **a rule that lives there and could live lower is technical debt**.

## Rule files

| File | Covers |
|---|---|
| [core.md](core.md) | The non-negotiables of the framework itself: the contract, its boundaries, gates, reporting |

Stack and company rule packs are installed separately and referenced from the repo's
`project-profile.yml`. This plugin knows nothing about any company.

## Cross-cutting, always

1. **The contract is the spec.** An executor never edits its own `writes`, `constraints` or
   `done_when`. See `core.md` §2.
2. **Declared `none` is a decision; an omitted field is a gap.** Anywhere an artifact must answer a
   question and the answer is "nothing", write `none` with a reason. Silence does not distinguish
   "not applicable" from "forgot".
3. **Committed files never carry machine-specific absolute paths** or references to gitignored
   scratch locations.
4. When a rule here conflicts with older code or docs, **the rule wins — raise the conflict, do not
   silently follow the old pattern**.
