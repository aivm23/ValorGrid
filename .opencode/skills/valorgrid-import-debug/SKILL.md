---
name: valorgrid-import-debug
description: Debugging y desarrollo del sistema de importación de ValorGrid. Use cuando haya problemas con importación CSV/XLSX, detección de instrumentos, conciliación, commit, rollback, o al añadir nuevos adaptadores de broker (DEGIRO, IBKR).
---

# ValorGrid Import Debug

Skill para debugging y desarrollo del sistema de importación de ValorGrid.

## Cuándo usar este skill

- Problemas con importación CSV/XLSX (parseo, preview, commit, rollback)
- Errores de detección o conciliación de instrumentos
- Desarrollo de nuevos adaptadores de broker (IBKR, otros)
- Debugging de transacciones duplicadas o faltantes
- Problemas con invalidación de histórico tras importación
- Errores de validación de ventas (posición insuficiente)

## Arquitectura del sistema de importación

### Flujo completo

```
Usuario sube CSV/XLSX
         ↓
[1] import-parser.js
    - Parsea archivo (CSV genérico o XLSX)
    - Aplica perfil de broker (degiro, ibkr, generic)
    - Normaliza a formato canónico
         ↓
[2] import-preview.js
    - Genera preview con detección de instrumentos
    - Resuelve instrumentos por:
      * Mapping explícito (usuario)
      * Identificadores en DB (ISIN, ticker)
      * Heurística por nombre
    - Calcula impacto en posiciones
         ↓
[3] import-reconcile.js
    - Normaliza decisiones de usuario (import/skip)
    - Aplica ediciones de filas
    - Construye instrumentos detectados
    - Calcula impacto preview
         ↓
[4] Usuario revisa preview en UI
    - import-preview-renderer.js (renderizado)
    - import-workflow.js (lógica de flujo)
    - import-workflow-helpers.js (helpers puros)
         ↓
[5] import-service.js → commitImport()
    - import-entities.js: crea instrumentos/grupos nuevos
    - import-sale-rules.js: valida ventas (posición suficiente)
    - import-hash.js: calcula hashes de deduplicación
    - import-labels.js: genera etiquetas y mensajes
         ↓
[6] Transacciones creadas en DB
    - Invalidación de histórico desde primera fecha
    - Reconstrucción de portfolio_positions_daily
```

### Módulos backend (src/)

| Módulo | Responsabilidad | Líneas |
|--------|----------------|--------|
| `import-service.js` | Orquestación: preview, commit, rollback, API | ~246 |
| `import-preview.js` | Generación de preview, detección de instrumentos | ~458 |
| `import-parser.js` | Parseo CSV/XLSX, normalización canónica | ~350 |
| `import-reconcile.js` | Conciliación de decisiones, ediciones, impacto | ~171 |
| `import-entities.js` | Creación de instrumentos y grupos nuevos | ~120 |
| `import-profiles.js` | Perfiles de broker (field aliases, adapters) | ~87 |
| `import-preview-helpers.js` | Utilidades para preview (matching, mapping) | ~180 |
| `import-hash.js` | Cálculo de hashes para deduplicación | ~45 |
| `import-labels.js` | Generación de etiquetas y mensajes | ~65 |
| `import-sale-rules.js` | Validación de ventas (posición suficiente) | ~95 |

### Módulos frontend (client/)

| Módulo | Responsabilidad | Líneas |
|--------|----------------|--------|
| `imports.js` | Orquestación del wizard de importación | ~349 |
| `import-workflow.js` | Lógica de flujo, validación, payload building | ~323 |
| `import-workflow-helpers.js` | Constantes y helpers puros | ~75 |
| `import-preview-renderer.js` | Renderizado de preview en UI | ~350 |

## Estructura de datos

### `import_batches` (lote de importación)

```sql
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,              -- 'import-batch:degiro-csv:abc123'
  source TEXT NOT NULL,             -- 'degiro-csv', 'ibkr-csv', 'generic-csv', 'generic-xlsx'
  filename TEXT,                    -- 'Transactions.csv'
  file_hash TEXT NOT NULL,          -- SHA256 del contenido
  status TEXT NOT NULL,             -- 'previewed' | 'committed' | 'rolled_back' | 'failed'
  mapping_json TEXT NOT NULL,       -- JSON de mapeo de campos
  summary_json TEXT NOT NULL,       -- JSON con resumen (rowCount, errorCount, etc.)
  row_count INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
  first_date TEXT,
  last_date TEXT,
  created_at TEXT NOT NULL,
  committed_at TEXT,
  rolled_back_at TEXT
);
```

**Ejemplo:**
```json
{
  "id": "import-batch:degiro-csv:abc123def456",
  "source": "degiro-csv",
  "filename": "Transactions.csv",
  "file_hash": "sha256:a1b2c3d4e5f6...",
  "status": "committed",
  "mapping_json": "{\"symbol\":\"Producto\",\"date\":\"Fecha\",\"shares\":\"Número\"}",
  "summary_json": "{\"rowCount\":150,\"validCount\":145,\"errorCount\":2,\"duplicateCount\":3}",
  "row_count": 150,
  "error_count": 2,
  "first_date": "2023-01-15",
  "last_date": "2026-05-20",
  "created_at": "2026-05-28 10:30:00",
  "committed_at": "2026-05-28 10:31:00"
}
```

### `import_rows` (filas individuales)

```sql
CREATE TABLE import_rows (
  id TEXT PRIMARY KEY,              -- 'import-row:abc123:42'
  batch_id TEXT NOT NULL,           -- FK a import_batches
  row_index INTEGER NOT NULL,       -- Índice en el archivo original
  raw_json TEXT NOT NULL,           -- Fila original tal cual
  normalized_json TEXT,             -- Fila normalizada a formato canónico
  status TEXT NOT NULL,             -- 'valid' | 'error' | 'duplicate' | 'committed' | 'rolled_back'
  error TEXT,                       -- Mensaje de error si status='error'
  row_hash TEXT NOT NULL,           -- SHA256 para deduplicación
  transaction_id TEXT,              -- FK a transactions si status='committed'
  created_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
);
```

**Ejemplo:**
```json
{
  "id": "import-row:abc123:42",
  "batch_id": "import-batch:degiro-csv:abc123",
  "row_index": 42,
  "raw_json": "{\"Fecha\":\"18-05-2026\",\"Producto\":\"TEXT SA\",\"ISIN\":\"PLLVTSF00010\",\"Número\":\"10\"}",
  "normalized_json": "{\"date\":\"2026-05-18\",\"symbol\":\"TXT\",\"shares\":10,\"price\":40.18,\"type\":\"add\"}",
  "status": "committed",
  "error": null,
  "row_hash": "sha256:f7e8d9c0b1a2...",
  "transaction_id": "txn:xyz789",
  "created_at": "2026-05-28 10:30:00"
}
```

### Preview (en memoria, no persistido)

```javascript
{
  source: 'degiro-csv',
  filename: 'Transactions.csv',
  fileHash: 'sha256:a1b2c3...',
  payloadHash: 'sha256:d4e5f6...',  // Hash del payload completo (incluye decisiones)
  rows: [
    {
      rowIndex: 0,
      status: 'valid',              // 'valid' | 'error' | 'duplicate' | 'ignored' | 'skipped'
      date: '2026-05-18',
      marketDate: '2026-05-18',
      symbol: 'TXT',
      name: 'TEXT SA',
      type: 'add',                  // 'add' | 'remove'
      shares: 10,
      price: 40.18,
      valueEur: 401.80,
      currency: 'PLN',
      fxToEur: 4.2447,
      commissionEur: 4.90,
      cashFlowEur: -406.70,
      externalId: 'ord-wse-second-1',
      rowHash: 'sha256:...',
      rowKind: 'trade',             // 'trade' | 'corporate_action_ignored' | 'opening_position'
      // ... más campos
    }
  ],
  detectedInstruments: [
    {
      key: 'isin:PLLVTSF00010',     // Clave única para mapping
      symbol: 'TXT',                 // Símbolo propuesto
      isin: 'PLLVTSF00010',
      label: 'TEXT SA',
      resolutionStatus: 'needs_mapping' | 'resolved' | 'new' | 'mapped_new',
      tickerSuggestions: [
        {
          yahooSymbol: 'TXT.WA',
          displayName: 'TEXT SA',
          currency: 'PLN',
          confidence: 'alta',
          reason: 'Coincidencia por ISIN en importaciones anteriores',
          source: 'history'          // 'history' | 'local' | 'yahoo'
        }
      ],
      buys: 10,
      sells: 0,
      rowIndexes: [0, 5, 12]         // Filas asociadas a este instrumento
    }
  ],
  summary: {
    rowCount: 150,
    validCount: 145,
    errorCount: 2,
    duplicateCount: 3,
    skippedCount: 0,
    firstDate: '2023-01-15',
    lastDate: '2026-05-20'
  },
  canCommit: true,                   // true si hay filas válidas y sin errores bloqueantes
  warnings: [
    '2 filas con ventas sin posición existente (omitidas por defecto)'
  ],
  sheets: ['Hoja1', 'Hoja2'],        // Solo para XLSX
  selectedSheet: 'Hoja1'             // Solo para XLSX
}
```

## Adaptadores de broker

### Cómo funcionan

Los adaptadores transforman formatos específicos de broker a un formato canónico común.

**`import-profiles.js`** define:

```javascript
const adapterDefinitions = {
  'degiro-csv': { parser: 'csv', profile: 'degiro' },
  'ibkr-csv': { parser: 'csv', profile: 'ibkr' },
  'generic-csv': { parser: 'csv', profile: 'generic' },
  'generic-xlsx': { parser: 'xlsx', profile: 'generic' },
};

const profileOverrides = {
  degiro: {
    fieldAliases: {
      symbol: ['ticker', 'symbol', 'symbol/isin', 'isin', 'producto', 'product'],
      date: ['date', 'fecha', 'execution date'],
      shares: ['quantity', 'cantidad', 'acciones', 'numero'],
      // ... más aliases
    }
  },
  ibkr: {
    fieldAliases: {
      symbol: ['symbol', 'ticker'],
      date: ['date/time', 'trade date', 'date'],
      shares: ['quantity', 'qty', 'shares'],
      // ... más aliases
    }
  }
};
```

**`import-parser.js`** usa estos aliases para mapear campos:

```javascript
function normalizeImportRow(raw, profile) {
  const aliases = profileOverrides[profile]?.fieldAliases || {};
  return {
    symbol: getFieldValue(raw, aliases.symbol || baseFieldAliases.symbol),
    date: parseDate(getFieldValue(raw, aliases.date || baseFieldAliases.date)),
    shares: parseNumber(getFieldValue(raw, aliases.shares || baseFieldAliases.shares)),
    // ... más campos
  };
}
```

### DEGIRO: formatos soportados

**1. Transactions.csv (transacciones)**
- Campos típicos: Fecha, Hora, Producto, ISIN, Bolsa, Número, Precio, Valor local, Valor EUR, Tipo de cambio, Comisión AutoFX, Costes de transacción, Total EUR, ID Orden
- Firmado: Número positivo = compra, negativo = venta
- Divisas no-EUR: usa FX genérico a EUR (no asume USD)

**2. Portfolio snapshot (posición inicial)**
- Campos: Producto, ISIN, Cantidad, Precio, Valor local, Valor EUR
- Se importa como "opening position" si no hay posición previa

**Casos especiales DEGIRO:**
- Corporate actions (RTS, RIGHTS, NON TRADEABLE): ignorados por defecto
- Ventas sin posición: marcadas como `skipped` con razón `sale_deficit`
- Productos sin resolver: marcados como `needs_mapping`

### IBKR: formato esperado

**Trades report (CSV)**
- Campos típicos: DataDiscriminator, Symbol, Date/Time, Quantity, T. Price, Proceeds, Comm/Fee, Currency
- DataDiscriminator: "Trades" = transacción, "Corporate Actions" = ignorar
- Quantity: positivo = compra, negativo = venta
- Multi-currency: requiere FX a EUR

**Estado actual:**
- Perfil definido en `import-profiles.js`
- Adaptador registrado como `'ibkr-csv'`
- **NO IMPLEMENTADO**: falta parser específico y lógica de normalización
- UI muestra "Próximamente" (disabled en `index.html:552`)

## Bugs conocidos y soluciones

### Bug 1: Color perdido en validación fallida

**Síntoma:**
Al confirmar instrumentos, si hay error de validación, el color seleccionado por el usuario se pierde y vuelve al default `#2563eb`.

**Causa:**
`snapshotInstrumentChoices()` no se llamaba antes de re-renderizar tras error de validación, por lo que el snapshot no capturaba los cambios del usuario.

**Fix (imports.js:66):**
```javascript
ctx.state.importWorkflowBusy = true;
snapshotInstrumentChoices(ctx);  // ← Capturar estado ANTES de preview
renderImportPreview();
try {
  await previewCsvImport({ keepStep: true, preserveOnError: true });
  // ... validación
} finally {
  ctx.state.importWorkflowBusy = false;
  renderImportPreview();
}
```

**Debug:**
```javascript
// En browser console
console.log('Antes:', ctx.state.importInstrumentChoices['isin:ABC'].create.color);
// Confirmar instrumentos (con error)
console.log('Después:', ctx.state.importInstrumentChoices['isin:ABC'].create.color);
// Debe ser el mismo
```

### Bug 2: Ticker `.WA` no sugerido en segunda importación

**Síntoma:**
Primera importación de WSE funciona (sugiere `TXT.WA`), segunda importación del mismo ISIN no sugiere nada.

**Causa:**
`ticker-suggestions.js` solo buscaba en `knownNameHints` (hardcoded), no consultaba `instrument_identifiers` en DB.

**Fix (ticker-suggestions.js):**
```javascript
function dbTickerSuggestions(ctx, identity = {}) {
  const isin = String(identity.isin || '').trim().toUpperCase();
  if (!isin || !ctx?.db) return [];
  const row = ctx.db
    .prepare(`
      SELECT ii.instrument_symbol AS symbol, i.yahoo_symbol AS yahooSymbol,
             ii.display_name AS displayName, ii.currency, ii.exchange
      FROM instrument_identifiers ii
      JOIN instruments i ON i.symbol = ii.instrument_symbol
      WHERE ii.provider = 'global' 
        AND ii.identifier_type = 'isin' 
        AND ii.identifier_value = ?
      LIMIT 1
    `)
    .get(isin);
  if (!row) return [];
  return [{
    yahooSymbol: row.yahooSymbol || row.symbol,
    displayName: row.displayName || row.name,
    currency: row.currency,
    confidence: 'alta',
    reason: 'Coincidencia por ISIN en importaciones anteriores',
    source: 'history'
  }];
}
```

**Debug:**
```sql
-- Verificar que el identificador existe
SELECT * FROM instrument_identifiers 
WHERE identifier_value = 'PLLVTSF00010';

-- Verificar que el instrumento tiene yahoo_symbol correcto
SELECT symbol, yahoo_symbol FROM instruments 
WHERE symbol = 'TXT';
```

### Bug 3: Rollback no permite reimportar

**Síntoma:**
Tras hacer rollback de un lote, intentar reimportar el mismo archivo da error "ya importado".

**Causa:**
Índice único en `import_batches(source, file_hash)` impedía reimportación.

**Fix (import-service.js):**
```javascript
if (existing?.status === 'rolled_back') {
  // Limpiar filas del lote anterior
  db.prepare('DELETE FROM import_rows WHERE batch_id = ?').run(batchId);
  // Resetear status a 'previewed'
  db.prepare(`
    UPDATE import_batches 
    SET status = 'previewed', rolled_back_at = NULL, committed_at = NULL 
    WHERE id = ?
  `).run(batchId);
  return { batchId, existing: null };
}
```

**Debug:**
```sql
-- Verificar status del lote
SELECT id, status, rolled_back_at FROM import_batches 
WHERE file_hash = 'sha256:abc123...';

-- Verificar que no hay filas huérfanas
SELECT COUNT(*) FROM import_rows 
WHERE batch_id = 'import-batch:degiro-csv:abc123';
```

### Bug 4: Ventas marcadas como error en lugar de skipped

**Síntoma:**
Ventas sin posición existente aparecen como `error` en lugar de `skipped`, bloqueando el commit.

**Causa:**
`import-sale-rules.js` no distinguía entre "posición vacía" (skip por defecto) y "posición insuficiente" (error).

**Fix (import-sale-rules.js):**
```javascript
function markSkippedSaleDeficit(row, currentPosition, pendingRows) {
  if (row.type !== 'remove') return row;
  const totalShares = currentPosition + pendingRows
    .filter(r => r.symbol === row.symbol && r.date <= row.date)
    .reduce((sum, r) => sum + (r.type === 'add' ? r.shares : -r.shares), 0);
  
  if (totalShares === 0) {
    // Posición vacía: skip por defecto (no es error)
    return { ...row, status: 'skipped', skipReason: 'sale_deficit_empty' };
  }
  if (totalShares < row.shares) {
    // Posición insuficiente: error (requiere revisión)
    return { ...row, status: 'error', error: `Venta excede posición (${totalShares} disponibles)` };
  }
  return row;
}
```

**Debug:**
```javascript
// En browser console
const row = ctx.state.importPreview.rows[42];
console.log('Status:', row.status);
console.log('Skip reason:', row.skipReason);
console.log('Error:', row.error);
```

## Recetas de debugging

### Preview no muestra instrumentos

```javascript
// 1. Verificar que el preview se generó
console.log(ctx.state.importPreview);

// 2. Verificar detectedInstruments
console.log(ctx.state.importPreview.detectedInstruments);

// 3. Verificar resolutionStatus de cada uno
ctx.state.importPreview.detectedInstruments.forEach(item => {
  console.log(`${item.label}: ${item.resolutionStatus}`);
});

// 4. Si resolutionStatus = 'needs_mapping', verificar que hay sugerencias
ctx.state.importPreview.detectedInstruments
  .filter(item => item.resolutionStatus === 'needs_mapping')
  .forEach(item => {
    console.log(`${item.label}:`, item.tickerSuggestions);
  });
```

### Commit falla silenciosamente

```javascript
// 1. Construir payload manualmente
const payload = buildImportPayload(ctx);
console.log('Payload:', payload);

// 2. Verificar campos críticos
console.log('rowActions:', payload.rowActions);
console.log('rowMappings:', payload.rowMappings);
console.log('newInstruments:', payload.newInstruments);
console.log('instrumentMappings:', payload.instrumentMappings);

// 3. Enviar manualmente y ver respuesta completa
fetch('/api/import/commit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
  .then(r => r.json())
  .then(data => console.log('Response:', data))
  .catch(err => console.error('Error:', err));
```

### Transacciones duplicadas

```sql
-- 1. Buscar duplicados por raw_hash
SELECT raw_hash, COUNT(*) as count
FROM transactions
WHERE origin = 'import' AND raw_hash IS NOT NULL
GROUP BY raw_hash
HAVING count > 1;

-- 2. Ver detalles de duplicados
SELECT t.id, t.symbol, t.date, t.shares, t.raw_hash, ib.filename
FROM transactions t
JOIN import_batches ib ON t.import_batch_id = ib.id
WHERE t.raw_hash IN (
  SELECT raw_hash FROM transactions
  WHERE origin = 'import' AND raw_hash IS NOT NULL
  GROUP BY raw_hash HAVING COUNT(*) > 1
)
ORDER BY t.raw_hash, t.created_at;

-- 3. Verificar import_rows asociados
SELECT ir.batch_id, ir.row_index, ir.status, ir.transaction_id
FROM import_rows ir
WHERE ir.row_hash IN (
  SELECT raw_hash FROM transactions
  WHERE origin = 'import' AND raw_hash IS NOT NULL
  GROUP BY raw_hash HAVING COUNT(*) > 1
);
```

### Histórico no se actualiza tras import

```javascript
// 1. Verificar que se creó invalidación
const invalidations = db.prepare(`
  SELECT * FROM history_invalidations 
  ORDER BY created_at DESC 
  LIMIT 5
`).all();
console.log('Invalidations:', invalidations);

// 2. Verificar from_date (debe ser <= primera fecha del import)
const firstImportDate = '2023-01-15';
const recentInvalidation = invalidations.find(inv => inv.from_date <= firstImportDate);
console.log('Recent invalidation:', recentInvalidation);

// 3. Forzar reconstrucción manual
fetch('/api/portfolio/history?force=true')
  .then(r => r.json())
  .then(data => console.log('History rebuilt:', data));
```

### Instrumento no se crea tras commit

```sql
-- 1. Verificar que el instrumento está en newInstruments del payload
-- (hacer console.log del payload antes de commit)

-- 2. Verificar que se creó en DB
SELECT * FROM instruments WHERE symbol = 'TXT';

-- 3. Verificar que se crearon identificadores
SELECT * FROM instrument_identifiers 
WHERE instrument_symbol = 'TXT';

-- 4. Verificar que el grupo 'importados' existe
SELECT * FROM instrument_groups WHERE id = 'importados';

-- 5. Si no existe, crear manualmente
INSERT OR IGNORE INTO instrument_groups 
  (id, name, color, display_order, show_in_distribution, show_in_monthly, is_expandable, active)
VALUES 
  ('importados', 'Importados', '#64748b', 1, 1, 1, 0, 1);
```

## Queries SQL útiles

### Inspeccionar lotes recientes

```sql
SELECT id, source, filename, status, row_count, error_count, 
       first_date, last_date, created_at, committed_at
FROM import_batches
ORDER BY created_at DESC
LIMIT 10;
```

### Ver filas de un lote específico

```sql
SELECT row_index, status, error, 
       json_extract(raw_json, '$.Producto') as product,
       json_extract(normalized_json, '$.symbol') as symbol,
       json_extract(normalized_json, '$.date') as date,
       json_extract(normalized_json, '$.shares') as shares
FROM import_rows
WHERE batch_id = 'import-batch:degiro-csv:abc123'
ORDER BY row_index;
```

### Contar transacciones por origen

```sql
SELECT origin, COUNT(*) as count, 
       MIN(date) as first_date, MAX(date) as last_date
FROM transactions
GROUP BY origin;
```

### Ver transacciones de un lote

```sql
SELECT t.id, t.symbol, t.date, t.type, t.shares, t.price, t.cash_flow_eur
FROM transactions t
WHERE t.import_batch_id = 'import-batch:degiro-csv:abc123'
ORDER BY t.date, t.created_at;
```

### Buscar instrumentos sin Yahoo symbol

```sql
SELECT symbol, name, type, yahoo_symbol
FROM instruments
WHERE yahoo_symbol IS NULL OR yahoo_symbol = ''
  AND type != 'fx';
```

### Ver identificadores por provider

```sql
SELECT provider, identifier_type, COUNT(*) as count
FROM instrument_identifiers
GROUP BY provider, identifier_type
ORDER BY provider, identifier_type;
```

## Checklist para añadir nuevo broker (IBKR)

### 1. Definir perfil en `import-profiles.js`

```javascript
const profileOverrides = {
  ibkr: {
    fieldAliases: {
      type: ['buy/sell', 'action', 'side'],
      symbol: ['symbol', 'ticker'],
      date: ['date/time', 'trade date', 'date'],
      shares: ['quantity', 'qty', 'shares'],
      price: ['t. price', 'tradeprice', 'price'],
      valueEur: ['valor eur', 'value eur'],
      commissionEur: ['comm/fee', 'commission'],
      currency: ['currency', 'divisa'],
      fxToEur: ['fx rate to base', 'exchange rate'],
      externalId: ['trade id', 'execution id']
    }
  }
};
```

### 2. Implementar parser específico (si es necesario)

Si el formato IBKR tiene peculiaridades (multi-section CSV, headers especiales), crear `import-ibkr-parser.js`:

```javascript
function parseIBKRCSV(content) {
  // IBKR usa secciones: "Trades", "Corporate Actions", etc.
  // Filtrar solo sección "Trades"
  const lines = content.split('\n');
  const tradesSection = lines.filter(line => 
    line.startsWith('Trades,') || 
    (line.startsWith('DataDiscriminator,') && line.includes('Trades'))
  );
  
  // Parsear CSV estándar
  const rows = parseCSV(tradesSection.join('\n'));
  
  // Normalizar a formato canónico
  return rows.map(row => ({
    type: row['Buy/Sell'] === 'Buy' ? 'add' : 'remove',
    symbol: row['Symbol'],
    date: parseDate(row['Date/Time']),
    shares: Math.abs(parseFloat(row['Quantity'])),
    price: parseFloat(row['T. Price']),
    currency: row['Currency'],
    commissionEur: parseFloat(row['Comm/Fee']) || 0,
    externalId: row['TradeID']
  }));
}
```

### 3. Añadir lógica de normalización en `import-parser.js`

```javascript
function normalizeIBKRRow(raw) {
  // IBKR específico:
  // - Quantity positivo = compra, negativo = venta
  // - Multi-currency: necesita FX a EUR
  // - Corporate actions: ignorar
  
  const type = raw['Buy/Sell'] === 'Buy' ? 'add' : 'remove';
  const shares = Math.abs(parseFloat(raw['Quantity']));
  
  return {
    type,
    symbol: raw['Symbol'],
    date: parseIBKRDate(raw['Date/Time']),
    shares,
    price: parseFloat(raw['T. Price']),
    currency: raw['Currency'],
    fxToEur: parseFX(raw['FX Rate to Base']),
    commissionEur: Math.abs(parseFloat(raw['Comm/Fee']) || 0),
    externalId: raw['TradeID']
  };
}
```

### 4. Habilitar en UI (`index.html`)

```html
<option value="ibkr-csv">Interactive Brokers CSV</option>
```

### 5. Añadir tests en `test/portfolio.test.js`

```javascript
test('IBKR CSV import parses trades section correctly', () => {
  const content = [
    'Trades,DataDiscriminator,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee,Currency',
    'Trades,Order,AAPL,2026-05-18 10:30:00,10,150.50,-1505.00,-1.00,USD',
    'Trades,Order,MSFT,2026-05-19 14:20:00,-5,380.25,1901.25,-1.00,USD'
  ].join('\n');
  
  const preview = previewImport({
    source: 'ibkr-csv',
    filename: 'trades.csv',
    content
  });
  
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].type, 'add');
  assert.equal(preview.rows[0].symbol, 'AAPL');
  assert.equal(preview.rows[0].shares, 10);
  assert.equal(preview.rows[1].type, 'remove');
  assert.equal(preview.rows[1].symbol, 'MSFT');
  assert.equal(preview.rows[1].shares, 5);
});
```

### 6. Documentar en `docs/API.md`

```markdown
### Importación IBKR

```text
POST /api/import/preview
POST /api/import/commit
```
```text
Formato soportado:
- IBKR Trades CSV (sección "Trades" solamente)
- Multi-currency con FX automático a EUR
- Corporate actions ignoradas por defecto
```

### 7. Actualizar `docs/ARCHITECTURE.md`

```markdown
### Importaciones

Fuentes:
- CSV genérico
- XLSX genérico
- DEGIRO CSV
- IBKR CSV (implementado)
```

## Tests de integración

Los tests de importación están en `test/portfolio.test.js`. Ejemplos clave:

### Test básico de preview

```javascript
test('CSV import preview is read-only and commit is atomic', () => {
  const content = [
    'Fecha,Producto,ISIN,Número,Precio,Valor EUR',
    '18-05-2026,TEXT SA,PLLVTSF00010,10,40.18,401.80'
  ].join('\n');
  
  const preview = previewImport({
    source: 'degiro-csv',
    filename: 'test.csv',
    content
  });
  
  assert.equal(preview.canCommit, true);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].status, 'valid');
});
```

### Test de commit con nuevo instrumento

```javascript
test('import can create instrument from confirmed mapping', () => {
  const content = [
    'Fecha,Producto,ISIN,Número,Precio,Valor EUR',
    '18-05-2026,NEW STOCK,XXNEW0001,5,100,500'
  ].join('\n');
  
  const payload = {
    source: 'degiro-csv',
    filename: 'test.csv',
    content,
    instrumentMappings: { 'isin:XXNEW0001': 'NEW' },
    newInstruments: [
      {
        symbol: 'NEW',
        yahooSymbol: 'NEW.MC',
        name: 'NEW STOCK',
        type: 'stock',
        currency: 'EUR',
        groupId: 'importados',
        color: '#ea580c'
      }
    ]
  };
  
  const commit = commitImport(payload);
  assert.equal(commit.summary.errorCount, 0);
  
  const instrument = db.prepare("SELECT * FROM instruments WHERE symbol = 'NEW'").get();
  assert.ok(instrument);
  assert.equal(instrument.yahoo_symbol, 'NEW.MC');
});
```

### Test de rollback

```javascript
test('import rollback allows reimporting same file', () => {
  const content = [
    'Fecha,Producto,ISIN,Número,Precio,Valor EUR',
    '18-05-2026,TEXT SA,PLLVTSF00010,10,40.18,401.80'
  ].join('\n');
  
  const payload = { source: 'degiro-csv', filename: 'test.csv', content };
  
  // Commit inicial
  const commit1 = commitImport(payload);
  assert.equal(commit1.summary.errorCount, 0);
  
  // Rollback
  rollbackImportBatch(commit1.batchId);
  
  // Reimportar (debe funcionar)
  const commit2 = commitImport(payload);
  assert.equal(commit2.summary.errorCount, 0);
});
```

## Recursos adicionales

- **Documentación API**: `docs/API.md` (sección Importaciones)
- **Modelo de datos**: `docs/DATA_MODEL.md` (tablas import_batches, import_rows)
- **Arquitectura**: `docs/ARCHITECTURE.md` (sección Importaciones)
- **Tests**: `test/portfolio.test.js` (buscar "import" para ver todos los tests)
- **Muestras**: `samples/broker-degiro/` (CSVs de ejemplo DEGIRO)

## Comandos útiles

```bash
# Ejecutar todos los tests de importación
npm test -- --test-name-pattern "import"

# Ejecutar test específico
node --test --test-name-pattern "DEGIRO import suggests tickers" test/portfolio.test.js

# Iniciar servidor para debugging manual
npm start

# Ver logs de importación (en browser console)
console.log(ctx.state.importPreview);
console.log(ctx.state.importBatches);
```
