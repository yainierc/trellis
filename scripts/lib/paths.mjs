// trellis — path comparison.
//
// Every path question in the framework reduces to one rule: comparison is **prefix-aware by path
// segment, never by substring**. `src/App/` contains `src/App/Foo.cs`; `src/App.Api/` does not,
// even though the string starts the same way. Getting this wrong either serialises a backlog that
// could run in parallel, or lets two contracts write the same file at once.
//
// Shared by the validator (`writes` conflicts between contracts) and by the write-boundary hook
// (is this file inside what the contract may touch).

import { resolve, relative, sep, isAbsolute } from 'node:path'

export const norm = p => String(p).replace(/\\/g, '/').replace(/\/+$/, '')

// Symmetric: do these two declarations reach each other in either direction?
// Used for contract-vs-contract conflict detection, where neither side is the container.
export function touches (a, b) {
  a = norm(a); b = norm(b)
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/')
}

export const overlap = (A, B) => A.filter(x => B.some(y => touches(x, y)))

// Directional: does the declared entry cover this target?
// A file entry covers only itself; a directory entry covers everything beneath it.
export function covers (entry, target) {
  entry = norm(entry); target = norm(target)
  return target === entry || target.startsWith(entry + '/')
}

// Is `child` inside `parent` on this filesystem? Resolves both, so `..` cannot walk out of a
// worktree through a relative path.
export function within (parent, child) {
  const rel = relative(resolve(parent), resolve(child))
  // `rel === ''` is the directory itself. A leading `..` segment means the target escaped upwards,
  // and an absolute result means a different root entirely (another drive on Windows). Note the
  // check is on the `..` *segment*, not the prefix: a file legitimately named `..cache` is inside.
  if (rel === '') return true
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)
}

// A repo-relative, forward-slashed path, which is the form contracts are written in.
export function toRepoPath (root, absolute) {
  return norm(relative(resolve(root), resolve(absolute)).split(sep).join('/'))
}
