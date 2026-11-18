// Conexión opcional con Google (Gmail, Calendar, Drive) directo desde el navegador.
import { ajustes } from './datos.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

let cliente = null;

export const configurado = () => !!ajustes.get('google_client_id');

export function conectado() {
  const t = ajustes.get('google_token');
  return !!t && Number(ajustes.get('google_vence', '0')) > Date.now() + 60000;
}

function cargarScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = ok; s.onerror = () => mal(new Error('No pude cargar Google'));
    document.head.appendChild(s);
  });
}

// Tiene que llamarse desde un toque/clic del usuario (abre la ventana de Google).
export async function conectar() {
  await cargarScript();
  return new Promise((ok, mal) => {
    cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: ajustes.get('google_client_id'),
      scope: SCOPES,
      callback: (r) => {
        if (r.error) return mal(new Error(r.error));
        ajustes.set('google_token', r.access_token);
        ajustes.set('google_vence', Date.now() + (Number(r.expires_in) || 3600) * 1000);
        ok();
      },
    });
    cliente.requestAccessToken({ prompt: ajustes.get('google_ya_autorizo') ? '' : 'consent' });
    ajustes.set('google_ya_autorizo', '1');
  });
}

export function desconectar() { ajustes.set('google_token', ''); ajustes.set('google_vence', ''); }

async function api(url, opciones = {}) {
  if (!configurado()) throw new Error('Google no está configurado. Agregá tu Client ID en Ajustes.');
  if (!conectado()) throw new Error('La sesión de Google venció. Tocá el botón "Google" del panel para reconectar y repetí el pedido.');
  const r = await fetch(url, {
    ...opciones,
    headers: { Authorization: 'Bearer ' + ajustes.get('google_token'), 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  if (r.status === 401) { desconectar(); throw new Error('La sesión de Google venció. Tocá "Google" para reconectar.'); }
  if (!r.ok) throw new Error('Google respondió ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.status === 204 ? {} : r.json();
}

// ---------- Gmail ----------
const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
const cab = (m, n) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';

function b64decode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function b64encode(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = ''; bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function cuerpo(p) {
  if (p.mimeType?.startsWith('text/plain') && p.body?.data) return b64decode(p.body.data);
  for (const parte of p.parts || []) { const t = cuerpo(parte); if (t) return t; }
  if (p.body?.data) return b64decode(p.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return '';
}

export async function buscarMails(consulta, maximo = 10) {
  const lista = await api(`${GM}/messages?maxResults=${maximo}&q=${encodeURIComponent(consulta)}`);
  return Promise.all((lista.messages || []).map(async ({ id }) => {
    const m = await api(`${GM}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
    return { id, de: cab(m, 'From'), asunto: cab(m, 'Subject'), fecha: cab(m, 'Date'),
             resumen: m.snippet, no_leido: (m.labelIds || []).includes('UNREAD') };
  }));
}

export async function leerMail(id) {
  const m = await api(`${GM}/messages/${id}?format=full`);
  return { id, de: cab(m, 'From'), para: cab(m, 'To'), asunto: cab(m, 'Subject'),
           fecha: cab(m, 'Date'), cuerpo: cuerpo(m.payload || {}).slice(0, 8000) };
}

function crudo(para, asunto, texto) {
  const asuntoCod = '=?UTF-8?B?' + b64encode(asunto).replace(/-/g, '+').replace(/_/g, '/') + '?=';
  return b64encode(`To: ${para}\r\nSubject: ${asuntoCod}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${texto}`);
}

export async function crearBorrador(para, asunto, texto) {
  const d = await api(`${GM}/drafts`, { method: 'POST', body: JSON.stringify({ message: { raw: crudo(para, asunto, texto) } }) });
  return { borrador_id: d.id, estado: 'borrador guardado en Gmail' };
}

export async function enviarMail(para, asunto, texto) {
  const r = await api(`${GM}/messages/send`, { method: 'POST', body: JSON.stringify({ raw: crudo(para, asunto, texto) }) });
  return { id: r.id, estado: 'enviado' };
}

// ---------- Calendar ----------
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const zona = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const aRFC = (f) => new Date(f.replace(' ', 'T')).toISOString();
const deRFC = (s) => {
  if (!s) return '';
  if (s.length === 10) return s;
  const d = new Date(s);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export async function listarEventos(desde, hasta) {
  const r = await api(`${CAL}?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=${encodeURIComponent(aRFC(desde))}&timeMax=${encodeURIComponent(aRFC(hasta))}`);
  return (r.items || []).map((e) => ({
    id: 'g:' + e.id, titulo: e.summary || '(sin título)', lugar: e.location || '',
    inicio: deRFC(e.start?.dateTime || e.start?.date), fin: deRFC(e.end?.dateTime || e.end?.date), origen: 'Google Calendar',
  }));
}

export async function crearEvento({ titulo, inicio, fin, lugar = '', notas = '' }) {
  const loc = (f) => f.replace(' ', 'T') + (f.length <= 16 ? ':00' : '');
  const e = await api(CAL, { method: 'POST', body: JSON.stringify({
    summary: titulo, location: lugar, description: notas,
    start: { dateTime: loc(inicio), timeZone: zona() }, end: { dateTime: loc(fin), timeZone: zona() },
  }) });
  return { id: 'g:' + e.id, estado: 'creado en Google Calendar' };
}

export async function borrarEvento(id) { await api(`${CAL}/${id}`, { method: 'DELETE' }); }

// ---------- Drive ----------
export async function buscarDrive(texto) {
  const q = `fullText contains '${texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and trashed = false`;
  const r = await api(`https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,modifiedTime,webViewLink)&q=${encodeURIComponent(q)}`);
  return (r.files || []).map((f) => ({ nombre: f.name, tipo: f.mimeType, modificado: (f.modifiedTime || '').slice(0, 10), link: f.webViewLink }));
}
