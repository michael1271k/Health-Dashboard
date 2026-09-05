# Git conventions

## One trunk

`main` is the only long-lived branch (since 2026-09-05, W0 of
`PHASE_2_POLISH_PLAN.md`). Work happens on a short-lived wave branch —
`onyx/w<N>-<slug>`, optionally in a worktree under `.claude/worktrees/` — and
is merged back `--no-ff`, then deleted. There is no `develop`, no long-running
feature branch, and no per-track branch: those cost us a three-day-old security
fix that sat unmerged on `feature/native-migration-wave-1`.

## `[skip ci]` is retired

Netlify builds every push to `main`, and there is no other CI. Commit messages
used to carry `[skip ci]` to spare build minutes on native-only work; the tag
had to be remembered per commit, and the one time it was applied to a commit
that *did* need deploying, production served an unauthenticated API for three
days.

`netlify.toml`'s `[build] ignore` now decides instead, from the diff: a push
that touches only `native/`, `docs/`, `graphify-out/` or markdown is skipped;
anything touching `src/`, `public/`, `package.json` or `netlify.toml` deploys.
Nothing to remember, and it cannot silently withhold a web fix.

## The `merge=ours` driver is machine-local — run this once per clone

```sh
git config merge.ours.driver true
```

`.gitattributes` marks `graphify-out/**` and `native/__screenshots__/**` as
`merge=ours`, so a conflict in a generated file resolves to the target branch
instead of stopping the merge. **Git ships no built-in driver by that name** —
without the config line above the attribute is inert and the conflicts come
back. The setting lives in `.git/config`, which is not tracked, so every fresh
clone has to run it.

After a merge that touched either path, regenerate rather than trust the
result: `graphify update .` for the graph, `scripts/native-shot.sh` for the
screenshots.
