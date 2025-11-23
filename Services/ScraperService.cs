using MercadoPagoScraper.Models;
using Microsoft.Playwright;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace MercadoPagoScraper.Services
{
    public class ScraperService : IDisposable
    {
        private IPlaywright _playwright;
        private IBrowser _browser;
        private IPage _page;

        public async Task InitializeAsync(string remoteDebuggingUrl = "http://localhost:9222")
        {
            _playwright = await Playwright.CreateAsync();
            _browser = await _playwright.Chromium.ConnectOverCDPAsync(remoteDebuggingUrl);
            _page = _browser.Contexts[0].Pages[0];
        }

        public async Task NavigateToActivitiesAsync()
        {
            await _page.GotoAsync("https://www.mercadopago.com.ar/activities/1",
                new PageGotoOptions { WaitUntil = WaitUntilState.DOMContentLoaded });
        }

        public async Task<DetailData> SearchAndExtractAsync(string authId, Action<string> logCallback)
        {
            var inputBuscar = _page.Locator("input[placeholder='Buscar']");
            await inputBuscar.WaitForAsync();

            logCallback($"Buscando operación: {authId}");
            await inputBuscar.FillAsync(authId);
            await inputBuscar.PressAsync("Enter");

            await _page.WaitForTimeoutAsync(2000);

            var allListItems = _page.Locator("a[href*='/activities/detail/']");
            var count = await allListItems.CountAsync();

            if (count > 0)
            {
                await allListItems.First.ClickAsync();
                await _page.WaitForTimeoutAsync(3000);

                var jsonText = await _page.TextContentAsync("#__PRELOADED_STATE__");
                var data = ParseJsonData(jsonText);

                await _page.GoBackAsync();
                await _page.WaitForLoadStateAsync(LoadState.DOMContentLoaded);
                await _page.WaitForTimeoutAsync(2000);

                // Re-wait for input to be ready for next iteration
                await _page.Locator("input[placeholder='Buscar']").WaitForAsync();

                return data;
            }
            else
            {
                // Limpiar búsqueda si no se encontró
                // A veces es necesario borrar el input o navegar de nuevo si queda sucio
                // Por simplicidad, intentamos borrar el input:
                await inputBuscar.FillAsync(""); 
                // Opcional: recargar si el estado queda raro
                return null;
            }
        }

        private DetailData ParseJsonData(string jsonText)
        {
            if (string.IsNullOrEmpty(jsonText)) return null;

            using var doc = JsonDocument.Parse(jsonText);
            var detail = doc.RootElement.GetProperty("pageState").GetProperty("detailData");

            var result = new DetailData();
            
            if (detail.TryGetProperty("operationId", out var opId))
                result.OperationId = opId.GetInt64();
            
            if (detail.TryGetProperty("date", out var date))
                result.DateIso = date.GetString();

            if (detail.TryGetProperty("sections", out var sections) && sections.ValueKind == JsonValueKind.Array)
            {
                foreach (var sectionArray in sections.EnumerateArray())
                {
                    if (sectionArray.ValueKind != JsonValueKind.Array) continue;

                    foreach (var section in sectionArray.EnumerateArray())
                    {
                        if (!section.TryGetProperty("id", out var sectionId)) continue;

                        if (sectionId.GetString() == "ticket-v2" && section.TryGetProperty("data", out var ticketData))
                        {
                            ExtractTicketData(ticketData, result);
                        }

                        if (sectionId.GetString() == "payment-v2" && section.TryGetProperty("data", out var payData))
                        {
                            ExtractPaymentData(payData, result);
                        }
                    }
                }
            }
            return result;
        }

        private void ExtractTicketData(JsonElement ticketData, DetailData result)
        {
            if (ticketData.TryGetProperty("items", out var items))
            {
                // Cobro
                if (items.TryGetProperty("main", out var main) &&
                    main.TryGetProperty("elements", out var mainElements) &&
                    mainElements.ValueKind == JsonValueKind.Array &&
                    mainElements.EnumerateArray().Any())
                {
                    result.Cobro = GetAmountFromElement(mainElements.EnumerateArray().First());
                }

                // Impuestos
                if (items.TryGetProperty("withholdings", out var withholdings) &&
                    withholdings.TryGetProperty("elements", out var whElements) &&
                    whElements.ValueKind == JsonValueKind.Array)
                {
                    foreach (var wh in whElements.EnumerateArray())
                    {
                        var titulo = wh.GetProperty("title").GetString();
                        var monto = GetAmountFromElement(wh);

                        if (titulo == "Impuesto sobre los Créditos y Débitos")
                        {
                            result.ImpuestoCreditosDebitos = monto;
                        }
                        else
                        {
                            result.ImpuestoProvincial = monto;
                            // result.RetencionNombre = titulo; 
                        }
                    }
                }

                // Cargo MP
                if (items.TryGetProperty("charges_mp", out var charges) &&
                    charges.TryGetProperty("elements", out var chargeElements) &&
                    chargeElements.ValueKind == JsonValueKind.Array &&
                    chargeElements.EnumerateArray().Any())
                {
                    result.CargoMp = GetAmountFromElement(chargeElements.EnumerateArray().First());
                }
            }

            // Total
            if (ticketData.TryGetProperty("total", out var totalElement) &&
                totalElement.TryGetProperty("amount", out var totalAmount))
            {
                result.Total = GetAmountFromAmountObject(totalAmount);
            }
        }

        private void ExtractPaymentData(JsonElement payData, DetailData result)
        {
            if (payData.TryGetProperty("items", out var payItems) &&
                payItems.ValueKind == JsonValueKind.Array)
            {
                var firstItem = payItems.EnumerateArray().FirstOrDefault();
                if (firstItem.ValueKind != JsonValueKind.Undefined &&
                    firstItem.TryGetProperty("payments", out var payments) &&
                    payments.ValueKind == JsonValueKind.Array &&
                    payments.EnumerateArray().Any())
                {
                    result.MedioPago = payments.EnumerateArray().First().GetProperty("title").GetString();
                }
            }
        }

        private decimal GetAmountFromElement(JsonElement element)
        {
            if (element.TryGetProperty("amount", out var amount))
            {
                return GetAmountFromAmountObject(amount);
            }
            return 0;
        }

        private decimal GetAmountFromAmountObject(JsonElement amount)
        {
            if (amount.TryGetProperty("fraction", out var fraction) &&
                amount.TryGetProperty("cents", out var cents))
            {
                var fractionStr = fraction.GetString();
                var centsStr = cents.GetString();

                if (decimal.TryParse(fractionStr, out var fractionValue) &&
                    int.TryParse(centsStr, out var centsValue))
                {
                    if (fractionValue < 0)
                        return fractionValue - (centsValue / 100m);
                    else
                        return fractionValue + (centsValue / 100m);
                }
            }
            return 0;
        }

        public void Dispose()
        {
            _playwright?.Dispose();
        }
    }
}
