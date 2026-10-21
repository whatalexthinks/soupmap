---
name: Git synchronization
description: Order Git reconciliation before runtime changes when updating this imported app.
---

Finish any interrupted rebase before installing or changing a Replit runtime module.

**Why:** Runtime installation modifies `.replit`; that unrelated working-tree change can block `git rebase --continue` even after all merge conflicts are resolved.

**How to apply:** Inspect `git status` first when pulling GitHub updates. Preserve local setup changes while reconciling upstream, then update runtime and workflow configuration.

Finish the active rebase rather than replacing it with a merge when reconciling GitHub sync. Preserve resolutions that exist only in earlier merge commits.

**Why:** GitHub synchronization here has run `pull --rebase` after a completed local merge. Standard rebases do not replay merge commits, so their manual homepage resolutions can disappear and the same conflicts recur against newer upstream work.

**How to apply:** Inspect the current rebase and latest upstream before editing. Reapply any still-required merge-only resolutions explicitly, keep newer upstream features, and continue until Git reports a branch rather than an active rebase. Do not remove rebase metadata or force-push as a shortcut.

When old branding and navigation commits conflict with a newer shared site shell, retain the newer shared shell and apply the user's branding requirements within it.

**Why:** Replaying older page-specific headers can remove newer destinations, including Recipes, and restore outdated layouts. Source-only checks can also reject valid headers that are expanded during rendering.

**How to apply:** Preserve newer product features, verify the expanded HTML rather than expecting literal headers in templates, and check navigation on both narrow and desktop screens before finishing synchronization.
