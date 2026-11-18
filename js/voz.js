// Voz: reconocimiento (hablarle) y síntesis (que te conteste en voz alta).
// Usa las funciones de voz del propio navegador (mejor en Chrome / Edge / Android; Safari en iPhone también).
import { ajustes } from './datos.js';

const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
export const puedeEscuchar = !!Reconocedor;
export const puedeHablar = 'speechSynthesis' in window;

const IDIOMA = 'es-UY';
let rec = null;
let modo = 'apagado'; // 'apagado' | 'orden' | 'vigilia'
let esperandoOrden = false;
let hablando = false;
let callbacks = { alTexto: () => {}, alEstado: () => {}, alParcial: () => {} };

export function configurar(cb) { callbacks = { ...callbacks, ...cb }; }

function crear(continuo) {
  const r = new Reconocedor();
  r.lang = IDIOMA;
  r.continuous = continuo;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

const PALABRA = /\b(jarvis|yarvis|llarvis|jarvi|yarbis|jarbis)\b[\s,.:]*/i;

function procesar(final, texto) {
  if (modo === 'orden') {
    if (final) { detener(); callbacks.alTexto(texto); }
    else callbacks.alParcial(texto);
    return;
  }
  // Modo vigilia: espera la palabra "Jarvis"
  const m = texto.match(PALABRA);
  if (esperandoOrden) {
    if (final && texto.trim()) { esperandoOrden = false; callbacks.alEstado('vigilia'); callbacks.alTexto(texto.trim()); }
    else callbacks.alParcial(texto);
    return;
  }
  if (!m) return;
  const resto = texto.slice(m.index + m[0].length).trim();
  if (!final) { callbacks.alParcial(resto || '…'); return; }
  if (resto.length > 1) callbacks.alTexto(resto);
  else { esperandoOrden = true; callbacks.alEstado('atento'); hablar('¿Sí?'); }
}

function iniciar(continuo) {
  rec = crear(continuo);
  rec.onresult = (ev) => {
    if (hablando) return;
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      procesar(ev.results[i].isFinal, ev.results[i][0].transcript);
    }
  };
  rec.onerror = (ev) => {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
      modo = 'apagado';
      callbacks.alEstado('error', 'Permiso de micrófono denegado. Habilitalo en el navegador.');
    }
  };
  rec.onend = () => {
    // En vigilia se reinicia sola (los navegadores la cortan cada tanto).
    if (modo === 'vigilia') setTimeout(() => { if (modo === 'vigilia' && !hablando) try { iniciar(true); } catch { /* */ } }, 300);
    else if (modo === 'orden') { modo = 'apagado'; callbacks.alEstado('reposo'); }
  };
  try { rec.start(); } catch { /* ya estaba iniciado */ }
}

function detener() {
  const m = modo; modo = 'apagado';
  try { rec?.abort(); } catch { /* */ }
  rec = null;
  return m;
}

/** Escuchar una sola orden (botón de micrófono). */
export function escucharOrden() {
  if (!puedeEscuchar) return false;
  cancelarHabla();
  detener();
  modo = 'orden';
  callbacks.alEstado('escuchando');
  iniciar(false);
  return true;
}

export function cancelarOrden() {
  if (modo === 'orden') { detener(); callbacks.alEstado('reposo'); }
}

/** Modo "Hey Jarvis": escucha continuamente esperando su nombre. */
export function vigilia(activar) {
  if (!puedeEscuchar) return false;
  detener();
  esperandoOrden = false;
  if (activar) { modo = 'vigilia'; callbacks.alEstado('vigilia'); iniciar(true); }
  else callbacks.alEstado('reposo');
  return true;
}
export const enVigilia = () => modo === 'vigilia';

// ---------------- Hablar ----------------
let voces = [];
function cargarVoces() { voces = puedeHablar ? speechSynthesis.getVoices() : []; }
if (puedeHablar) { cargarVoces(); speechSynthesis.onvoiceschanged = cargarVoces; }

export function listaVoces() {
  return voces.filter((v) => v.lang.toLowerCase().startsWith('es'));
}

function elegirVoz() {
  const guardada = ajustes.get('voz');
  const es = listaVoces();
  return es.find((v) => v.name === guardada)
    || es.find((v) => /jorge|diego|pablo|raul|álvaro|alvaro|enrique|tomas|male|hombre/i.test(v.name))
    || es.find((v) => /es-(UY|AR|419|MX|US)/i.test(v.lang))
    || es[0] || null;
}

function limpiar(texto) {
  return texto
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#>`|]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hablar(texto, alTerminar = () => {}) {
  if (!puedeHablar || ajustes.get('hablar', 'si') !== 'si') { alTerminar(); return; }
  cancelarHabla();
  const frases = limpiar(texto).match(/[^.!?¿¡]+[.!?]*|[¿¡][^?!]+[?!]/g) || [limpiar(texto)];
  const voz = elegirVoz();
  hablando = true;
  callbacks.alEstado('hablando');
  frases.forEach((f, i) => {
    const u = new SpeechSynthesisUtterance(f.trim());
    u.lang = voz?.lang || IDIOMA;
    if (voz) u.voice = voz;
    u.rate = Number(ajustes.get('velocidad', '1.05'));
    u.pitch = 0.9;
    if (i === frases.length - 1) {
      u.onend = u.onerror = () => {
        hablando = false;
        callbacks.alEstado(modo === 'vigilia' ? 'vigilia' : 'reposo');
        if (modo === 'vigilia' && !rec) iniciar(true);
        alTerminar();
      };
    }
    speechSynthesis.speak(u);
  });
}

export function cancelarHabla() {
  if (puedeHablar && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
  hablando = false;
}
