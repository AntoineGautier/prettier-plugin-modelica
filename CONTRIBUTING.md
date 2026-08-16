# Contributing

## Commit messages

Versioning and `CHANGELOG.md` are derived automatically from commit messages on `main`, so PR titles/commits should follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat: ...`, `fix: ...`) — other prefixes (`chore:`, `docs:`, `refactor:`, ...) are allowed but omitted from the changelog.

## Releasing

Releases use npm's [staged publishing](https://docs.npmjs.com/staged-publishing/): a bumped version is staged automatically, but only becomes publicly installable once a maintainer approves it with a live 2FA code — CI can never publish on its own.

`npm stage publish` snapshots the package at the moment it runs — it has no link back to the `staging` git branch, so pushing a later commit to `staging` does **not** update what's already staged on npm. Running **Staging Release** with mode `fresh` doesn't pick up such an amendment either: that mode force-recreates `staging` from `main`'s current HEAD, discarding any commit you pushed directly to `staging`.

npm's trusted publisher config only accepts a single workflow filename per package, so there is one workflow (`Staging Release`) with a `mode` input rather than two separate workflows.

To cut a release:

1. Run **Staging Release** with `mode: fresh`. It creates/overwrites a `staging` branch with a version bump and updated changelog, runs the test suite, and stages the package on npm (`npm stage publish`, via trusted publishing — no token involved) without making it public. It also downloads and smoke-tests the staged tarball.
2. Review the `staging` branch.
   - **If it needs a change** (changelog wording, a quick fix, ...): push a commit directly to `staging`, then run **Staging Release** again with `mode: restage`. This re-stages exactly what's currently on `staging` (no rebuild from `main`, no version rebump) and updates `.staging-validated` with the new stage-id. The stage-id from the previous run is now stale and superseded — reject it yourself (`npm stage reject <old-id> --otp=<code>`) so it doesn't get approved by mistake; each run prints all outstanding stage-ids in its summary as a check.
   - **If it's good as-is**, move on.
3. Approve the npm stage yourself — this step requires your own 2FA and cannot be done from CI:
   ```
   npm stage approve <stage-id> --otp=<code>
   ```
   (`<stage-id>` is printed in the Staging Release run summary and stored in `.staging-validated` on `staging`.) You can also approve from npmjs.com → package → **Staged Packages** tab.
4. Once approved, run the **Main Release** action. It merges `staging` into `main`, tags the release, and creates a GitHub Release — npm itself was already published in step 3.
