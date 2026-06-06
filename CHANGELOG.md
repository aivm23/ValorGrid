# Changelog

## 3.7.3

- fix: replace vulnerable xlsx parser with exceljs.
- Fix Windows desktop shortcut and installer branding by using the ValorGrid icon in NSIS assets and shortcut creation.

## 3.7.2

- chore: automate changelog update and check commands.

## 3.7.1

- feat: auto-calculate euros from shares x price, disable shares/price when euros filled, reorder fields.

## 3.7.0

- feat: add unit price field to operation form, rename add/remove labels to buy/sell in UI.

## 3.5.8

- style: attach refresh icon inline to price status text.

## 3.5.7

- style: compact icon-only refresh button next to price status.

## 3.5.6

- style: move add/remove buttons to ledger panel, redesign refresh button with accent icon and spin animation.

## 3.5.5

- Rework the public README as a hybrid product and technical entry point focused on Windows download, privacy and screenshots.
- Add non-technical user documentation for first steps, Excel import, FAQ, legal notice and roadmap.
- Update release notes generation with clearer Windows, checksum, privacy and legal messaging.

## 3.5.4

- Fix packaged desktop startup by keeping backups outside `app.asar` when the DB path is explicit.
- Add the ValorGrid logo to Windows desktop builds and remove the native Electron menu bar.

## 3.5.3

- Add a local PowerShell script to clean `dist`, rebuild the Windows installer and regenerate release checksums.

## 3.5.2

- fix: correct GitHub Issues URL in boot error overlay to aivm23/ValorGrid.

## 3.5.1

- Fix Windows release builds by disabling electron-builder implicit publishing on git tags.

## 3.5.0

- Add the first Windows desktop distribution path with Electron and an NSIS installer.
- Add GitHub Release automation for Windows installer artifacts, SHA-256 checksums and provenance attestation.
- Add release documentation covering changelog, upgrade, rollback, checksums and Docker image coordination.
- Keep ValorGrid Community local-first and unauthenticated in this release; login is intentionally out of scope.
