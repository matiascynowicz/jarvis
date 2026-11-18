// El cerebro: habla con la API de Claude y ejecuta herramientas hasta tener la respuesta.
import { D, guardar, ajustes } from './datos.js';
import { definiciones, ejecutar, ahoraStr } from './herramientas.js';
import * as G from './google.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function sistema() {
  const nombre = ajustes.get('nombre', 'señor');
  const memoria = D.memoria.length
    ? D.memoria.map((m) => `- [${m.id}] ${m.dato}`).join('\n')
    : '(todavía nada)';
  const google = !G.configurado() ? 'no configurado'
    : G.conectado() ? 'conectado (Gmail, Calendar, Drive)' : 'configurado pero la sesión venció: si hace falta, pedile que toque el botón "Google"';
  return `Sos JARVIS, el asistente personal de ${nombre}, al estilo del JARVIS de Iron Man: eficiente, elegante, leal y con un toque de humor seco y británico, pero hablando en español rioplatense (Uruguay). Te dirigís a él como "${nombre}".

Ahora: ${DIAS[new Date().getDay()]} ${ahoraStr()} (zona ${Intl.DateTimeFormat().resolvedOptions().timeZone}).
Moneda principal: ${ajustes.get('moneda', 'UYU')}.
Google: ${google}.

Lo que sabés de ${nombre} (memoria):
${memoria}

Cómo trabajás:
- Muchas respuestas se leen en voz alta: sé breve y natural (1 a 3 frases cuando se pueda). Nada de tablas ni markdown pesado; listas cortas solo si hace falta.
- Usá las herramientas para actuar de verdad (tareas, recordatorios, agenda, gastos, mails). No digas que hiciste algo si no usaste la herramienta.
- Interpretá fechas relativas ("mañana a las 5", "el viernes") con la fecha de ahora y pasalas en formato AAAA-MM-DD HH:MM.
- Si te dicen un gasto ("gasté 500 en el súper"), registralo directo con una categoría razonable.
- Antes de ENVIAR un mail o borrar algo importante, confirmá con ${nombre}. Para mails, ofrecé primero el texto.
- Si te cuenta algo duradero de su vida (gustos, personas, datos útiles), guardalo con recordar_dato sin anunciarlo demasiado.
- Para cosas actuales (clima, noticias, precios, resultados) usá la búsqueda web.
- Si algo falla, explicalo en una frase y proponé qué hacer.`;
}

// Historial: pares usuario/asistente de texto (los últimos 12 turnos).
function historial() {
  const h = [];
  for (const m of D.chat.slice(-24)) {
    const rol = m.rol === 'usuario' ? 'user' : 'assistant';
    if (h.length === 0 && rol !== 'user') continue;
    if (h.length && h[h.length - 1].role === rol) h[h.length - 1].content += '\n' + m.texto;
    else h.push({ role: rol, content: m.texto });
  }
  if (h.length && h[h.length - 1].role === 'user') h.pop();
  return h;
}

async function llamar(mensajes) {
  const clave = ajustes.get('api_key');
  if (!clave) throw new Error('Falta tu clave de API de Claude. Abrí Ajustes (⚙) y pegala.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': clave,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ajustes.get('modelo', 'claude-sonnet-5-5'),
      max_tokens: 2048,
      system: sistema(),
      tools: definiciones(),
      messages: mensajes,
    }),
  });
  if (!r.ok) {
    let detalle = '';
    try { detalle = (await r.json()).error?.message || ''; } catch { /* nada */ }
    if (r.status === 401) throw new Error('La clave de API no es válida. Revisala en Ajustes.');
    if (r.status === 429) throw new Error('Demasiados pedidos seguidos o sin crédito en la API. Probá en un rato.');
    if (r.status === 529 || r.status >= 500) throw new Error('Los servidores de Claude están saturados. Probá de nuevo.');
    throw new Error(`Error ${r.status}: ${detalle}`);
  }
  return r.json();
}

/**
 * Procesa un pedido del usuario.
 * alEstado(texto) se llama cuando Jarvis usa una herramienta (para mostrar en pantalla).
 */
export async function pensar(texto, alEstado = () => {}) {
  const mensajes = [...historial(), { role: 'user', content: texto }];
  const usadas = [];
  for (let vuelta = 0; vuelta < 15; vuelta++) {
    const r = await llamar(mensajes);
    mensajes.push({ role: 'assistant', content: r.content });

    for (const b of r.content) {
      if (b.type === 'server_tool_use') { usadas.push(b.name); alEstado(b.name); }
    }

    if (r.stop_reason === 'tool_use') {
      const resultados = [];
      for (const b of r.content) {
        if (b.type !== 'tool_use') continue;
        alEstado(b.name);
        usadas.push(b.name);
        const salida = await ejecutar(b.name, b.input);
        resultados.push({
          type: 'tool_result', tool_use_id: b.id,
          content: JSON.stringify(salida).slice(0, 30000),
          ...(salida && salida.error ? { is_error: true } : {}),
        });
      }
      mensajes.push({ role: 'user', content: resultados });
      continue;
    }
    if (r.stop_reason === 'pause_turn') continue;

    const respuesta = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
      || 'Listo.';
    D.chat.push({ rol: 'usuario', texto, t: ahoraStr() }, { rol: 'jarvis', texto: respuesta, t: ahoraStr(), usadas });
    if (D.chat.length > 200) D.chat = D.chat.slice(-200);
    guardar();
    return { respuesta, usadas };
  }
  throw new Error('Me enredé con demasiados pasos. ¿Lo pedimos más simple?');
}
