# Contributing

## Commit messages

Versioning and `CHANGELOG.md` are derived automatically from commit messages on `main`, so PR titles/commits should follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat: ...`, `fix: ...`) — other prefixes (`chore:`, `docs:`, `refactor:`, ...) are allowed but omitted from the changelog.

## Releasing

Releases go straight to the public npm registry via [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC). A `staging` git branch lets you build and smoke-test a release candidate before it touches `main` or npm.

To cut a release:

1. Run **Staging Release**. It creates/overwrites the `staging` branch with a version bump and updated changelog, runs the test suite, and builds the package the same way npm would (`npm pack`) to smoke-test the actual tarball — nothing is published yet. It finishes by writing `.staging-validated` (version + timestamp) to `staging`.
2. Review the `staging` branch. If it needs a change (changelog wording, a quick fix, ...), push a commit directly to it — don't re-run **Staging Release**, which would recreate `staging` from `main` and discard the amendment.
3. Run the **Main Release** action. It re-validates `.staging-validated` and re-runs the same `npm pack` build/smoke-test against the current `staging`, then merges `staging` into `main`, publishes to npm (`npm publish --provenance`, via trusted publishing), tags the release, and creates a GitHub Release. If the build/test step fails, nothing is merged, published, or tagged — fix `staging` and run it again.
