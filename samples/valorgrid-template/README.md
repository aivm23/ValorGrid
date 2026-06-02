# ValorGrid Sample XLSX

Este directorio contiene un fixture sintético de importación para ValorGrid Community.

## Archivo

`valorgrid-template-sp500-synthetic.xlsx` — plantilla Excel oficial de ValorGrid con datos sintéticos.

## Contenido

El archivo contiene una sola hoja `Movimientos` con los encabezados oficiales:

| Tipo | Fecha | Ticker | Acciones | Precio | Divisa | FX a EUR | Valor EUR | Comision EUR | Referencia |
|---|---|---|---|---|---|---|---|---|---|

## Tickers

Los tickers usados (`AAPL`, `MSFT`, `NVDA`, `KO`, `JNJ`, `XOM`) son constituyentes reales del S&P 500, pero **todos los datos de movimientos son sintéticos**:

- Los precios, fechas, importes, FX y comisiones son ficticios.
- Este archivo no representa una cartera real ni una recomendación de inversión.
- Las referencias usan el prefijo `sample-sp500-` para identificarlas como sintéticas.

## Escenarios cubiertos

- **Compras USD con FX manual**: todas las operaciones son en USD con tipo de cambio explícito.
- **Venta parcial posterior**: AAPL y MSFT tienen compra y venta parcial.
- **Inferencia de tipo por signo**: la fila del 01/06/2025 tiene `Tipo` vacío y `Acciones` negativas.
- **Valor EUR explícito y automático**: NVDA y XOM especifican `Valor EUR`, el resto se calcula automáticamente.
- **Comisiones sintéticas**: cada fila tiene una comisión ficticia distinta de cero.

## Uso en tests

Los tests de importación leen este archivo directamente desde `samples/valorgrid-template/`:

1. Siembran instrumentos con esos tickers y `currency: USD`.
2. Ejecutan `previewImport` y `commitImport` con `source: 'valorgrid-xlsx'`.
3. Verifican compras, ventas, FX, comisiones y posiciones finales.
4. Prueban reimportación idempotente y rollback.

## Privacidad

Este archivo **no contiene datos reales de ningún broker**. Las cadenas dentro del XLSX no incluyen tokens, ISIN, nombres de broker ni identificadores de cuentas reales. Es seguro para publicación en el repositorio Community.
