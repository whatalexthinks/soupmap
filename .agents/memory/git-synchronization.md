---
name: Git synchronization
description: Order Git reconciliation before runtime changes when updating this imported app.
---

Finish any interrupted rebase before installing or changing a Replit runtime module.

**Why:** Runtime installation modifies `.replit`; that unrelated working-tree change can block `git rebase --continue` even after all merge conflicts are resolved.

**How to apply:** Inspect `git status` first when pulling GitHub updates. Preserve local setup changes while reconciling upstream, then update runtime and workflow configuration.
