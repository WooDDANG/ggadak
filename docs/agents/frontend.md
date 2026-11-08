# Frontend PR workflow

`apps/frontend-main` is the `likelion-kkadak/frontend` Git submodule. Preserve its independent history.

1. Create a topic branch before editing frontend source.
2. Validate the frontend against the BE from the parent repository's Herdr verify pane.
3. Commit frontend changes inside the submodule using the existing `fix:`, `feat:`, or `docs:` convention.
4. Push only the topic branch and open a PR against the frontend default branch. The user's PR-only instruction authorizes the branch push required for that PR, not a push to the default branch.
5. Report the PR URL. Merge only after the user's explicit instruction or the repository's human review process.
6. Update the parent gitlink intentionally. State when it points to a pending PR commit; after that PR merges, pin the approved commit.

Direct pushes to the frontend default branch and automatic PR merges are prohibited. Keep secrets and local runtime files out of commits.
