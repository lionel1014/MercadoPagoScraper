using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace MercadoPagoScraper.Models
{
    public class Section
    {
        [JsonPropertyName("data")]
        public List<DataItem> Data { get; set; }
    }
}
