# Skill: ValorGrid Spanish Orthography Validator

Use this skill when editing, reviewing, or creating any user-facing text in ValorGrid frontend (`apps/web/src/`, `apps/web/index.html`) or backend error messages. The goal is to catch and prevent Spanish spelling, accent, and grammar errors before they reach production.

## Critical Rules

1. **Always run `npm run docs:spellcheck`** after modifying any file containing Spanish UI text. This script checks for mojibake and common accent mistakes.
2. **Never trust auto-generated text** — AI models frequently drop accents or produce "español neutro" that is incorrect for Peninsular Spanish.

## Common Error Patterns (Blacklist)

These are real bugs found and fixed in ValorGrid. NEVER reintroduce them:

### Missing accents on -ción words

| Wrong              | Correct            | Context             |
| ------------------ | ------------------ | ------------------- |
| `visualizacion`    | `visualización`    | UI labels           |
| `revision`         | `revisión`         | Section headings    |
| `distribucion`     | `distribución`     | Tooltip text        |
| `operacion`        | `operación`        | Filter labels       |
| `importacion`      | `importación`      | Filenames, feedback |
| `previsualizacion` | `previsualización` | Error messages      |
| `posicion`         | `posición`         | Feedback text       |

### Missing accents on -ón/-ós words

| Wrong          | Correct      | Context                                                           |
| -------------- | ------------ | ----------------------------------------------------------------- |
| `retiraciones` | `retiradas`  | **Wrong word entirely** — "retiraciones" doesn't exist in Spanish |
| `automático`   | `automático` | Always accent on the `o`                                          |

### Missing accents on -á future tense verbs

| Wrong          | Correct        | Context              |
| -------------- | -------------- | -------------------- |
| `invalidara`   | `invalidará`   | Status messages      |
| `recalculara`  | `recalculará`  | Confirmation dialogs |
| `recalcularan` | `recalcularán` | Status messages      |

### Missing accents on common words

| Wrong          | Correct     | Context                         |
| -------------- | ----------- | ------------------------------- |
| `esta` (verb)  | `está`      | "mes anterior está"             |
| `estan`        | `están`     | "meses anteriores están"        |
| `mas` (adverb) | `más`       | "movimientos más"               |
| `historica`    | `histórica` | Descriptions                    |
| `Ultima`       | `Última`    | Labels (also needs accent on U) |

### Wrong words (not just accents)

| Wrong               | Correct     | Why                                  |
| ------------------- | ----------- | ------------------------------------ |
| `retiraciones`      | `retiradas` | "Retiraciones" is not a Spanish word |
| `Primer` (at start) | `Primera`   | Gender agreement                     |

## Validation Checklist

Before committing any file with Spanish text:

- [ ] Run `npm run docs:spellcheck`
- [ ] Search for common wrong patterns:
  ```
  grep -rn "retiraciones\|visualizacion\|revision[^á]\|automatico\|distribucion\|invalidara\|historica\|previsualizacion\|posicion\|Operacion\|Importacion\|Ultima" apps/web/src/
  ```
- [ ] Check future tense verbs end in `-á`, `-án`, `-ás` (not `-a`, `-an`, `-as`)
- [ ] Check `-ción` words have the accent on `o`
- [ ] Check `más` (adverb) vs `mas` (conjunction "but") — in UI context it's always `más`
- [ ] Check `está` (verb "to be") vs `esta` (demonstrative "this")

## File Locations

All Spanish UI text is hardcoded in these frontend files:

- `apps/web/src/operations-metrics.js` — metric labels, tooltips, microcopy
- `apps/web/src/operations.js` — metric rendering, instrument table, preferences
- `apps/web/src/monthly.js` — YTD review section
- `apps/web/src/charts.js` — history chart, event tooltips
- `apps/web/src/summary.js` — distribution donut chart
- `apps/web/src/ledger.js` — movements table
- `apps/web/src/forms.js` — add/edit transaction dialog
- `apps/web/src/bulk-actions.js` — bulk delete dialogs
- `apps/web/src/onboarding.js` — wizard dialog
- `apps/web/src/imports.js` — import orchestration
- `apps/web/src/import-preview-renderer.js` — import workflow steps
- `apps/web/src/import-confirm-renderer.js` — import confirmation
- `apps/web/src/import-workflow.js` — import logic
- `apps/web/src/history-preferences.js` — history event filters
- `apps/web/src/dashboard.js` — boot/refresh messages
- `apps/web/src/instrument-colors.js` — palette status messages
- `apps/web/index.html` — static HTML labels

## Testing

After fixes, run:

```bash
npm run docs:spellcheck
npm run check
```
