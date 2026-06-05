# Primeros Pasos Con ValorGrid

Esta guía está pensada para usuarios que quieren probar ValorGrid sin usar comandos.

## 1. Instala La App

1. Abre la [última release oficial](https://github.com/aivm23/ValorGrid/releases/latest).
2. Descarga `ValorGrid-Setup-X.Y.Z-x64.exe`.
3. Ejecuta el instalador.
4. Abre ValorGrid desde el menú Inicio.

La app guarda la base de datos y los backups en la carpeta privada de datos de tu usuario.

## 2. Crea Tu Primera Cartera

Al abrir una instalación nueva, usa el asistente inicial para crear:

- un grupo, por ejemplo `Cartera principal`;
- un instrumento, por ejemplo un ETF o acción;
- una compra inicial opcional;
- una aportación automática opcional.

![Dashboard principal](../assets/screenshots/dashboard-demo.png)

## 3. Añade Movimientos

Puedes registrar compras y ventas manualmente desde la zona de movimientos.

![Movimientos](../assets/screenshots/movimientos-demo.png)

Cada movimiento puede incluir:

- fecha;
- ticker;
- compra o venta;
- acciones;
- precio;
- divisa;
- FX a EUR;
- comisión.

## 4. Importa Desde Excel

Si ya tienes movimientos en una hoja:

1. Descarga la plantilla Excel desde la app.
2. Rellena la hoja `Movimientos`.
3. Importa el archivo.
4. Revisa el preview.
5. Confirma solo las filas válidas.

Guía completa: [IMPORT_EXCEL.md](IMPORT_EXCEL.md).

## 5. Revisa Evolución E Histórico

ValorGrid materializa el histórico para que la lectura sea rápida.

![Histórico](../assets/screenshots/historico-demo.png)

Puedes revisar:

- valor actual;
- aportado neto;
- resultado total;
- evolución YTD;
- distribución por grupos;
- movimientos visibles en la línea temporal.

## 6. Crea Un Backup

Antes de importar muchos datos o actualizar la app, crea un backup desde la interfaz o con:

```powershell
npm run db:backup
```

En la app Windows no necesitas ejecutar el comando; puedes usar la acción de backup integrada.

## 7. Qué No Hace ValorGrid

ValorGrid no recomienda compras, ventas ni carteras. No sustituye a tu broker, asesor financiero ni asesor fiscal.

Su objetivo es ayudarte a organizar, revisar y auditar tu información.
