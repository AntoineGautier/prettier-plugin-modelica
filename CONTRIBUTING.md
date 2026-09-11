# Contributing

## Commit messages

Versioning and `CHANGELOG.md` are derived automatically from commit messages on `main`, so PR titles/commits should follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat: ...`, `fix: ...`) — other prefixes (`chore:`, `docs:`, `refactor:`, ...) are allowed but omitted from the changelog.

## Releasing

Releases go straight to the public npm registry via [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC). A `staging` git branch lets you build and smoke-test a release candidate before it touches `main` or npm.

To cut a release:

1. Run **Staging Release**. It creates/overwrites the `staging` branch with a version bump and updated changelog, runs the test suite, and builds the package the same way npm would (`npm pack`) to smoke-test the actual tarball — nothing is published yet. It finishes by writing `.staging-validated` (version + timestamp) to `staging`.
2. Review the `staging` branch. If it needs a change (changelog wording, a quick fix, ...), push a commit directly to it — don't re-run **Staging Release**, which would recreate `staging` from `main` and discard the amendment.
3. Run the **Main Release** action. It re-validates `.staging-validated`, re-runs the test suite against the current `staging`, drops the `.staging-validated` marker, then tags the release on `staging`, publishes to npm (`npm publish --provenance`, via trusted publishing), and creates a GitHub Release. If anything fails before the tag is pushed, nothing is published or tagged — fix `staging` and run it again. Publishing runs *after* the tag push on purpose: it is the only step that cannot be undone, since a version number is burned on npm even if you unpublish.
4. Fast-forward `main` yourself — the workflow never writes to it:

   ```bash
   git fetch origin
   git checkout main
   git merge --ff-only origin/staging
   git push origin main
   ```

   `main` is protected by a ruleset that requires pull requests, and only the Repository admin role bypasses it. Pushing `main` from CI would therefore mean handing an admin-scoped token to a job that also runs `npm ci`, dependency install scripts, and the build — so the release workflow deliberately stays out of `main` and uses the default `GITHUB_TOKEN` for `staging` and tags, which the ruleset doesn't cover. Don't skip this step: the next **Staging Release** cuts from `main`, so a stale `main` makes it re-bump an already-published version, and that run then fails when it tries to push a tag that already exists.

**Cutting a release freezes `main`.** From the moment **Staging Release** puts a commit on `staging` until you fast-forward `main` in step 4, the required `success` check fails every pull request targeting `main`. This is deliberate: landing anything on `main` while `staging` is ahead makes the two diverge, which breaks the step 4 fast-forward and leaves the release's changelog silently missing whatever was merged. If you decide to abandon a staging release rather than finish it, delete or reset `staging` to lift the freeze.
