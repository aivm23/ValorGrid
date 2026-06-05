# Importar Movimientos Con Excel

ValorGrid Community importa movimientos mediante una plantilla Excel oficial.

## Descargar La Plantilla

Desde la app, abre el flujo de importación y descarga la plantilla. También está disponible en:

```text
GET /api/import/template.xlsx
```

La plantilla tiene tres hojas:

- `Movimientos`: hoja importable.
- `Instrucciones`: guía rápida.
- `Ejemplos`: datos sintéticos.

## Controles Del Parser

La fuente pública sigue siendo `valorgrid-xlsx`, pero el parser interno usa ExcelJS. Solo se aceptan libros `.xlsx` modernos con estos controles:

- tamaño máximo de 2 MB;
- hojas permitidas: `Movimientos`, `Instrucciones`, `Ejemplos`;
- importación exclusiva de la hoja `Movimientos`;
- encabezados exactos de la plantilla oficial;
- fórmulas rechazadas;
- máximo 500 movimientos por importación en Community.

## Hoja Movimientos

Encabezados obligatorios:

| Columna        | Uso                                                                |
| -------------- | ------------------------------------------------------------------ |
| `Tipo`         | `compra` o `venta`; puede dejarse vacío si `Acciones` tiene signo. |
| `Fecha`        | Fecha de operación.                                                |
| `Ticker`       | Ticker interno usado en ValorGrid.                                 |
| `Acciones`     | Positivo para compra, negativo para venta si `Tipo` está vacío.    |
| `Precio`       | Precio por acción en la divisa indicada.                           |
| `Divisa`       | Código ISO, por ejemplo `EUR` o `USD`.                             |
| `FX a EUR`     | Tipo de cambio hacia EUR; obligatorio si la divisa no es EUR.      |
| `Valor EUR`    | Opcional; si falta, ValorGrid lo calcula.                          |
| `Comision EUR` | Comisión en EUR, opcional.                                         |
| `Referencia`   | Identificador libre para deduplicación y auditoría.                |

## Preview Antes De Confirmar

La importación no escribe movimientos directamente. Primero genera un preview para revisar:

- filas válidas;
- duplicados;
- errores;
- ventas sin posición suficiente;
- instrumentos que necesitan conciliación;
- impacto estimado en cartera.

Solo se confirman las filas válidas y seleccionadas.

## Ejemplo Sintético

El repositorio incluye un archivo de prueba en:

```text
samples/valorgrid-template/valorgrid-template-sp500-synthetic.xlsx
```

Usa tickers reales del S&P 500, pero todos los movimientos, precios, fechas, FX y comisiones son ficticios.

## Exportar Para Auditoría

ValorGrid exporta movimientos al mismo formato compatible:

```text
GET /api/export/transactions.xlsx
```

El archivo exportado contiene una hoja `Movimientos`, lista para auditoría o reimportación.

## Errores Frecuentes

- Divisa no EUR sin `FX a EUR`.
- Venta antes de tener acciones suficientes.
- Ticker no creado en ValorGrid.
- Fecha en formato no reconocido.
- `Valor EUR` que no cuadra con `Acciones * Precio * FX`.

## Privacidad

No subas tus hojas personales al repositorio. Las exportaciones reales pueden contener importes, fechas, ISIN, referencias y datos financieros personales.
