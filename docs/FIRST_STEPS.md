# Primeros Pasos Con ValorGrid

Guía rápida para probar ValorGrid sin comandos. Para una descripción visual y enlaces de descarga, usa también la landing pública: <https://valorgrid.app>.

## 1. Instala La App

1. Abre la [última release oficial](https://github.com/aivm23/ValorGrid/releases/latest).
2. Descarga el artefacto de tu plataforma:
   - Windows x64: `ValorGrid-Setup-X.Y.Z-x64.exe` o `ValorGrid-Setup-x64.exe`.
   - Linux x64: `ValorGrid-Linux-x64.AppImage` o `ValorGrid-Linux-x64.deb`.
   - macOS x64/arm64: `ValorGrid-macOS-x64.dmg` o `ValorGrid-macOS-arm64.dmg`.
3. Instala o ejecuta ValorGrid.

La versión de escritorio incluye el runtime y guarda DB/backups en la carpeta privada de datos de tu usuario.

## 2. Crea La Cartera Inicial

Pulsa **+ Empezar** para abrir el asistente. Puedes crear:

- un grupo de cartera;
- un instrumento;
- una primera compra opcional;
- un plan de aportación opcional.

Si vas a crear commodities u otros instrumentos con proveedores concretos de precio, consulta [CREATE_INSTRUMENTS.md](CREATE_INSTRUMENTS.md).

## 3. Importa Movimientos

Community importa movimientos mediante la plantilla Excel oficial de ValorGrid:

1. Pulsa **+ Importar**.
2. Descarga la plantilla.
3. Rellena la hoja `Movimientos`.
4. Sube el archivo y revisa el preview.
5. Confirma solo las filas validas que quieras incorporar.

Los CSV/XLSX específicos de broker pertenecen a Pro/Enterprise y no forman parte del contrato público Community.

Guía completa: [IMPORT_EXCEL.md](IMPORT_EXCEL.md).

## 4. Registra Movimientos Manuales

También puedes introducir compras y ventas manualmente desde la zona de movimientos. Cada movimiento puede incluir fecha, ticker, acciones, precio, divisa, FX a EUR y comisión.

## 5. Revisa Evolución E Histórico

El dashboard resume valor actual, aportado neto, resultado total, plusvalías, comisiones y distribución. El histórico se materializa localmente para que las lecturas sean rápidas.

## 6. Crea Backups

Antes de importar muchos datos o actualizar la app, crea un backup desde la interfaz.

En desarrollo local también puedes usar:

```bash
npm run db:backup
```

## Que No Hace ValorGrid

ValorGrid no recomienda compras, ventas ni carteras. No sustituye a tu broker, asesor financiero ni asesor fiscal.
