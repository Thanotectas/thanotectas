// ═══════════════════════════════════════════════════════════════
// Thanotectas · Oráculo del Umbral — Generación de cápsulas
// ═══════════════════════════════════════════════════════════════
// Requiere: GEMINI_API_KEY en Netlify environment variables
// ═══════════════════════════════════════════════════════════════

// ── Headers CORS reutilizables ──────────────────────────────────
var CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function respond(statusCode, bodyObj) {
  return { statusCode: statusCode, headers: CORS_HEADERS, body: JSON.stringify(bodyObj) };
}

exports.handler = async function(event) {

  // ✅ Manejar preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  try {
    var body       = JSON.parse(event.body);
    var sujeto     = (body.sujeto     || "").trim();
    var testimonio = (body.testimonio || "").trim();
    var categoria  = body.categoria   || "especies";
    var tipo       = body.tipo        || "poema";
    var idioma     = body.idioma      || "es";
    var plan       = body.plan        || "gratis";  // gratis | explorador | guardian
    var API_KEY    = process.env.GEMINI_API_KEY;

    if (!sujeto) return respond(400, { error: "Campo sujeto requerido" });
    if (!API_KEY) return respond(500, { error: "API key no configurada" });

    // ── Validar tipo según plan ─────────────────────────────────
    var tiposGratis     = ["poema"];
    var tiposExplorador = ["poema", "dato"];
    var tiposGuardian   = ["poema", "dato", "carta", "obituario", "alerta", "ritual"];

    var tiposPermitidos;
    if (plan === "guardian")        tiposPermitidos = tiposGuardian;
    else if (plan === "explorador") tiposPermitidos = tiposExplorador;
    else                            tiposPermitidos = tiposGratis;

    if (tiposPermitidos.indexOf(tipo) === -1) {
      tipo = tiposPermitidos[0]; // fallback al primer tipo permitido
    }

    // ── Idiomas válidos según plan ──────────────────────────────
    var idiomasBase    = ["es", "en", "pt", "fr"];
    var idiomasExtend  = ["es", "en", "pt", "fr", "de", "it", "ja", "ar"];
    var idiomasPermitidos = (plan === "guardian") ? idiomasExtend : idiomasBase;

    if (idiomasPermitidos.indexOf(idioma) === -1) {
      idioma = "es"; // fallback
    }

    // ── maxOutputTokens según plan ──────────────────────────────
    var maxTokens;
    if (plan === "guardian")        maxTokens = 3000;
    else if (plan === "explorador") maxTokens = 1800;
    else                            maxTokens = 1200;

    // ── Contexto de categoría por idioma ────────────────────────
    var cats = {
      especies:    { es: "especie animal o vegetal", en: "animal or plant species", pt: "especie animal ou vegetal", fr: "espece animale ou vegetale", de: "Tier- oder Pflanzenart", it: "specie animale o vegetale", ja: "動植物の種", ar: "نوع حيواني أو نباتي" },
      ecosistemas: { es: "ecosistema", en: "ecosystem", pt: "ecossistema", fr: "ecosysteme", de: "Ökosystem", it: "ecosistema", ja: "生態系", ar: "نظام بيئي" },
      rios:        { es: "cuerpo de agua (rio, lago o glaciar)", en: "body of water (river, lake or glacier)", pt: "corpo dagua", fr: "cours deau", de: "Gewässer (Fluss, See oder Gletscher)", it: "corpo idrico", ja: "水域（川、湖、氷河）", ar: "مسطح مائي" },
      sonidos:     { es: "sonido o fenomeno sensorial de la naturaleza", en: "natural sound or sensory phenomenon", pt: "som ou fenomeno sensorial", fr: "son ou phenomene sensoriel", de: "Naturklang oder sensorisches Phänomen", it: "suono o fenomeno sensoriale", ja: "自然の音や感覚現象", ar: "صوت أو ظاهرة حسية طبيعية" },
      territorios: { es: "territorio o paisaje", en: "territory or landscape", pt: "territorio ou paisagem", fr: "territoire ou paysage", de: "Territorium oder Landschaft", it: "territorio o paesaggio", ja: "領土や風景", ar: "إقليم أو منظر طبيعي" },
      saberes:     { es: "saber ancestral o lengua indigena", en: "ancestral knowledge or indigenous language", pt: "saber ancestral ou lingua indigena", fr: "savoir ancestral ou langue indigene", de: "Ahnenwissen oder indigene Sprache", it: "sapere ancestrale o lingua indigena", ja: "先祖の知恵や先住民の言語", ar: "معرفة أسلاف أو لغة أصلية" }
    };
    var catCtx = (cats[categoria] && cats[categoria][idioma]) || (cats[categoria] && cats[categoria].es) || "especie o lugar";

    // ── Contexto de testimonio ──────────────────────────────────
    var testCtx = "";
    if (testimonio) {
      var tPrefixes = { es: ". Testimonio del guardian: ", en: ". Guardian testimony: ", pt: ". Testemunho: ", fr: ". Temoignage: ", de: ". Zeugnis des Hüters: ", it: ". Testimonianza: ", ja: ". 証言: ", ar: ". شهادة: " };
      testCtx = (tPrefixes[idioma] || tPrefixes.es) + testimonio;
    }

    // ── Cierre ancestral ────────────────────────────────────────
    var ancestral = {
      es: "Cierra con un verso corto en latin, quechua, wayuunaiki, nahuatl, guna o la lengua indigena mas cercana al territorio mencionado. Si el territorio no es latinoamericano usa latin.",
      en: "Close with a short verse in Latin, Quechua, Nahuatl, or the indigenous language closest to the mentioned territory. If not Latin American, use Latin.",
      pt: "Feche com um verso curto em latim, quechua, guarani ou a lingua indigena mais proxima do territorio mencionado. Se nao for latino-americano, use latim.",
      fr: "Terminez par un vers court en latin, quechua ou la langue indigene la plus proche du territoire mentionne. Si ce n est pas latino-americain, utilisez le latin.",
      de: "Schließe mit einem kurzen Vers in Latein, Quechua oder der dem Territorium nächsten indigenen Sprache.",
      it: "Chiudi con un breve verso in latino, quechua o nella lingua indigena più vicina al territorio menzionato.",
      ja: "言及された領土に最も近い先住民の言語、ケチュア語、またはラテン語の短い詩で締めくくってください。",
      ar: "أغلق ببيت شعري قصير باللاتينية أو الكيتشوا أو أقرب لغة أصلية للمنطقة المذكورة."
    };
    var ancestralLine = ancestral[idioma] || ancestral.es;

    // ── Base info ───────────────────────────────────────────────
    var base = catCtx + ": " + sujeto + testCtx;

    // ── Instrucción de extensión para Guardián ──────────────────
    var extGuardian = "";
    if (plan === "guardian") {
      var extTexts = {
        es: " Extiende el contenido: agrega mas detalles, datos especificos, referencias historicas o culturales. Haz que sea notablemente mas profundo y completo que una version basica.",
        en: " Extend the content: add more details, specific data, historical or cultural references. Make it noticeably deeper and more complete than a basic version.",
        pt: " Estenda o conteudo: adicione mais detalhes, dados especificos, referencias historicas ou culturais. Torne-o notavelmente mais profundo e completo.",
        fr: " Etendez le contenu: ajoutez plus de details, des donnees specifiques, des references historiques ou culturelles. Rendez-le sensiblement plus profond et complet.",
        de: " Erweitern Sie den Inhalt: fügen Sie mehr Details, spezifische Daten, historische oder kulturelle Referenzen hinzu. Machen Sie es deutlich tiefer und vollständiger.",
        it: " Estendi il contenuto: aggiungi più dettagli, dati specifici, riferimenti storici o culturali. Rendilo notevolmente più profondo e completo.",
        ja: " 内容を拡張してください：より多くの詳細、具体的なデータ、歴史的または文化的参照を追加してください。基本版よりも明らかに深く完全なものにしてください。",
        ar: " وسع المحتوى: أضف مزيداً من التفاصيل والبيانات المحددة والمراجع التاريخية أو الثقافية. اجعله أعمق وأكمل بشكل ملحوظ."
      };
      extGuardian = extTexts[idioma] || extTexts.es;
    }

    // ── Prompts por tipo e idioma ────────────────────────────────
    var prompts = {
      poema: {
        es: "Eres el Oraculo del Umbral de Thanotectas. Escribe una inscripcion poetica profunda (10-14 lineas de verso libre) sobre la perdida de la siguiente " + base + ". Usa primera persona plural (nosotros, los que quedamos). Tono solemne y melancolico. Incluye al menos un detalle sensorial muy especifico y unico. " + ancestralLine + extGuardian + " Sin asteriscos, sin comillas, sin markdown. Solo el poema.",
        en: "You are the Oracle of the Threshold of Thanotectas. Write a deep poetic inscription (10-14 lines of free verse) about the loss of the following " + base + ". Use first person plural (we, those who remain). Solemn and melancholic tone. Include at least one very specific and unique sensory detail. " + ancestralLine + extGuardian + " No asterisks, no quotes, no markdown. Just the poem.",
        pt: "Voce e o Oraculo do Umbral de Thanotectas. Escreva uma inscricao poetica profunda (10-14 linhas de verso livre) sobre a perda da seguinte " + base + ". Use primeira pessoa do plural (nos, os que ficamos). Tom solemne e melancolico. Inclua pelo menos um detalhe sensorial muito especifico. " + ancestralLine + extGuardian + " Sem asteriscos, sem aspas, sem markdown. Apenas o poema.",
        fr: "Vous etes l Oracle du Seuil de Thanotectas. Ecrivez une inscription poetique profonde (10-14 lignes de vers libres) sur la perte de la " + base + ". Utilisez la premiere personne du pluriel. Ton solennel et melancolique. Incluez au moins un detail sensoriel tres specifique. " + ancestralLine + extGuardian + " Sans asterisques, sans guillemets, sans markdown. Juste le poeme.",
        de: "Sie sind das Orakel der Schwelle von Thanotectas. Schreiben Sie eine tiefe poetische Inschrift (10-14 Zeilen freier Vers) über den Verlust der folgenden " + base + ". Verwenden Sie die erste Person Plural. Feierlicher und melancholischer Ton. Mindestens ein sehr spezifisches sensorisches Detail. " + ancestralLine + extGuardian + " Keine Sternchen, kein Markdown. Nur das Gedicht.",
        it: "Sei l'Oracolo della Soglia di Thanotectas. Scrivi un'iscrizione poetica profonda (10-14 righe di verso libero) sulla perdita della seguente " + base + ". Usa la prima persona plurale. Tono solenne e malinconico. Almeno un dettaglio sensoriale molto specifico. " + ancestralLine + extGuardian + " Niente asterischi, niente markdown. Solo la poesia.",
        ja: "あなたはThanotectasの門のオラクルです。以下の" + base + "の喪失について、深い詩的碑文（自由詩10-14行）を書いてください。一人称複数（私たち、残された者たち）を使用。厳粛で憂鬱な調子。非常に具体的でユニークな感覚的詳細を含めてください。" + ancestralLine + extGuardian + " アスタリスクなし、マークダウンなし。詩だけ。",
        ar: "أنت أوراكل العتبة في ثانوتيكتاس. اكتب نقشاً شعرياً عميقاً (10-14 سطراً من الشعر الحر) عن فقدان " + base + ". استخدم صيغة الجمع المتكلم. نبرة رسمية وحزينة. تفصيل حسي محدد وفريد. " + ancestralLine + extGuardian + " بدون علامات نجمية أو تنسيق. القصيدة فقط."
      },
      dato: {
        es: "Eres un cientifico comunicador de Thanotectas. Escribe un reporte de 5 bloques sobre la perdida de la siguiente " + base + ". Usa estos titulos exactos en mayusculas: ESTADO (clasificacion de riesgo y poblacion estimada), CAUSA (las 3 principales amenazas con datos), EFECTO EN CASCADA (3-4 especies o procesos que dependen de este), LINEA DE TIEMPO (estimado de cuando desaparecera si la tendencia continua), LO QUE NO SABIAS (un hecho sorprendente que el mundo va a extranar)." + extGuardian + " Texto limpio, sin asteriscos, sin markdown.",
        en: "You are a science communicator for Thanotectas. Write a 5-block report about the loss of the following " + base + ". Use these exact uppercase titles: STATUS (risk classification and estimated population), CAUSE (the 3 main threats with data), CASCADE EFFECT (3-4 species or processes that depend on it), TIMELINE (estimated when it will disappear if the trend continues), WHAT YOU DIDN'T KNOW (a surprising fact the world will miss)." + extGuardian + " Clean text, no asterisks, no markdown.",
        pt: "Voce e um comunicador cientifico de Thanotectas. Escreva um relatorio de 5 blocos sobre a perda da seguinte " + base + ". Use estes titulos exatos em maiusculas: ESTADO, CAUSA, EFEITO EM CASCATA, LINHA DO TEMPO, O QUE VOCE NAO SABIA." + extGuardian + " Texto limpo, sem asteriscos, sem markdown.",
        fr: "Vous etes un communicant scientifique de Thanotectas. Redigez un rapport en 5 blocs sur la perte de la " + base + ". Utilisez ces titres exacts en majuscules: ETAT, CAUSE, EFFET EN CASCADE, CHRONOLOGIE, CE QUE VOUS NE SAVIEZ PAS." + extGuardian + " Texte propre, sans asterisques, sans markdown.",
        de: "Sie sind ein Wissenschaftskommunikator von Thanotectas. Schreiben Sie einen 5-Block-Bericht über den Verlust der folgenden " + base + ". Verwenden Sie diese Titel in Großbuchstaben: STATUS, URSACHE, KASKADENEFFEKT, ZEITLINIE, WAS SIE NICHT WUSSTEN." + extGuardian + " Sauberer Text, keine Sternchen, kein Markdown.",
        it: "Sei un comunicatore scientifico di Thanotectas. Scrivi un rapporto in 5 blocchi sulla perdita della seguente " + base + ". Usa questi titoli in maiuscolo: STATO, CAUSA, EFFETTO A CASCATA, CRONOLOGIA, QUELLO CHE NON SAPEVI." + extGuardian + " Testo pulito, senza asterischi, senza markdown.",
        ja: "あなたはThanotectasの科学コミュニケーターです。以下の" + base + "の喪失について5ブロックのレポートを書いてください。大文字のタイトル：現状、原因、連鎖効果、タイムライン、知らなかったこと。" + extGuardian + " アスタリスクなし、マークダウンなし。",
        ar: "أنت مراسل علمي من ثانوتيكتاس. اكتب تقريراً من 5 كتل عن فقدان " + base + ". استخدم هذه العناوين: الحالة، السبب، التأثير المتسلسل، الجدول الزمني، ما لم تكن تعرفه." + extGuardian + " نص نظيف بدون تنسيق."
      },
      carta: {
        es: "Eres la siguiente " + base + ". Escribele una carta a quien te encuentre en el futuro cuando ya no existas. Escribe en primera persona singular desde tu perspectiva. 10-12 lineas. Menciona tu nombre, tu funcion en el mundo, lo que mas amaras extranar, y una pregunta o deseo para quien te lee. Tono: digno, tranquilo, sin desesperacion." + extGuardian + " Sin asteriscos, sin comillas, sin markdown.",
        en: "You are the following " + base + ". Write a letter to whoever finds you in the future when you no longer exist. Write in first person singular from your perspective. 10-12 lines. Mention your name, your function in the world, what you will miss most, and a question or wish for whoever reads this. Tone: dignified, peaceful, without desperation." + extGuardian + " No asterisks, no quotes, no markdown.",
        pt: "Voce e a seguinte " + base + ". Escreva uma carta para quem te encontrar no futuro quando voce ja nao existir. 10-12 linhas em primeira pessoa singular. Mencione seu nome, sua funcao no mundo, o que mais sentira falta, e uma pergunta ou desejo. Tom: digno, tranquilo." + extGuardian + " Sem asteriscos, sem aspas, sem markdown.",
        fr: "Vous etes la " + base + ". Ecrivez une lettre a celui qui vous trouvera dans le futur quand vous n existerez plus. 10-12 lignes a la premiere personne du singulier. Mentionnez votre nom, votre fonction, ce qui vous manquera, et une question ou un souhait. Ton: digne, paisible." + extGuardian + " Sans asterisques, sans markdown.",
        de: "Sie sind die folgende " + base + ". Schreiben Sie einen Brief an denjenigen, der Sie in der Zukunft findet. 10-12 Zeilen in der ersten Person Singular. Erwähnen Sie Ihren Namen, Ihre Funktion, was Sie am meisten vermissen werden, und einen Wunsch. Würdevoller, ruhiger Ton." + extGuardian + " Keine Sternchen, kein Markdown.",
        it: "Sei la seguente " + base + ". Scrivi una lettera a chi ti troverà nel futuro. 10-12 righe in prima persona singolare. Menziona il tuo nome, la tua funzione, cosa ti mancherà di più, e una domanda o desiderio. Tono: dignitoso, tranquillo." + extGuardian + " Niente asterischi, niente markdown.",
        ja: "あなたは以下の" + base + "です。未来であなたを見つける人への手紙を書いてください。一人称単数、10-12行。名前、世界での役割、最も恋しく思うこと、読む人への質問や願い。威厳のある穏やかな調子。" + extGuardian + " マークダウンなし。",
        ar: "أنت " + base + " التالي. اكتب رسالة لمن يجدك في المستقبل. 10-12 سطراً بصيغة المتكلم المفرد. اذكر اسمك ووظيفتك وما ستفتقده وسؤالاً أو أمنية. نبرة كريمة وهادئة." + extGuardian + " بدون تنسيق."
      },
      obituario: {
        es: "Escribe un obituario formal para la siguiente " + base + ". Como nota de prensa de una agencia ecologica internacional. Incluye: anuncio solemne de perdida, fecha estimada de extincion o colapso, causa principal (actividad humana especifica), especies o comunidades dependientes que sobreviven, legado en el ecosistema o cultura. Tono: periodistico, solemne, sin sensacionalismo. 12-15 lineas." + extGuardian + " Sin asteriscos, sin markdown.",
        en: "Write a formal obituary for the following " + base + ". As a press release from an international ecological agency. Include: solemn announcement of loss, estimated date of extinction or collapse, main cause (specific human activity), dependent species or communities that survive, legacy in the ecosystem or culture. Journalistic, solemn tone. 12-15 lines." + extGuardian + " No asterisks, no markdown.",
        pt: "Escreva um obituario formal para a seguinte " + base + ". Como comunicado de imprensa de uma agencia ecologica internacional. Inclua: anuncio solemne, data estimada de extincao, causa principal, especies dependentes que sobrevivem, legado. Tom jornalistico, solemne. 12-15 linhas." + extGuardian + " Sem asteriscos, sem markdown.",
        fr: "Redigez un avis de deces formel pour la " + base + ". Comme un communique d une agence ecologique internationale. Inclure: annonce solennelle, date estimee d extinction, cause principale, especes dependantes survivantes, heritage. Ton journalistique, solennel. 12-15 lignes." + extGuardian + " Sans asterisques, sans markdown.",
        de: "Schreiben Sie einen formellen Nachruf für die folgende " + base + ". Als Pressemitteilung einer internationalen Umweltagentur. Feierliche Ankündigung, geschätztes Extinktionsdatum, Hauptursache, abhängige Arten, Vermächtnis. Journalistischer Ton. 12-15 Zeilen." + extGuardian + " Kein Markdown.",
        it: "Scrivi un necrologio formale per la seguente " + base + ". Come comunicato stampa di un'agenzia ecologica internazionale. Annuncio solenne, data stimata, causa principale, specie dipendenti, eredità. Tono giornalistico. 12-15 righe." + extGuardian + " Niente markdown.",
        ja: "以下の" + base + "の正式な死亡記事を書いてください。国際生態学機関のプレスリリースとして。厳粛な発表、推定絶滅日、主な原因、依存種、遺産。12-15行。" + extGuardian + " マークダウンなし。",
        ar: "اكتب نعياً رسمياً لـ" + base + ". كبيان صحفي من وكالة بيئية دولية. إعلان رسمي، تاريخ انقراض تقديري، سبب رئيسي، أنواع معتمدة، إرث. 12-15 سطراً." + extGuardian + " بدون تنسيق."
      },
      alerta: {
        es: "Escribe un mensaje de alerta urgente sobre la perdida de la siguiente " + base + ". Como si lo enviara una organizacion cientifica internacional. Incluye: dato especifico de declive (porcentaje y anos), consecuencia directa para los humanos si desaparece, una comparacion que haga la perdida comprensible para alguien no especializado, y 2 acciones concretas que cualquier persona puede tomar hoy. Tono: urgente pero basado en evidencia, sin catastrofismo. 10-12 lineas." + extGuardian + " Sin asteriscos, sin markdown.",
        en: "Write an urgent alert message about the loss of the following " + base + ". As if sent by an international scientific organization. Include: specific decline data (percentage and years), direct consequence for humans if it disappears, a comparison making the loss understandable for a non-specialist, and 2 concrete actions anyone can take today. Urgent, evidence-based tone. 10-12 lines." + extGuardian + " No asterisks, no markdown.",
        pt: "Escreva uma mensagem de alerta urgente sobre a perda da seguinte " + base + ". Como enviada por uma organizacao cientifica internacional. Inclua: dado especifico de declinio, consequencia para os humanos, uma comparacao compreensivel, e 2 acoes concretas. Tom urgente, baseado em evidencias. 10-12 linhas." + extGuardian + " Sem asteriscos, sem markdown.",
        fr: "Redigez un message d alerte urgent sur la perte de la " + base + ". Comme envoye par une organisation scientifique internationale. Inclure: donnees de declin, consequence pour les humains, une comparaison comprehensible, et 2 actions concretes. Ton urgent, base sur des preuves. 10-12 lignes." + extGuardian + " Sans asterisques, sans markdown.",
        de: "Schreiben Sie eine dringende Warnmeldung über den Verlust der folgenden " + base + ". Spezifische Rückgangsdaten, Konsequenzen für Menschen, verständlicher Vergleich, 2 konkrete Maßnahmen. Dringender, evidenzbasierter Ton. 10-12 Zeilen." + extGuardian + " Kein Markdown.",
        it: "Scrivi un messaggio di allerta urgente sulla perdita della seguente " + base + ". Dati specifici di declino, conseguenza per gli umani, confronto comprensibile, 2 azioni concrete. Tono urgente, basato su evidenze. 10-12 righe." + extGuardian + " Niente markdown.",
        ja: "以下の" + base + "の喪失に関する緊急警告メッセージを書いてください。具体的な減少データ、人間への直接的影響、分かりやすい比較、2つの具体的行動。緊急だが証拠に基づく調子。10-12行。" + extGuardian + " マークダウンなし。",
        ar: "اكتب رسالة تنبيه عاجلة عن فقدان " + base + ". بيانات تراجع محددة، عواقب على البشر، مقارنة مفهومة، وإجراءان ملموسان. نبرة عاجلة مبنية على الأدلة. 10-12 سطراً." + extGuardian + " بدون تنسيق."
      },
      ritual: {
        es: "Escribe una oracion ceremonial para honrar la perdida de la siguiente " + base + ". Disenada para ser leida en voz alta, sola o en grupo. Estructura de letania: frases que se repiten y construyen. Incluye invocacion, reconocimiento de la perdida, peticion de memoria colectiva, y cierre de despedida. Donde haya respuesta del coro escribe (Que sea recordado) o similar entre parentesis. Tono: sagrado, ancestral, transdimensional. 12-16 lineas." + extGuardian + " Sin asteriscos, sin markdown.",
        en: "Write a ceremonial prayer to honor the loss of the following " + base + ". Designed to be read aloud alone or in a group. Litany structure: phrases that repeat and build. Include invocation, acknowledgment of loss, petition for collective memory, closing farewell. Where there is a chorus response write (Let it be remembered) in parentheses. Sacred, ancestral tone. 12-16 lines." + extGuardian + " No asterisks, no markdown.",
        pt: "Escreva uma oracao ceremonial para honrar a perda da seguinte " + base + ". Estrutura de ladainha para ser lida em voz alta. Inclua invocacao, reconhecimento, peticao de memoria e despedida. Tom sagrado, ancestral. 12-16 linhas." + extGuardian + " Sem asteriscos, sem markdown.",
        fr: "Redigez une priere ceremonielle pour honorer la perte de la " + base + ". Structure de litanie pour etre lue a voix haute. Inclure invocation, reconnaissance, petition de memoire et adieu. Ton sacre, ancestral. 12-16 lignes." + extGuardian + " Sans asterisques, sans markdown.",
        de: "Schreiben Sie ein zeremonielles Gebet zu Ehren des Verlusts der folgenden " + base + ". Litanei-Struktur zum Vorlesen. Anrufung, Anerkennung, Bitte um Erinnerung, Abschied. Heiliger, ahnenhafter Ton. 12-16 Zeilen." + extGuardian + " Kein Markdown.",
        it: "Scrivi una preghiera cerimoniale per onorare la perdita della seguente " + base + ". Struttura di litania da leggere ad alta voce. Invocazione, riconoscimento, petizione di memoria, congedo. Tono sacro, ancestrale. 12-16 righe." + extGuardian + " Niente markdown.",
        ja: "以下の" + base + "の喪失を称えるための儀式的な祈りを書いてください。声に出して読むための連祷構造。召喚、承認、記憶の嘆願、別れ。神聖で先祖伝来の調子。12-16行。" + extGuardian + " マークダウンなし。",
        ar: "اكتب صلاة احتفالية لتكريم فقدان " + base + ". بنية تراتيل للقراءة بصوت عالٍ. دعاء، اعتراف بالفقدان، التماس ذاكرة جماعية، وداع. نبرة مقدسة. 12-16 سطراً." + extGuardian + " بدون تنسيق."
      }
    };

    var tipoPrompts = prompts[tipo] || prompts.poema;
    var prompt = tipoPrompts[idioma] || tipoPrompts.es;

    // ── Llamada a Gemini ────────────────────────────────────────
    var res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 1.1 }
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

    // ── Imagen Unsplash por categoría ───────────────────────────
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

    return respond(200, { poema: poema, imagen: imagen, plan: plan, tipo: tipo });

  } catch (error) {
    console.error("[Oraculo]", error.message);
    return respond(500, { error: error.message });
  }
};
