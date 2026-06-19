# Crear Valores Y Fuente De Precio

Esta guía explica cómo crear instrumentos en ValorGrid. El proveedor de precios se asigna automáticamente según el tipo de instrumento.

| Tipo               | Proveedor     | Requisito                                               |
| ------------------ | ------------- | ------------------------------------------------------- |
| ETF, Stock, Crypto | Yahoo Finance | Ticker Yahoo válido                                     |
| Commodity          | Alpha Vantage | API key en servidor (`VALORGRID_ALPHA_VANTAGE_API_KEY`) |

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

La divisa `USD` es fija para todas las commodities. ValorGrid convertirá los precios a EUR mediante el tipo de cambio diario.

## Precio Manual En Operaciones

Si registras una compra o venta sin que haya precio de mercado disponible (día festivo, fin de semana, instrumento nuevo), puedes introducir manualmente:

- `acciones + precio/acción`: ValorGrid calcula el valor en EUR.
- `euros + precio/acción`: ValorGrid calcula las acciones.

El precio manual de operación es puntual y no crea una fuente persistente.

## Recomendaciones

- Usa tickers internos simples y estables.
- Commodities en USD: ValorGrid convierte a EUR automáticamente con el FX del día.
- Alpha Vantage requiere API key configurada en el servidor (variable `VALORGRID_ALPHA_VANTAGE_API_KEY`).
