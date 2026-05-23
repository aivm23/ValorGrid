# DEGIRO import sample

Esta carpeta contiene un fichero sintético para probar el importador **DEGIRO Transacciones CSV** sin datos reales.

Fichero: `degiro-transactions-synthetic.csv`

Características:

- Cabeceras equivalentes al export de **Transacciones** de DEGIRO.
- Separador `,` y decimales con `,` dentro de campos entrecomillados.
- Incluye compras y ventas (`Número` positivo/negativo).
- Incluye ISIN, mercado, FX, comisión AutoFX y costes externos.
- Incluye filas de corporate action (`RTS/NON TRADEABLE`) para verificar estado `ignored`.

Recomendaciones de uso:

1. En la UI de importación selecciona `DEGIRO Transacciones CSV`.
2. Carga `degiro-transactions-synthetic.csv`.
3. Revisa el preview y resuelve mapeos de ISIN si aparecen como `needs_mapping`.
