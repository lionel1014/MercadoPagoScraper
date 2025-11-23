using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace MercadoPagoScraper.Models
{
    public class DetailData
    {
        [JsonPropertyName("operationId")]
        public long OperationId { get; set; }

        [JsonPropertyName("date")]
        public string DateIso { get; set; } // Renamed to match usage or map correctly

        [JsonPropertyName("sections")]
        public List<List<Section>> Sections { get; set; }

        // Properties populated manually
        public decimal Cobro { get; set; }
        public decimal ImpuestoCreditosDebitos { get; set; }
        public decimal ImpuestoProvincial { get; set; }
        public decimal CargoMp { get; set; }
        public decimal Total { get; set; }
        public string MedioPago { get; set; }
    }
}
