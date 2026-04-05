const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  try {
    const { sujeto, testimonio } = JSON.parse(event.body);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // ── 1. POEMA — gemini-1.5-flash (modelo estable) ──
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Actúa como el Oráculo del Umbral de Thanotectas.
Escribe una cápsula poética y mística breve (máximo 60 palabras) sobre la pérdida de: ${sujeto}.
${testimonio ? `Contexto del guardián: ${testimonio}.` : ""}
Tono: solemne, melancólico, místico. Español elegante de Colombia.
Usa primera persona plural (nosotros, los que quedamos).
Cierra con un verso corto en latín, quechua o lengua indígena colombiana.
Sin asteriscos, sin comillas, sin markdown. Solo el texto poético.`;

    const result   = await model.generateContent(prompt);
    const response = await result.response;
    const poema    = response.text().trim();

    // ── 2. IMAGEN — intento separado, no bloquea el poema ──
    let imagen = "";
    try {
      const modelImage = genAI.getGenerativeModel({
        model: "imagen-3.0-generate-002"
      });

      const resultImage = await modelImage.generateImages({
        prompt: `Una visión artística, oscura y etérea de "${sujeto}" emergiendo de neblina mística.
                 Estilo Thanotectas, colores ocre y musgo oscuro, cinematográfico, sagrado,
                 sin texto, sin personas, fotorrealista.`,
        numberOfImages: 1,
        aspectRatio: "16:9",
      });

      const bytes = resultImage.images?.[0]?.imageBytes;
      if (bytes) imagen = `data:image/png;base64,${bytes}`;

    } catch (imgErr) {
      // La imagen falla silenciosamente — el poema siempre llega
      console.warn("[Oráculo] Imagen no generada:", imgErr.message);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ poema, imagen }),
    };

  } catch (error) {
    console.error("[Oráculo] Error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
