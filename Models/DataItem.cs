using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace MercadoPagoScraper.Models
{
    public class DataItem
    {
        [JsonPropertyName("elements")]
        public List<Element> Elements { get; set; }
    }
}
