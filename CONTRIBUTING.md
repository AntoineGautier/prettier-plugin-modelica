# Contributing

## Commit messages

Versioning and `CHANGELOG.md` are derived automatically from commit messages on `main`, so PR titles/commits should follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat: ...`, `fix: ...`) — other prefixes (`chore:`, `docs:`, `refactor:`, ...) are allowed but omitted from the changelog.

## Releasing

To cut a release:

1. Run the **Staging Release** GitHub Action. It creates/overwrites a `staging` branch with a version bump and updated changelog, and publishes a prerelease (`@next` dist-tag) to npm for testing.
2. Review the `staging` branch (and amend if needed), then run the **Main Release** action. It merges `staging` into `main`, tags the release, publishes to npm under the `latest` dist-tag, and creates a GitHub Release.
