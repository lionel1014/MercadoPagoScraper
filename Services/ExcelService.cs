using ClosedXML.Excel;
using MercadoPagoScraper.Models;
using System;
using System.Collections.Generic;
using System.Linq;

namespace MercadoPagoScraper.Services
{
    public class ExcelService
    {
        private XLWorkbook _workbook;
        private IXLWorksheet _worksheet;
        private string _filePath;

        public void OpenWorkbook(string filePath)
        {
            _filePath = filePath;
            _workbook = new XLWorkbook(filePath);
            _worksheet = _workbook.Worksheet(1);
        }

        public int GetLastRow()
        {
            return _worksheet.LastRowUsed().RowNumber();
        }

        public string GetAuthId(int row)
        {
            return _worksheet.Cell(row, 1).GetString();
        }

        public void UpdateRow(int row, DetailData data)
        {
            // Asumiendo columnas: 
            // 1: AuthID (ya existe)
            // 2: Estado/Resultado
            // 3: Fecha
            // 4: Operacion ID
            // 5: Cobro
            // 6: Impuesto C/D
            // 7: Impuesto Prov
            // 8: Cargo MP
            // 9: Total
            // 10: Medio Pago

            if (data == null)
            {
                _worksheet.Cell(row, 2).Value = "No encontrado";
                return;
            }

            _worksheet.Cell(row, 2).Value = "Encontrado";
            _worksheet.Cell(row, 3).Value = data.DateIso; // Podrías formatear aquí si quisieras
            _worksheet.Cell(row, 4).Value = data.OperationId;
            _worksheet.Cell(row, 5).Value = data.Cobro;
            _worksheet.Cell(row, 6).Value = data.ImpuestoCreditosDebitos;
            _worksheet.Cell(row, 7).Value = data.ImpuestoProvincial;
            _worksheet.Cell(row, 8).Value = data.CargoMp;
            _worksheet.Cell(row, 9).Value = data.Total;
            _worksheet.Cell(row, 10).Value = data.MedioPago;
        }

        public void Save()
        {
            _workbook.Save();
        }
    }
}
