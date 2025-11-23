using MercadoPagoScraper.Services;
using Microsoft.Win32;
using System;
using System.Windows;

namespace MercadoPagoScraper
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
        }

        private void BtnSelectFile_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog();
            dialog.Filter = "Excel Files|*.xlsx";
            if (dialog.ShowDialog() == true)
            {
                txtFilePath.Text = dialog.FileName;
                Log($"Archivo seleccionado: {dialog.FileName}");
            }
        }

        private async void BtnProcess_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrEmpty(txtFilePath.Text))
            {
                MessageBox.Show("Seleccione un archivo Excel primero.");
                return;
            }

            int startRow = int.TryParse(txtStartRow.Text, out var r) ? r : 2;
            Log($"Procesando desde fila {startRow}...");

            try
            {
                var excelService = new ExcelService();
                excelService.OpenWorkbook(txtFilePath.Text);

                using var scraperService = new ScraperService();
                // Asegúrate de que Chrome esté abierto con: chrome.exe --remote-debugging-port=9222
                await scraperService.InitializeAsync();
                await scraperService.NavigateToActivitiesAsync();

                int lastRow = excelService.GetLastRow();

                for (int row = startRow; row <= lastRow; row++)
                {
                    var authId = excelService.GetAuthId(row);
                    if (string.IsNullOrWhiteSpace(authId)) continue;

                    var data = await scraperService.SearchAndExtractAsync(authId, Log);

                    if (data != null)
                    {
                        Log($"Encontrado: {data.OperationId} - {data.Total:C}");
                        excelService.UpdateRow(row, data);
                    }
                    else
                    {
                        Log($"No encontrado: {authId}");
                        excelService.UpdateRow(row, null);
                    }
                }

                excelService.Save();
                Log("Proceso finalizado y Excel actualizado.");
                MessageBox.Show("Proceso finalizado con éxito.");
            }
            catch (Exception ex)
            {
                Log($"Error: {ex.Message}");
                MessageBox.Show($"Ocurrió un error: {ex.Message}");
            }
        }

        private void Log(string msg)
        {
            // Necesitamos invocar al hilo de la UI porque Log puede ser llamado desde tareas asíncronas
            Dispatcher.Invoke(() =>
            {
                txtLogs.AppendText(msg + "\n");
                txtLogs.ScrollToEnd();
            });
        }
    }
}