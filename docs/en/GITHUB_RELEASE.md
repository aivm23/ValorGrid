# GitHub Release

Release checklist:

1. Bump version in package metadata.
2. Update changelog.
3. Sync release surfaces such as Docker/CasaOS metadata.
4. Run `npm run check`.
5. Run `npm run verify:publication`.
6. Build release artifacts when applicable.
7. Push only after explicit authorization.
8. Create tags only with the exact format `vX.Y.Z`.

Do not publish private data, local DB files, credentials, broker exports or personal paths.

## GitHub Actions Artifacts

Final installers are kept as GitHub Release assets. The intermediate `Release` artifacts (`desktop-windows`, `desktop-linux`, `desktop-macos`) are temporary and use `retention-days: 1` so they do not consume storage quota for weeks.

The `Cleanup Actions Artifacts` workflow runs daily and can also be started manually from GitHub Actions. If GitHub blocks a release because artifact quota is full, run it with:

- `keep_days`: `0`
- `dry_run`: `false`

GitHub recalculates artifact storage every 6-12 hours, so wait before retrying the release if the quota still appears full.
