// Datos de Jarvis: se guardan en el dispositivo (localStorage) y, si querés,
// se sincronizan entre PC y celular con un Gist privado de GitHub.

const CLAVE = 'jarvis_datos_v1';

const vacio = () => ({
  tareas: [], recordatorios: [], eventos: [], movimientos: [],
  presupuestos: {}, memoria: [], chat: [], sig: 1, actualizado: 0,
});

function leerLocal() {
  try { return Object.assign(vacio(), JSON.parse(localStorage.getItem(CLAVE)) || {}); }
  catch { return vacio(); }
}

export const D = leerLocal();
const oyentes = new Set();
export const alCambiar = (fn) => oyentes.add(fn);
const avisar = () => oyentes.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

export function guardar({ sincronizar = true } = {}) {
  D.actualizado = Date.now();
  localStorage.setItem(CLAVE, JSON.stringify(D));
  avisar();
  if (sincronizar) programarSync();
}

export const nuevoId = () => D.sig++;

function reemplazar(nuevo) {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, vacio(), nuevo);
  localStorage.setItem(CLAVE, JSON.stringify(D));
  avisar();
}

export function exportar() { return JSON.stringify(D, null, 2); }
export function importar(texto) {
  const datos = JSON.parse(texto);
  if (!datos || typeof datos !== 'object' || !Array.isArray(datos.tareas)) throw new Error('Archivo no válido');
  reemplazar(datos);
  guardar();
}

// ---------- Ajustes (solo en este dispositivo, nunca se sincronizan) ----------
export const ajustes = {
  get: (k, def = '') => localStorage.getItem('jarvis_aj_' + k) ?? def,
  set: (k, v) => (v === '' || v == null) ? localStorage.removeItem('jarvis_aj_' + k)
                                          : localStorage.setItem('jarvis_aj_' + k, String(v)),
};

// ---------- Sincronización por Gist privado de GitHub ----------
const ARCHIVO_GIST = 'jarvis-datos.json';
let temporizador = null;
export const estadoSync = { texto: 'sin sincronizar', ok: false };

function cabecerasGitHub() {
  return {
    Authorization: 'Bearer ' + ajustes.get('gh_token'),
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

function marcar(texto, ok) { estadoSync.texto = texto; estadoSync.ok = ok; avisar(); }

function programarSync() {
  if (!ajustes.get('gh_token')) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(subir, 2500);
}

async function subir() {
  const token = ajustes.get('gh_token');
  if (!token) return;
  const copia = { ...D, chat: D.chat.slice(-40) };
  const files = { [ARCHIVO_GIST]: { content: JSON.stringify(copia) } };
  try {
    let id = ajustes.get('gist_id');
    if (!id) {
      const r = await fetch('https://api.github.com/gists', {
        method: 'POST', headers: cabecerasGitHub(),
        body: JSON.stringify({ description: 'Datos de mi Jarvis (privado)', public: false, files }),
      });
      if (!r.ok) throw new Error('GitHub ' + r.status);
      ajustes.set('gist_id', (await r.json()).id);
    } else {
      const r = await fetch('https://api.github.com/gists/' + id, {
        method: 'PATCH', headers: cabecerasGitHub(), body: JSON.stringify({ files }),
      });
      if (!r.ok) throw new Error('GitHub ' + r.status);
    }
    marcar('sincronizado ' + new Date().toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }), true);
  } catch (e) {
    marcar('error de sync (' + e.message + ')', false);
  }
}

// Busca un Gist existente de Jarvis (para cuando conectás un segundo dispositivo).
async function buscarGist() {
  const r = await fetch('https://api.github.com/gists?per_page=100', { headers: cabecerasGitHub() });
  if (!r.ok) throw new Error('GitHub ' + r.status + (r.status === 401 ? ' (token inválido)' : ''));
  const g = (await r.json()).find((x) => x.files && x.files[ARCHIVO_GIST]);
  if (g) ajustes.set('gist_id', g.id);
  return g?.id;
}

export async function bajar() {
  if (!ajustes.get('gh_token')) { marcar('sin sincronizar', false); return; }
  try {
    const id = ajustes.get('gist_id') || await buscarGist();
    if (!id) { await subir(); return; }
    const r = await fetch('https://api.github.com/gists/' + id, { headers: cabecerasGitHub() });
    if (r.status === 404) { ajustes.set('gist_id', ''); await subir(); return; }
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const archivo = (await r.json()).files[ARCHIVO_GIST];
    if (!archivo) { await subir(); return; }
    const texto = archivo.truncated ? await (await fetch(archivo.raw_url)).text() : archivo.content;
    const remoto = JSON.parse(texto);
    if ((remoto.actualizado || 0) > (D.actualizado || 0)) {
      reemplazar(remoto);
      marcar('sincronizado (datos traídos)', true);
    } else if ((remoto.actualizado || 0) < (D.actualizado || 0)) {
      await subir();
    } else {
      marcar('sincronizado', true);
    }
  } catch (e) {
    marcar('error de sync (' + e.message + ')', false);
  }
}
