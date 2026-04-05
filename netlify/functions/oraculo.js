const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  try {
    const { sujeto, testimonio } = JSON.parse(event.body);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // ── 1. POEMA ─────────────────────────────────────────
    // gemini-2.0-flash-exp funciona en v1beta con facturación activa
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const prompt = `Actúa como el Oráculo del Umbral de Thanotectas.
Escribe una cápsula poética y mística breve (máximo 60 palabras) sobre la pérdida de: ${sujeto}.
${testimonio ? `Testimonio del guardián: ${testimonio}.` : ""}
Tono: solemne, melancólico, místico. Español elegante de Colombia.
Usa primera persona plural (nosotros, los que quedamos).
Cierra con un verso corto en latín, quechua o lengua indígena colombiana.
Sin asteriscos, sin comillas, sin markdown. Solo el texto poético.`;

    const result = await model.generateContent(prompt);
    const poema  = result.response.text().trim();

    // ── 2. IMAGEN — fallo silencioso, no cancela el poema ──
    let imagen = "";
    try {
      const modelImage = genAI.getGenerativeModel({
        model: "imagen-3.0-generate-002"
      });
      const resultImage = await modelImage.generateImages({
        prompt: `Una visión artística, oscura y etérea de "${sujeto}" emergiendo de neblina mística.
                 Colores ocre y musgo oscuro, cinematográfico, sagrado, sin texto, sin personas.`,
        numberOfImages: 1,
        aspectRatio: "16:9",
      });
      const bytes = resultImage.images?.[0]?.imageBytes;
      if (bytes) imagen = `data:image/png;base64,${bytes}`;
    } catch (imgErr) {
      console.warn("[Imagen] No generada:", imgErr.message);
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
