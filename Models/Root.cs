using System.Text.Json.Serialization;

namespace MercadoPagoScraper.Models
{
    public class Root
    {
        [JsonPropertyName("pageState")]
        public PageState PageState { get; set; }
    }
}
