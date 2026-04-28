require('dotenv').config();
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

async function analizarDatos(datos) {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "Eres un analista de datos." },
      { role: "user", content: `Analiza estos datos: ${JSON.stringify(datos)}` }
    ],
  });
  console.log(response.data.choices[0].message.content);
}

// Ejemplo de uso:
analizarDatos({ ejemplo: "valor" });
