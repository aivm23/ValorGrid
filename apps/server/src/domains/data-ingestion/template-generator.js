const ExcelJS = require('exceljs');

const MOVIMIENTOS_HEADERS = [
  'Tipo',
  'Fecha',
  'Ticker',
  'Yahoo',
  'Acciones',
  'Precio',
  'Divisa',
  'FX a EUR',
  'Valor EUR',
  'Comision EUR',
  'Referencia',
];

const INSTRUCCIONES_ROWS = [
  ['Plantilla de importación de ValorGrid'],
  [''],
  ['Cómo usar esta plantilla:'],
  [''],
  ['1. Rellena la hoja "Movimientos" con tus operaciones.'],
  ['2. La primera fila contiene los encabezados — no la modifiques.'],
  ['3. Cada fila de datos representa una operación (compra o venta).'],
  [''],
  ['Campos:'],
  ['- Tipo (opcional): "compra", "venta", "c", "v", "buy", "sell". Si se deja vacío, se infiere del signo de Acciones.'],
  ['- Fecha (obligatorio): formato DD/MM/AAAA (ej: 15/01/2026).'],
  ['- Ticker (obligatorio): símbolo del instrumento en ValorGrid.'],
  ['- Yahoo (opcional): ticker de Yahoo Finance para precios automáticos. Si se omite, se usará el que tenga el instrumento en ValorGrid.'],
  ['- Acciones (obligatorio): cantidad. Positivo = compra, negativo = venta si no se usa Tipo.'],
  ['- Precio (obligatorio): precio unitario en la divisa de la operación.'],
  ['- Divisa (obligatorio): código ISO de 3 letras (EUR, USD, PLN, etc.).'],
  ['- FX a EUR (obligatorio si Divisa != EUR): tipo de cambio a euros. Ej: para USD a 0.92, pon 0.92.'],
  ['- Valor EUR (opcional): valor total en euros. Si se omite, se calcula como Acciones × Precio × FX a EUR.'],
  ['- Comision EUR (opcional): comisión en euros. Déjalo en 0 o vacío si no aplica.'],
  ['- Referencia (opcional): ID externo de la operación para trazabilidad.'],
  [''],
  ['Notas importantes:'],
  ['- No se busca FX automáticamente. Si la divisa no es EUR, debes proporcionar FX a EUR.'],
  ['- Los instrumentos deben existir en ValorGrid o se crearán durante la importación.'],
  ['- Las ventas requieren posición suficiente en el ledger.'],
  ['- Esta hoja de instrucciones y la de ejemplos no se importan. Solo se importa "Movimientos".'],
];

const EJEMPLOS_HEADERS = [...MOVIMIENTOS_HEADERS];

const EJEMPLOS_ROWS = [
  ['compra', '15/01/2026', 'MSFT', 'MSFT', '10', '400', 'USD', '0.92', '3680', '1.5', 'ord-001'],
  ['venta', '20/02/2026', 'VWRL', 'VWRL.AS', '5', '120', 'EUR', '', '600', '0.8', 'ord-002'],
  ['', '01/03/2026', 'SAN', 'SAN.MC', '-100', '5.5', 'EUR', '', '550', '2', ''],
  ['compra', '10/04/2026', 'AAPL', 'AAPL', '20', '200', 'USD', '0.92', '', '0.5', 'ord-004'],
];

function appendSheet(workbook, sheetName, rows, widths) {
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = widths.map((width) => ({ width }));
  for (const row of rows) {
    worksheet.addRow(row);
  }
  return worksheet;
}

async function generateTemplateXlsx() {
  const workbook = new ExcelJS.Workbook();
  appendSheet(workbook, 'Movimientos', [MOVIMIENTOS_HEADERS], MOVIMIENTOS_HEADERS.map(() => 18));
  appendSheet(workbook, 'Instrucciones', INSTRUCCIONES_ROWS, [100]);
  appendSheet(workbook, 'Ejemplos', [EJEMPLOS_HEADERS, ...EJEMPLOS_ROWS], EJEMPLOS_HEADERS.map(() => 18));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = {
  generateTemplateXlsx,
  MOVIMIENTOS_HEADERS,
  appendSheet,
};
