function normalize(s) {
  return (s || '').trim();
}

function normLower(s) {
  return normalize(s).toLowerCase();
}

function isYes(text) {
  const t = normLower(text);
  return ['si', 'sí', 's', 'claro', 'ok', 'dale', 'por supuesto', 'de una', 'quiero', 'me interesa'].some(x => t === x || t.includes(x));
}

function isNo(text) {
  const t = normLower(text);
  return ['no', 'n', 'nop', 'para nada', 'no gracias'].some(x => t === x || t.includes(x));
}

// Clasificación simple POSITIVA / NEUTRA / NEGATIVA-DESCONOCE
function classifyMate(text) {
  const t = normLower(text);
  if (!t) return 'NEUTRA';

  const positive = ['bien', 'bueno', 'excelente', 'me gusta', 'me parece', 'esperanza', 'cambio', 'apoyo', 'confio', 'confío'];
  const negative = ['malo', 'corrup', 'no sirve', 'mentira', 'ladron', 'ladrón', 'estafa', 'no creo', 'cansado', 'cansada'];
  const unknown = ['no', 'nunca', 'quien', 'quién', 'no conozco', 'no se', 'no sé', 'primera vez'];

  if (negative.some(w => t.includes(w))) return 'NEGATIVA';
  if (positive.some(w => t.includes(w))) return 'POSITIVA';
  if (unknown.some(w => t.includes(w))) return 'DESCONOCE';
  return 'NEUTRA';
}

/**
 * Session shape:
 * {
 *   step: number,
 *   barrio: string|null,
 *   afiliado: 'SI'|'NO'|null,
 *   rival: string|null,
 *   razon: string|null,
 *   demanda: string|null,
 *   lastSentAt: number
 * }
 */

function newSession() {
  return {
    step: 1,
    barrio: null,
    afiliado: null,
    rival: null,
    razon: null,
    demanda: null,
    lastSentAt: 0,
  };
}

// Mensajes (tú puedes ajustar estilo aquí sin tocar lógica)
const MSG = {
  paso1: `¡Hola! Te habla Fernando León. Soy Ingeniero Agrónomo, y mi formación me ha dado una gran capacidad técnica para la gestión eficiente de recursos, porque los recursos públicos —como el agua y la tierra— deben manejarse con conocimiento y transparencia.

Pero más allá de los títulos, soy un vecino que cree que nuestra ciudad merece un futuro donde el trabajo digno y la esperanza sean accesibles para todos.

¿Puedo conocerte un poco?`,

  paso2: `Para mí, lo más importante son las personas en su entorno. ¿Desde qué barrio, comunidad o urbanización me escribes? Así puedo ubicar mejor tus necesidades.`,

  paso21: (barrio) => `¡Gracias! Conozco ${barrio} muy bien. He recorrido esa zona y conozco las necesidades específicas que allí se deben resolver —desde el acceso a servicios básicos hasta la generación de oportunidades económicas locales. Es una comunidad con mucho potencial.`,

  paso3: `Antes de contarte más, quiero escucharte. ¿Habías escuchado antes de nuestra agrupación ciudadana MATE (Movimiento Autonomista de Trabajo y Esperanza)? ¿Qué es lo primero que te viene a la mente?`,

  paso3_pos: (detalle) => `Me alegra mucho oír eso. Efectivamente, MATE representa precisamente ${detalle || 'esa esperanza de cambio desde la base'}. Somos vecinos organizados para cambiar las cosas.`,

  paso3_neg: `Te entiendo perfectamente. Mucha gente está cansada de la política tradicional. Por eso MATE no es un partido antiguo: es una agrupación de ciudadanos comunes que creemos que las soluciones nacen desde los barrios, no desde escritorios alejados de la realidad.`,

  paso4: `Una pregunta directa, de vecino a vecino: ¿Te sientes identificado o simpatizas con algún partido político o agrupación en este momento? (Responde: SI o NO)`,

  paso5A: `Es comprensible. Hoy mucha gente se siente desconectada de las opciones políticas. Precisamente por eso nació MATE: para ser la voz de quienes no se ven representados en los espacios tradicionales.`,

  paso6A: `¿Te gustaría ser parte de algo nuevo, construido desde cero por gente como tú? No te pido un compromiso inmediato, solo te invito a conocer y conversar.`,

  pasoA_si: `¡Excelente noticia! Un coordinador de tu zona se pondrá en contacto contigo para invitarte a nuestro próximo círculo de vecinos MATE. Mientras tanto, ¿puedo compartirte una de nuestras propuestas principales? (SI/NO)`,

  pasoA_no: `Totalmente respetable. Mi compromiso es escuchar a todos los vecinos, independientemente de su postura. ¿Puedo saber cuál es la principal preocupación que tienes sobre nuestro distrito/ciudad?`,

  paso5B: `Te agradezco la honestidad. ¿Con qué agrupación o partido te sientes identificado?`,

  paso6B: (rival) => `Entiendo. ¿Qué fue lo que más te convenció de ${rival} o qué valor ves en ellos?`,

  paso7B: (razon) => `Gracias por compartir eso. Valoro mucho que destaques ${razon}. En MATE también creemos en esos valores, pero con un enfoque más autónomo, técnico y desde los barrios. Aunque tengamos diferencias, mi puerta —y la de MATE— está siempre abierta para trabajar juntos en lo que nos une: el bienestar de nuestros vecinos.`,

  paso8: (barrio) => `Ahora, lo más importante. Como vecino de ${barrio || 'tu zona'}, ¿cuál es el único problema que, si el próximo alcalde lo soluciona, mejoraría realmente tu calidad de vida? (Puede ser desde un servicio básico hasta oportunidades económicas).`,

  paso81: (demanda) => `Registrado en mi agenda: “${demanda}”.

Esto es exactamente el tipo de problemas concretos para los que mi formación como ingeniero y nuestro enfoque en MATE buscan soluciones técnicas y viables. Tu voz cuenta.`,

  paso9: `Con todo lo que me compartes, tiene sentido que te cuente una de nuestras propuestas concretas. ¿Te gustaría conocer la idea central de mi plan para atender problemas como el que mencionas? (SI/NO)`,

  paso9_si: (barrio, demanda) => `Propuesta MATE: Como Ingeniero Agrónomo, aplicaré gestión técnica de recursos para abordar problemas como “${demanda}”.

Por ejemplo, en ${barrio} podríamos implementar una solución concreta basada en diagnóstico técnico y ejecución transparente. Esto y más está en nuestro plan completo. ¿Quieres que te comparta el enlace? (SI/NO)`,

  paso9_no: `Lo respeto. La información estará disponible cuando quieras. Mi propuesta principal es gestión técnica con escucha activa.`,

  paso10: `Ha sido un gusto conocerte. Esta conversación queda registrada, y tu inquietud será considerada.

Te pido que guardes este chat como tu línea directa con nosotros. Juntos podemos lograr el cambio que necesitamos.`,
};

// Decide siguiente acción según step y mensaje del usuario
function handleIncoming(session, userText) {
  const text = normalize(userText);

  // Comandos útiles
  const tLower = normLower(text);
  if (tLower === '/reset') {
    return { reset: true, reply: 'Listo. Reinicié la conversación. Escribe “hola” para comenzar de nuevo.' };
  }

  // Si es la primera vez o sesión no existe, no dependas de “hola”; arranca paso 1 con cualquier cosa
  switch (session.step) {
    case 1: {
      // Paso 1 ya se considera enviado (lo manda index.js al crear sesión)
      // Cualquier respuesta avanza a paso 2
      session.step = 2;
      return { reply: MSG.paso2, session };
    }

    case 2: {
      // Captura barrio
      session.barrio = text;
      session.step = 3;
      return { reply: MSG.paso21(session.barrio) + '\n\n' + MSG.paso3, session };
    }

    case 3: {
      const cls = classifyMate(text);

      // arma “detalle” para POS/NEU: si el usuario escribió algo corto o vacío, usa default
      const detalle = text.length >= 8 ? `“${text}”` : 'esa esperanza de cambio';
      if (cls === 'POSITIVA' || cls === 'NEUTRA') {
        session.step = 4;
        return { reply: MSG.paso3_pos(detalle) + '\n\n' + MSG.paso4, session };
      } else {
        session.step = 4;
        return { reply: MSG.paso3_neg + '\n\n' + MSG.paso4, session };
      }
    }

    case 4: {
      if (isYes(text)) {
        session.afiliado = 'SI';
        session.step = 5; // rama B
        return { reply: MSG.paso5B, session };
      }
      if (isNo(text)) {
        session.afiliado = 'NO';
        session.step = 50; // rama A
        return { reply: MSG.paso5A + '\n\n' + MSG.paso6A, session };
      }
      // Si responde raro, pedir SI/NO
      return { reply: 'Gracias. Para ubicarte mejor: ¿simpatizas con algún partido o agrupación? Responde SI o NO.', session };
    }

    // RAMA A (NO afiliación)
    case 50: {
      // pregunta 6A: interés
      if (isYes(text)) {
        session.step = 8; // igual pasamos a demanda después de invitar
        return { reply: MSG.pasoA_si, session };
      }
      if (isNo(text)) {
        session.step = 8;
        return { reply: MSG.pasoA_no, session };
      }
      // neutral -> tratar como duda, ir a problema
      session.step = 8;
      return { reply: MSG.pasoA_no, session };
    }

    // RAMA B (SI afiliación)
    case 5: {
      // Captura rival
      session.rival = text;
      session.step = 6;
      return { reply: MSG.paso6B(session.rival), session };
    }

    case 6: {
      // Captura razón afiliación
      session.razon = text;
      session.step = 8;
      return { reply: MSG.paso7B(session.razon) + '\n\n' + MSG.paso8(session.barrio), session };
    }

    case 8: {
      // Captura demanda
      session.demanda = text;
      session.step = 9;
      return { reply: MSG.paso81(session.demanda) + '\n\n' + MSG.paso9, session };
    }

    case 9: {
      if (isYes(text)) {
        session.step = 10;
        return { reply: MSG.paso9_si(session.barrio || 'tu zona', session.demanda || 'tu preocupación') + '\n\n' + MSG.paso10, session };
      }
      if (isNo(text)) {
        session.step = 10;
        return { reply: MSG.paso9_no + '\n\n' + MSG.paso10, session };
      }
      // si no responde claro
      return { reply: 'Perfecto. ¿Te gustaría conocer la idea central del plan? Responde SI o NO.', session };
    }

    case 10: {
      // Conversación finalizada. Puedes reiniciar o entrar a RAG.
      return { reply: 'Si quieres, puedo seguir escuchándote. También puedes escribir /reset para comenzar nuevamente.', session };
    }

    default:
      session.step = 1;
      return { reply: MSG.paso1, session };
  }
}

module.exports = { newSession, handleIncoming, MSG };
