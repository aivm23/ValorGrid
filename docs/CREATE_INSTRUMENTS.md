# Crear Valores Y Fuente De Precio

Esta guía explica cómo crear instrumentos en ValorGrid. El proveedor de precios se asigna automáticamente según el tipo de instrumento.

| Tipo               | Proveedor     | Requisito                                                   |
| ------------------ | ------------- | ----------------------------------------------------------- |
| ETF, Stock, Crypto | Yahoo Finance | Ticker Yahoo válido                                         |
| Commodity          | Alpha Vantage | Clave API guardada desde el asistente o variable de entorno |

## Crear ETF, Stock o Crypto (Yahoo)

Campos:

- **Tipo**: primero, elige ETF, Stock o Crypto.
- **Ticker interno**: código corto que usarás en ValorGrid. Ej: `IWDA`, `MSFT`.
- **Ticker Yahoo**: símbolo de Yahoo Finance. Ej: `IWDA.AS`, `MSFT`.
- **Nombre**: nombre visible.
- **Divisa**: EUR, USD, etc.
- **Grupo**: grupo de cartera.
- **Color**: color visual.

Ejemplo:

- Tipo: `ETF`
- Ticker interno: `SPPW`
- Ticker Yahoo: `SPPW.DE`
- Nombre: `ETF MSCI World`
- Divisa: `EUR`

## Crear Commodity (Alpha Vantage)

Las commodities usan precios spot de Alpha Vantage automáticamente. Símbolos soportados:

| Símbolo     | Descripción          |
| ----------- | -------------------- |
| GOLD        | Oro spot (XAU/USD)   |
| SILVER      | Plata spot (XAG/USD) |
| WTI         | Petróleo WTI         |
| BRENT       | Petróleo Brent       |
| NATURAL_GAS | Gas natural          |

Campos:

- **Tipo**: selecciona `Commodity`.
- **Commodity**: elige del desplegable el símbolo de Alpha Vantage.
- **Ticker interno**: se autocompleta con el símbolo elegido. Puedes cambiarlo.
- **Nombre**: se autocompleta. Puedes cambiarlo.
- **Divisa**: se fija automáticamente a `USD`.
- **Grupo**: grupo de cartera.
- **Color**: color visual.

Si no hay clave de Alpha Vantage configurada, ValorGrid te mostrará un asistente no técnico:

1. Botón "Obtener clave gratis" que abre la página oficial de Alpha Vantage.
2. Completa el formulario (email + aceptar términos).
3. Pega la clave recibida y confirma.

La clave se valida automáticamente con una llamada de prueba a la API. Solo se guarda si es válida. Este flujo está disponible en la app de escritorio y en Docker/CasaOS cuando la clave no viene de variable de entorno. En Docker/servidor también puedes configurar `VALORGRID_ALPHA_VANTAGE_API_KEY` como variable de entorno.

La divisa `USD` es fija para todas las commodities. ValorGrid convertirá los precios a EUR mediante el tipo de cambio diario.

## Precio Manual En Operaciones

Si registras una compra sin que haya precio de mercado disponible (día festivo, fin de semana, instrumento nuevo), puedes elegir el modo de cálculo:

- `invertir importe`: ValorGrid calcula la cantidad con precio/FX de mercado.
- `total y cantidad`: ValorGrid registra una ejecución liquidada en EUR sin consultar mercado.
- `precio unitario`: ValorGrid calcula el valor en EUR con el precio y el FX indicados.

El precio manual de operación es puntual y no crea una fuente persistente.

Las ventas manuales se registran siempre con cantidad vendida, importe bruto de venta en EUR y comisión EUR. ValorGrid no consulta mercado para calcular ventas desde la UI.

## Recomendaciones

- Usa tickers internos simples y estables.
- Commodities en USD: ValorGrid convierte a EUR automáticamente con el FX del día.
- Alpha Vantage requiere clave API. En la app de escritorio y en Docker/CasaOS puedes configurarla desde el mismo asistente. En despliegues avanzados, usa `VALORGRID_ALPHA_VANTAGE_API_KEY`.
