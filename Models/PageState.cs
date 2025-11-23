using System.Text.Json.Serialization;

namespace MercadoPagoScraper.Models
{
    public class PageState
    {
        [JsonPropertyName("detailData")]
        public DetailData DetailData { get; set; }
    }
}
