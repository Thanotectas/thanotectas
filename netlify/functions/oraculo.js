// Sin SDK — fetch directo a v1beta donde tu key SÍ tiene acceso
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  try {
    const { sujeto, testimonio } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    const prompt = `Actúa como el Oráculo del Umbral de Thanotectas.
Escribe una cápsula poética y mística breve (máximo 60 palabras) sobre la pérdida de: ${sujeto}.
${testimonio ? `Testimonio del guardián: ${testimonio}.` : ""}
Tono: solemne, melancólico, místico. Español elegante de Colombia.
Usa primera persona plural (nosotros, los que quedamos).
Cierra con un verso corto en latín, quechua o lengua indígena colombiana.
Sin asteriscos, sin comillas, sin markdown. Solo el texto poético.`;

    // Usamos v1beta con gemini-2.5-flash — confirmado en tu lista de modelos
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.9,
          }
        })
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini ${res.status}: ${errBody}`);
    }

    const data  = await res.json();
    const poema = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!poema) throw new Error("Respuesta vacía de Gemini");

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
