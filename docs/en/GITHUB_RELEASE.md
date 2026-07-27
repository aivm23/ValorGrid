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

Final installers are kept as GitHub Release assets. The intermediate `Release` artifacts (`desktop-windows`, `desktop-linux`, `desktop-macos`) are temporary and use `retention-days: 1` to avoid consuming storage quota unnecessarily.

The `Cleanup Actions Artifacts` workflow is available as a temporary measure to manage the artifact quota. The goal is to remove this dependency when GitHub improves quota management.
