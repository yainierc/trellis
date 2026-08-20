# trellis — moved

**This repository is no longer the source of the Trellis plugin.**
It now lives at **[X-1FBO/GitHub_X1_Trellis](https://github.com/X-1FBO/GitHub_X1_Trellis)**, inside the
GMSTEK organisation.

Nothing installs from here any more. The marketplace in this repository declares **no plugins**, on
purpose — so pointing at it fails loudly instead of quietly serving a version that stopped being
updated on 2026-08-20.

## If you installed Trellis from here

The marketplace is still named `gmstek`, so `trellis@gmstek` does not change. Only the source does:

```
claude plugin marketplace remove gmstek
claude plugin marketplace add X-1FBO/GitHub_X1_Trellis
claude plugin install trellis@gmstek
```

Then restart the session, or run `/reload-plugins`.

**Remove the old marketplace first.** Both are named `gmstek`, so adding the new one without removing
this one leaves you pointing here.

**Check you have exactly one:**

```
claude plugin list
```

One `trellis`, version `0.17.0` or later. If you see two, you also have a development symlink at
`~/.claude/skills/trellis` — keep that one *or* the marketplace install, never both, because the hooks
fire twice.

## If `marketplace add` fails

The new repository is **private to the GMSTEK organisation**. It is fetched with your own git
credentials, so a failure is almost always authentication rather than the plugin. Check which account
is active — `gh auth status` marks it, `gh auth switch` changes it. If you hold more than one GitHub
account, this is the step that catches you.

If you have no organisation access, ask for it; there is nothing to install from here.

## Why this file is not just a redirect

A stale plugin that still works is worse than one that breaks, because it does not tell you it is
stale. That principle is now `core.md` §15 in the plugin itself — *a guardrail may fail open; it may
never fail quiet* — and this file is the same idea applied to its own migration.

---

MIT. History is preserved here; all development continues in the new repository.
