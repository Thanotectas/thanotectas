exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    var body       = JSON.parse(event.body);
    var sujeto     = (body.sujeto     || "").trim();
    var testimonio = (body.testimonio || "").trim();
    var categoria  = body.categoria   || "especies";
    var tipo       = body.tipo        || "poema";
    var idioma     = body.idioma      || "es";
    var API_KEY    = process.env.GEMINI_API_KEY;

    if (!sujeto) return { statusCode: 400, body: JSON.stringify({ error: "Campo sujeto requerido" }) };
    if (!API_KEY) return { statusCode: 500, body: JSON.stringify({ error: "API key no configurada" }) };

    // Contexto de categoría por idioma
    var cats = {
      especies:    { es: "especie animal o vegetal", en: "animal or plant species", pt: "especie animal ou vegetal", fr: "espece animale ou vegetale" },
      ecosistemas: { es: "ecosistema", en: "ecosystem", pt: "ecossistema", fr: "ecosysteme" },
      rios:        { es: "cuerpo de agua (rio, lago o glaciar)", en: "body of water (river, lake or glacier)", pt: "corpo dagua", fr: "cours deau" },
      sonidos:     { es: "sonido o fenomeno sensorial de la naturaleza", en: "natural sound or sensory phenomenon", pt: "som ou fenomeno sensorial", fr: "son ou phenomene sensoriel" },
      territorios: { es: "territorio o paisaje", en: "territory or landscape", pt: "territorio ou paisagem", fr: "territoire ou paysage" },
      saberes:     { es: "saber ancestral o lengua indigena", en: "ancestral knowledge or indigenous language", pt: "saber ancestral ou lingua indigena", fr: "savoir ancestral ou langue indigene" }
    };
    var catCtx = (cats[categoria] && cats[categoria][idioma]) || "especie o lugar";

    // Contexto de testimonio
    var testCtx = "";
    if (testimonio) {
      var tPrefixes = { es: ". Testimonio del guardian: ", en: ". Guardian testimony: ", pt: ". Testemunho: ", fr: ". Temoignage: " };
      testCtx = (tPrefixes[idioma] || tPrefixes.es) + testimonio;
    }

    // Cierre ancestral según territorio
    var ancestral = {
      es: "Cierra con un verso corto en latin, quechua, wayuunaiki, nahuatl, guna o la lengua indigena mas cercana al territorio mencionado. Si el territorio no es latinoamericano usa latin.",
      en: "Close with a short verse in Latin, Quechua, Nahuatl, or the indigenous language closest to the mentioned territory. If not Latin American, use Latin.",
      pt: "Feche com um verso curto em latim, quechua, guarani ou a lingua indigena mais proxima do territorio mencionado. Se nao for latino-americano, use latim.",
      fr: "Terminez par un vers court en latin, quechua ou la langue indigene la plus proche du territoire mentionne. Si ce n est pas latino-americain, utilisez le latin."
    };
    var ancestralLine = ancestral[idioma] || ancestral.es;

    // Base info para todos los tipos
    var base = catCtx + ": " + sujeto + testCtx;

    // Prompts por tipo e idioma
    var prompts = {
      poema: {
        es: "Eres el Oraculo del Umbral de Thanotectas. Escribe una inscripcion poetica profunda (10-14 lineas de verso libre) sobre la perdida de la siguiente " + base + ". Usa primera persona plural (nosotros, los que quedamos). Tono solemne y melancolico. Incluye al menos un detalle sensorial muy especifico y unico. " + ancestralLine + " Sin asteriscos, sin comillas, sin markdown. Solo el poema.",
        en: "You are the Oracle of the Threshold of Thanotectas. Write a deep poetic inscription (10-14 lines of free verse) about the loss of the following " + base + ". Use first person plural (we, those who remain). Solemn and melancholic tone. Include at least one very specific and unique sensory detail. " + ancestralLine + " No asterisks, no quotes, no markdown. Just the poem.",
        pt: "Voce e o Oraculo do Umbral de Thanotectas. Escreva uma inscricao poetica profunda (10-14 linhas de verso livre) sobre a perda da seguinte " + base + ". Use primeira pessoa do plural (nos, os que ficamos). Tom solemne e melancolico. Inclua pelo menos um detalhe sensorial muito especifico. " + ancestralLine + " Sem asteriscos, sem aspas, sem markdown. Apenas o poema.",
        fr: "Vous etes l Oracle du Seuil de Thanotectas. Ecrivez une inscription poetique profonde (10-14 lignes de vers libres) sur la perte de la " + base + ". Utilisez la premiere personne du pluriel. Ton solennel et melancolique. Incluez au moins un detail sensoriel tres specifique. " + ancestralLine + " Sans asterisques, sans guillemets, sans markdown. Juste le poeme."
      },
      dato: {
        es: "Eres un cientifico comunicador de Thanotectas. Escribe un reporte de 5 bloques sobre la perdida de la siguiente " + base + ". Usa estos titulos exactos en mayusculas: ESTADO (clasificacion de riesgo y poblacion estimada), CAUSA (las 3 principales amenazas con datos), EFECTO EN CASCADA (3-4 especies o procesos que dependen de este), LINEA DE TIEMPO (estimado de cuando desaparecera si la tendencia continua), LO QUE NO SABIAS (un hecho sorprendente que el mundo va a extranar). Texto limpio, sin asteriscos, sin markdown.",
        en: "You are a science communicator for Thanotectas. Write a 5-block report about the loss of the following " + base + ". Use these exact uppercase titles: STATUS (risk classification and estimated population), CAUSE (the 3 main threats with data), CASCADE EFFECT (3-4 species or processes that depend on it), TIMELINE (estimated when it will disappear if the trend continues), WHAT YOU DIDN'T KNOW (a surprising fact the world will miss). Clean text, no asterisks, no markdown.",
        pt: "Voce e um comunicador cientifico de Thanotectas. Escreva um relatorio de 5 blocos sobre a perda da seguinte " + base + ". Use estes titulos exatos em maiusculas: ESTADO, CAUSA, EFEITO EM CASCATA, LINHA DO TEMPO, O QUE VOCE NAO SABIA. Texto limpo, sem asteriscos, sem markdown.",
        fr: "Vous etes un communicant scientifique de Thanotectas. Redigez un rapport en 5 blocs sur la perte de la " + base + ". Utilisez ces titres exacts en majuscules: ETAT, CAUSE, EFFET EN CASCADE, CHRONOLOGIE, CE QUE VOUS NE SAVIEZ PAS. Texte propre, sans asterisques, sans markdown."
      },
      carta: {
        es: "Eres la siguiente " + base + ". Escribele una carta a quien te encuentre en el futuro cuando ya no existas. Escribe en primera persona singular desde tu perspectiva. 10-12 lineas. Menciona tu nombre, tu funcion en el mundo, lo que mas amaras extranar, y una pregunta o deseo para quien te lee. Tono: digno, tranquilo, sin desesperacion. Sin asteriscos, sin comillas, sin markdown.",
        en: "You are the following " + base + ". Write a letter to whoever finds you in the future when you no longer exist. Write in first person singular from your perspective. 10-12 lines. Mention your name, your function in the world, what you will miss most, and a question or wish for whoever reads this. Tone: dignified, peaceful, without desperation. No asterisks, no quotes, no markdown.",
        pt: "Voce e a seguinte " + base + ". Escreva uma carta para quem te encontrar no futuro quando voce ja nao existir. 10-12 linhas em primeira pessoa singular. Mencione seu nome, sua funcao no mundo, o que mais sentira falta, e uma pergunta ou desejo. Tom: digno, tranquilo. Sem asteriscos, sem aspas, sem markdown.",
        fr: "Vous etes la " + base + ". Ecrivez une lettre a celui qui vous trouvera dans le futur quand vous n existerez plus. 10-12 lignes a la premiere personne du singulier. Mentionnez votre nom, votre fonction, ce qui vous manquera, et une question ou un souhait. Ton: digne, paisible. Sans asterisques, sans markdown."
      },
      obituario: {
        es: "Escribe un obituario formal para la siguiente " + base + ". Como nota de prensa de una agencia ecologica internacional. Incluye: anuncio solemne de perdida, fecha estimada de extincion o colapso, causa principal (actividad humana especifica), especies o comunidades dependientes que sobreviven, legado en el ecosistema o cultura. Tono: periodistico, solemne, sin sensacionalismo. 12-15 lineas. Sin asteriscos, sin markdown.",
        en: "Write a formal obituary for the following " + base + ". As a press release from an international ecological agency. Include: solemn announcement of loss, estimated date of extinction or collapse, main cause (specific human activity), dependent species or communities that survive, legacy in the ecosystem or culture. Journalistic, solemn tone. 12-15 lines. No asterisks, no markdown.",
        pt: "Escreva um obituario formal para a seguinte " + base + ". Como comunicado de imprensa de uma agencia ecologica internacional. Inclua: anuncio solemne, data estimada de extincao, causa principal, especies dependentes que sobrevivem, legado. Tom jornalistico, solemne. 12-15 linhas. Sem asteriscos, sem markdown.",
        fr: "Redigez un avis de deces formel pour la " + base + ". Comme un communique d une agence ecologique internationale. Inclure: annonce solennelle, date estimee d extinction, cause principale, especes dependantes survivantes, heritage. Ton journalistique, solennel. 12-15 lignes. Sans asterisques, sans markdown."
      },
      alerta: {
        es: "Escribe un mensaje de alerta urgente sobre la perdida de la siguiente " + base + ". Como si lo enviara una organizacion cientifica internacional. Incluye: dato especifico de declive (porcentaje y anos), consecuencia directa para los humanos si desaparece, una comparacion que haga la perdida comprensible para alguien no especializado, y 2 acciones concretas que cualquier persona puede tomar hoy. Tono: urgente pero basado en evidencia, sin catastrofismo. 10-12 lineas. Sin asteriscos, sin markdown.",
        en: "Write an urgent alert message about the loss of the following " + base + ". As if sent by an international scientific organization. Include: specific decline data (percentage and years), direct consequence for humans if it disappears, a comparison making the loss understandable for a non-specialist, and 2 concrete actions anyone can take today. Urgent, evidence-based tone. 10-12 lines. No asterisks, no markdown.",
        pt: "Escreva uma mensagem de alerta urgente sobre a perda da seguinte " + base + ". Como enviada por uma organizacao cientifica internacional. Inclua: dado especifico de declinio, consequencia para os humanos, uma comparacao compreensivel, e 2 acoes concretas. Tom urgente, baseado em evidencias. 10-12 linhas. Sem asteriscos, sem markdown.",
        fr: "Redigez un message d alerte urgent sur la perte de la " + base + ". Comme envoye par une organisation scientifique internationale. Inclure: donnees de declin, consequence pour les humains, une comparaison comprehensible, et 2 actions concretes. Ton urgent, base sur des preuves. 10-12 lignes. Sans asterisques, sans markdown."
      },
      ritual: {
        es: "Escribe una oracion ceremonial para honrar la perdida de la siguiente " + base + ". Disenada para ser leida en voz alta, sola o en grupo. Estructura de letania: frases que se repiten y construyen. Incluye invocacion, reconocimiento de la perdida, peticion de memoria colectiva, y cierre de despedida. Donde haya respuesta del coro escribe (Que sea recordado) o similar entre parentesis. Tono: sagrado, ancestral, transdimensional. 12-16 lineas. Sin asteriscos, sin markdown.",
        en: "Write a ceremonial prayer to honor the loss of the following " + base + ". Designed to be read aloud alone or in a group. Litany structure: phrases that repeat and build. Include invocation, acknowledgment of loss, petition for collective memory, closing farewell. Where there is a chorus response write (Let it be remembered) in parentheses. Sacred, ancestral tone. 12-16 lines. No asterisks, no markdown.",
        pt: "Escreva uma oracao ceremonial para honrar a perda da seguinte " + base + ". Estrutura de ladainha para ser lida em voz alta. Inclua invocacao, reconhecimento, peticao de memoria e despedida. Tom sagrado, ancestral. 12-16 linhas. Sem asteriscos, sem markdown.",
        fr: "Redigez une priere ceremonielle pour honorer la perte de la " + base + ". Structure de litanie pour etre lue a voix haute. Inclure invocation, reconnaissance, petition de memoire et adieu. Ton sacre, ancestral. 12-16 lignes. Sans asterisques, sans markdown."
      }
    };

    var tipoPrompts = prompts[tipo] || prompts.poema;
    var prompt = tipoPrompts[idioma] || tipoPrompts.es;

    // Llamada a Gemini
    var res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1500, temperature: 1.1 }
        })
      }
    );

    if (!res.ok) {
      var errText = await res.text();
      throw new Error("Gemini " + res.status + ": " + errText);
    }

    var data = await res.json();
    var poema = "";
    try { poema = data.candidates[0].content.parts[0].text.trim(); } catch(e) {}
    if (!poema) throw new Error("Respuesta vacia de Gemini");

    // Imagen Unsplash por categoría
    var queryMap = {
      especies:    "endangered wildlife animal nature dark moody",
      ecosistemas: "rainforest ecosystem jungle misty atmospheric",
      rios:        "river glacier water landscape dark melancholic",
      sonidos:     "misty forest nature silence atmospheric dark",
      territorios: "mountain landscape wilderness dark dramatic",
      saberes:     "indigenous ritual forest fire dark atmospheric"
    };
    var q = encodeURIComponent((queryMap[categoria] || sujeto) + " melancholic");
    var imagen = "https://source.unsplash.com/800x450/?" + q + "&sig=" + Date.now();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ poema: poema, imagen: imagen })
    };

  } catch (error) {
    console.error("[Oraculo]", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
