// Sin SDK — fetch directo a v1beta (método que ya funciona)
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  try {
    const { sujeto, testimonio } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    const promptPoema = `Actúa como el Oráculo del Umbral de Thanotectas.
Escribe una cápsula poética y mística (entre 5 y 7 líneas) sobre la pérdida de: ${sujeto}.
${testimonio ? `Testimonio del guardián: ${testimonio}.` : ""}
Tono: solemne, melancólico, místico. Español elegante de Colombia.
Usa primera persona plural (nosotros, los que quedamos).
Cierra con un verso corto en latín, quechua o lengua indígena colombiana.
Sin asteriscos, sin comillas, sin markdown. Solo el texto poético completo.`;

    const promptImagen = `Una visión artística, oscura y etérea de "${sujeto}" emergiendo de neblina mística, estilo Thanotectas, colores ocre y musgo oscuro, cinematográfico, sagrado, sin texto, sin personas, fotorrealista.`;

    // ── 1. POEMA y 2. IMAGEN — en paralelo ───────────────
    const [resPoema, resImagen] = await Promise.allSettled([

      // Poema — gemini-2.5-flash vía REST (confirmado que funciona)
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptPoema }] }],
            generationConfig: { maxOutputTokens: 800, temperature: 1.0 }
          })
        }
      ),

      // Imagen — imagen-3.0-generate-002 vía REST
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt: promptImagen }],
            parameters: { sampleCount: 1 }
          })
        }
      )
    ]);

    // ── Extraer poema (obligatorio) ───────────────────────
    if (resPoema.status === "rejected") {
      throw new Error("Error generando poema: " + resPoema.reason);
    }
    const dataPoema = await resPoema.value.json();
    if (!resPoema.value.ok) {
      throw new Error(`Gemini ${resPoema.value.status}: ${JSON.stringify(dataPoema)}`);
    }
    const poema = dataPoema.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!poema) throw new Error("Poema vacío");

    // ── Extraer imagen (opcional — falla silenciosamente) ─
    let imagen = "";
    try {
      if (resImagen.status === "fulfilled" && resImagen.value.ok) {
        const dataImagen = await resImagen.value.json();
        // Ruta correcta de la respuesta de imagen-3
        const b64 = dataImagen.predictions?.[0]?.bytesBase64Encoded;
        if (b64) imagen = `data:image/png;base64,${b64}`;
      }
    } catch (imgErr) {
      console.warn("[Imagen] No generada:", imgErr.message);
    }

    // Si imagen no llegó, usamos Unsplash como respaldo
    if (!imagen) {
      const query = encodeURIComponent(sujeto + " nature");
      imagen = `https://source.unsplash.com/800x450/?${query}`;
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
    console.error("[Oráculo]", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
