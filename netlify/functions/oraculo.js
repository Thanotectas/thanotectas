const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  try {
    const { sujeto, testimonio } = JSON.parse(event.body);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // ── 1. POEMA — gemini-1.5-flash ──────────────────────────
    const modelText = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: "Eres el Oráculo del Umbral. Crea una inscripción poética breve (máx 60 palabras) para algo que la Tierra pierde. Tono: místico, solemne, melancólico. Usa un español elegante de Colombia."
    });

    const resultText = await modelText.generateContent(
      `Inscribe: ${sujeto}. Contexto: ${testimonio || "ninguno"}`
    );
    const poema = resultText.response.text().trim();

    // ── 2. IMAGEN — imagen-3.0-generate-002 ──────────────────
    // Se intenta por separado para que un fallo no cancele el poema
    let imagenBase64 = "";
    try {
      const modelImage = genAI.getGenerativeModel({
        model: "imagen-3.0-generate-002"   // ← nombre correcto
      });

      const promptImage = `Una visión artística, oscura y etérea de ${sujeto} emergiendo de neblina mística, estilo Thanotectas, colores ocre y musgo, cinematográfico, sagrado.`;

      // ← API correcta para Imagen: generateImages(), no generateContent()
      const resultImage = await modelImage.generateImages({
        prompt: promptImage,
        numberOfImages: 1,
        aspectRatio: "16:9",
      });

      // ← ruta correcta de la respuesta
      const bytes = resultImage.images?.[0]?.imageBytes;
      if (bytes) imagenBase64 = `data:image/png;base64,${bytes}`;

    } catch (imgError) {
      // La imagen falla silenciosamente — el poema siempre llega
      console.warn("[Imagen] No se generó imagen:", imgError.message);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poema, imagen: imagenBase64 }),
    };

  } catch (error) {
    console.error("[Oráculo] Error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
