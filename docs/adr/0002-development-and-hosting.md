# Reuse existing GitHub repository and delivery controls

Status: accepted.

Repository choijunhuk/netlab existed and was public before this task. Preserve that visibility and history; do not create a duplicate project. Existing GitHub Pages deployment remains, so main merges continue to publish through that pre-existing workflow. No additional hosting infrastructure was created.

All expansion changes use feature PRs and squash merges, with strict netlab-quality checks and admin enforcement enabled. CI records are authoritative for the tested revision; local evidence is also recorded. Agent code review is recorded honestly and does not impersonate a separate human approval.

Actual merge SHA is posted on the merged PR and carried into the next documentation update, avoiding recursive self-referential documentation commits.
