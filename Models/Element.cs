using System.Text.Json.Serialization;

namespace MercadoPagoScraper.Models
{
    public class Element
    {
        [JsonPropertyName("title")]
        public string Title { get; set; }

        [JsonPropertyName("amount")]
        public Amount Amount { get; set; }
    }
}
