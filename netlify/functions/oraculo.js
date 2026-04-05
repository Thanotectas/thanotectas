const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  try {
    const { sujeto, testimonio } = JSON.parse(event.body);

    // apiVersion en el constructor — forma correcta de forzar v1beta
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
      apiVersion: "v1beta"
    });

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Actúa como el Oráculo del Umbral de Thanotectas.
Escribe una cápsula poética y mística breve (máximo 60 palabras) sobre la pérdida de: ${sujeto}.
${testimonio ? `Testimonio del guardián: ${testimonio}.` : ""}
Tono: solemne, melancólico, místico. Español elegante de Colombia.
Usa primera persona plural (nosotros, los que quedamos).
Cierra con un verso corto en latín, quechua o lengua indígena colombiana.
Sin asteriscos, sin comillas, sin markdown. Solo el texto poético.`;

    const result  = await model.generateContent(prompt);
    const poema   = result.response.text().trim();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ poema, imagen: "" }),
    };

  } catch (error) {
    console.error("[Oráculo]", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
