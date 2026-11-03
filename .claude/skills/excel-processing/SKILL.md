---
name: excel-processing
description: Lectura del Excel, selección de filas y escritura de resultados en la copia en MercadoPagoScraper (electron/excel-file.js con ExcelJS, rango en src/app/app.ts). Usar al tocar parseo, columna de números, rango desde/hasta, estados por fila, importes o el guardado.
---

# Procesamiento de Excel

## Cómo funciona

- Todo ocurre en el proceso principal (`electron/excel-file.js`). El renderer solo recibe `{ headers, idColumn, rows: [{ row, values }] , warnings }` y devuelve `{ row, id }`.
- `readWorkbook(path)`: ExcelJS, **primera hoja**, fila 1 = títulos. `cellText` toma el resultado de fórmulas, rich text e hipervínculos y conserva los IDs numéricos como texto (`22222222222`). Un número que Excel ya truncó sale en notación científica y la UI lo marca como inválido. Recorta filas vacías del final.
- Columna de números: primer título con `REFERENCIA` u `OPERATION` (ignora las columnas `MP …`); si no hay, la primera.
- `.xls` se convierte con SheetJS a `.xlsx` en memoria (sin formatos, con advertencia). Las partes que ExcelJS no reescribe fielmente (gráficos, tablas dinámicas, macros, segmentaciones, vínculos externos, comentarios con hilos, tablas con formato) generan una advertencia al abrir.
- `writeResults(src, dest, results)`: vuelve a cargar el original, agrega o reutiliza las columnas `RESULT_COLUMNS` (`MP Estado`, `MP N° operación`, … `MP Medio de pago`), escribe solo las filas procesadas y guarda en `dest`. Rechaza `dest === src`; el diálogo de Windows confirma si se sobrescribe otro archivo. `EBUSY`/`EPERM` → «está abierto en Excel».
- Rango: `startRow`/`endRow` en `app.ts` (`rangeError` valida). Fuera del rango no se toca nada; sin número → `skipped`; inválido → `error`.
- Duplicados: el scraper busca cada número una vez y aplica el resultado a todas sus filas. Los resultados se asocian por **número de fila**, nunca por valor.

## Reglas

- El original es de solo lectura.
- Importes: números, `null` → celda vacía, `0` → 0; formato `#,##0.00`. No redondear más allá de centavos.
- No uses Excel reales de OSEP o Mercado Pago como fixtures.

## Pruebas

`electron/test/excel-file.test.js` arma libros con ExcelJS en una carpeta temporal y verifica el original intacto (sha256), las hojas, fórmulas y formatos conservados, el cero frente al vacío, la reutilización de columnas y el `.xls`. Agregá casos ahí.
