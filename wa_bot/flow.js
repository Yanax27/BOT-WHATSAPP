function normalize(s) { return (s || '').trim(); }
function normLower(s) { return normalize(s).toLowerCase(); }

function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function containsAbuse(text) {
  const t = stripAccents(normLower(text));

  // Lista base (ampliala si querés)
  const bad = [
    'puta','puto','mierda','carajo','verga','concha','pelotudo','pelotuda',
    'boludo','boluda','imbecil','idiota','estupido','estupida','pendejo','pendeja',
    'hijo de puta','hdp','burro','idiota', 'cabron','inutil','huevon', 'maricon', 'maleante', 'ladron', 'ratero', 'Maleante'
  ];

  return bad.some(w => t.includes(w));
}

function isYes(text) {
  const t = normLower(text);
  return ['si','sí','s','claro','ok','dale','de una','por supuesto','me interesa','quiero','okey'].some(x => t === x || t.includes(x));
}
function isNo(text) {
  const t = normLower(text);
  return ['no','n','nop','no gracias','para nada'].some(x => t === x || t.includes(x));
}

function looksLikeClosing(text) {
  const t = normLower(text);
  return [
    'eso es todo','nada mas','nada más','listo','ok gracias','gracias','muchas gracias',
    'chau','chao','adios','adiós','bye','ok'
  ].some(x => t === x || t.includes(x));
}

function looksLikeNonsense(text) {
  const t = normLower(text);
  if (!t) return false;
  // una sola palabra rara / corta sin contexto
  if (t.split(/\s+/).length === 1 && t.length <= 10) {
    const allowed = ['si','sí','no','ok','dale','hola','chau','chao','gracias'];
    return !allowed.includes(t);
  }
  return false;
}

// Limpia "desde barrio Central" -> "Central"
function cleanBarrio(raw) {
  let s = normalize(raw);

  // quita prefijos frecuentes
  s = s.replace(/\b(desde|de|del|de la|de los|de las|desde el|desde la)\b/gi, ' ').trim();
  s = s.replace(/\b(urbanizaci[oó]n|urb\.?|barrio|zona|comunidad|ciudadela|u\.?)\b/gi, ' ').trim();

  s = s.replace(/\s+/g, ' ').trim();

  // capitaliza
  s = s.split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  if (!s) s = normalize(raw);
  return s;
}

// Extrae tema + detalle (ahora incluye tránsito)
function extractIssue(raw) {
  const t = normLower(raw);

  const themes = [
    { key: 'transito', label: 'tránsito y seguridad vial', terms: ['accidente','accidentes','tránsito','transito','señal','señales','señalización','semáforo','semaforo','velocidad','moto','motocicleta','auto','peatón','peaton','paso de cebra','cruce'] },
    { key: 'basura', label: 'basura y limpieza', terms: ['basura','sucio','suciedad','limpieza','recojo','recolección','contenedor'] },
    { key: 'agua', label: 'agua y alcantarillado', terms: ['agua','cortes','presión','alcantarillado','desagüe','desague'] },
    { key: 'calles', label: 'calles y baches', terms: ['bache','baches','asfalto','pavimento','calle','avenida','camino','polvo'] },
    { key: 'seguridad', label: 'seguridad ciudadana', terms: ['robo','robos','inseguridad','delincuencia','seguridad'] },
    { key: 'iluminacion', label: 'iluminación', terms: ['luz','luces','alumbrado','iluminación','iluminacion','poste'] },
  ];

  let label = 'un problema del barrio';
  for (const th of themes) {
    if (th.terms.some(w => t.includes(w))) { label = th.label; break; }
  }

  // detalle: intenta capturar “en … / sobre …”
  let detail = '';
  const m1 = raw.match(/\b(en|sobre|por)\s+(.{3,60})/i);
  if (m1) detail = m1[2].trim();
  detail = detail.replace(/\s+/g, ' ').trim();
  if (detail.length > 60) detail = detail.slice(0, 60).trim();

  // resumen corto
  let summary = label;
  if (detail) summary += ` (${detail})`;

  return { label, detail, summary };
}

function newSession() {
  return {
    step: 1,
    barrio: null,
    demandaRaw: null,
    issue: null,
    afiliado: null,
    rival: null,
    razon: null,
    saidGoodbye: false,
  };
}

const MSG = {
  // 👇 IMPORTANTE: acá SOLO presentación (sin volver a pedir barrio)
  paso1: `¡Hola! Soy Fernando León, candidato a Alcade de Villa Montes. Estoy aquí para escuchar y tomar nota de lo que pasa en tu zona.`,

  pedirBarrio: `¿De qué barrio, comunidad o zona me escribes?`,

  pedirProblema: (barrio) => `Gracias, ¿Qué problema te preocupa más ahí? puedes detallarlo`,

  problemaOk: (barrio, summary) =>
    `Entendido. En ${barrio} el tema es **${summary}**. Gracias por contármelo.`,

  pedirAfiliacion: `Solo para entenderte mejor: ¿hoy simpatizas con algún partido o agrupación? (SI/NO)`,

  rival: `¿Con cuál agrupación o partido te identificas?`,
  razonRival: (r) => `¿Qué es lo que más valoras de ${r}?`,
  puenteRival: `Gracias. Aunque pensemos distinto, lo importante es resolver lo que afecta al barrio.`,

  preguntarMate: `Y una última: ¿habías escuchado de MATE? (SI/NO)`,
  mate_si: `Qué bueno. MATE es una agrupación de vecinos para trabajar desde los barrios, con técnica y cercanía.`,
  mate_no: `Te entiendo. MATE no es un partido antiguo: es gente común organizándose desde el territorio.`,

  cierre: `Gracias por escribirme. Si luego quieres agregar algo, aquí estoy 🙂`,
  despedidaFinal: `Perfecto. Gracias por tu tiempo. Un abrazo 🙂`,
  nonsense: `Te leo 🙂 Si quieres, cuéntame en una frase qué necesitas (o /reset).`,

  abuso: `Entiendo el enojo, pero no puedo continuar si usas insultos. Si querés, contame el problema con respeto y te leo.`,
};

function handleIncoming(session, userText) {
  const text = normalize(userText);
  const tLower = normLower(text);

  if (tLower === '/reset') {
    return { reset: true, reply: 'Reiniciado. Escribe “hola” para comenzar.' };
  }

  // Bloqueo por insultos/malas palabras
  if (containsAbuse(text)) {
    return { reply: MSG.abuso, session, blocked: true };
  }

  // Manejo “post-cierre” (step 10) -> handoff a RAG
  if (session.step === 10) {
    if (looksLikeClosing(text)) {
      if (!session.saidGoodbye) {
        session.saidGoodbye = true;
        return { reply: MSG.despedidaFinal, session };
      }
      return { reply: '🙂', session };
    }

    if (looksLikeNonsense(text)) {
      return { reply: MSG.nonsense, session };
    }

    // ✅ En step 10 NO mandamos MSG.cierre; entregamos al RAG
    return { handoffToRag: true, session };
  }

  switch (session.step) {
    // 1 -> pedir barrio
    case 1: {
      session.step = 2;
      return { reply: MSG.pedirBarrio, session };
    }

    // 2 -> guardar barrio, pedir problema
    case 2: {
      session.barrio = cleanBarrio(text);
      session.step = 3;
      return { reply: MSG.pedirProblema(session.barrio), session };
    }

    // 3 -> guardar problema, confirmar, luego afiliación
    case 3: {
      session.demandaRaw = text;
      session.issue = extractIssue(text);
      session.step = 4;
      return { reply: `${MSG.problemaOk(session.barrio || 'tu zona', session.issue.summary)}\n\n${MSG.pedirAfiliacion}`, session };
    }

    // 4 -> afiliación SI/NO
    case 4: {
      if (isYes(text)) {
        session.afiliado = 'SI';
        session.step = 5;
        return { reply: MSG.rival, session };
      }
      if (isNo(text)) {
        session.afiliado = 'NO';
        session.step = 8;
        return { reply: MSG.preguntarMate, session };
      }
      return { reply: 'Responde SI o NO 🙂 ¿Simpatizas con algún partido o agrupación?', session };
    }

    // 5 -> rival
    case 5: {
      session.rival = text;
      session.step = 6;
      return { reply: MSG.razonRival(session.rival), session };
    }

    // 6 -> razón -> MATE
    case 6: {
      session.razon = text;
      session.step = 8;
      return { reply: `${MSG.puenteRival}\n\n${MSG.preguntarMate}`, session };
    }

    // 8 -> MATE -> cierre
    case 8: {
      session.step = 10;
      if (isYes(text)) return { reply: `${MSG.mate_si}\n\n${MSG.cierre}`, session };
      if (isNo(text)) return { reply: `${MSG.mate_no}\n\n${MSG.cierre}`, session };
      return { reply: MSG.cierre, session };
    }

    default:
      session.step = 1;
      return { reply: MSG.paso1, session };
  }
}

module.exports = { newSession, handleIncoming, MSG, containsAbuse };