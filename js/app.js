// Interfaz de J.A.R.V.I.S.
import { D, guardar, alCambiar, ajustes, estadoSync, bajar, exportar, importar } from './datos.js';
import { ahoraStr, fmt, resumenMes, eventosEntre, ETIQUETAS, ejecutar } from './herramientas.js';
import { pensar } from './cerebro.js';
import * as V from './voz.js';
import * as G from './google.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- Estado visual ----------------
const TEXTOS_ESTADO = {
  reposo: 'EN LÍNEA', escuchando: 'ESCUCHANDO', pensando: 'PROCESANDO', hablando: 'RESPONDIENDO',
  vigilia: 'DECÍ "JARVIS"', atento: 'TE ESCUCHO', error: 'ATENCIÓN',
};
let estadoActual = 'reposo';
function setEstado(estado, detalle) {
  if (ocupado && estado === 'reposo') estado = 'pensando';
  estadoActual = estado;
  document.body.className = document.body.className.replace(/estado-\S+/g, '').trim() + ' estado-' + estado;
  $('#estado-texto').textContent = detalle || TEXTOS_ESTADO[estado] || estado.toUpperCase();
  if (estado !== 'escuchando' && estado !== 'vigilia' && estado !== 'atento') $('#parcial').textContent = '';
  if (estado === 'error' && detalle) toast('Sistema', detalle);
}

// ---------------- Reloj ----------------
function reloj() {
  const d = new Date();
  $('#hora').textContent = d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
  $('#fecha').textContent = d.toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------------- Formatos ----------------
function dinero(n) {
  const mon = ajustes.get('moneda', 'UYU');
  try { return new Intl.NumberFormat('es-UY', { style: 'currency', currency: mon, maximumFractionDigits: 0 }).format(n); }
  catch { return Math.round(n).toLocaleString('es-UY') + ' ' + mon; }
}
const hoy = () => ahoraStr().slice(0, 10);
const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return fmt(d).slice(0, 10); };
function cuandoCorto(f) {
  if (!f) return '';
  const dia = f.slice(0, 10), hora = f.slice(11, 16);
  if (dia === hoy()) return hora || 'hoy';
  if (dia === manana()) return 'mañana ' + hora;
  const d = new Date(dia + 'T00:00');
  return d.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' }) + (hora ? ' ' + hora : '');
}
function enlazar(texto) {
  return esc(texto)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/https?:\/\/[^\s<)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.length > 50 ? u.slice(0, 47) + '…' : u}</a>`);
}

// ---------------- Paneles ----------------
let eventosGoogle = [];
async function cargarEventosGoogle() {
  if (!G.configurado() || !G.conectado()) { eventosGoogle = []; return; }
  const fin = new Date(); fin.setDate(fin.getDate() + 2); fin.setHours(0, 0, 0, 0);
  try {
    eventosGoogle = (await eventosEntre(hoy() + ' 00:00', fmt(fin))).filter((e) => e.origen !== 'local');
  } catch { eventosGoogle = []; }
  pintarAgenda();
}

function pintarAgenda() {
  const limite = manana() + ' 23:59';
  const ahora = ahoraStr();
  const eventos = [
    ...D.eventos.filter((e) => (e.fin || e.inicio) >= ahora.slice(0, 10) + ' 00:00' && e.inicio <= limite),
    ...eventosGoogle,
  ].sort((a, b) => a.inicio.localeCompare(b.inicio));
  $('#lista-eventos').innerHTML = eventos.length ? eventos.map((e) => `
    <li><span class="hora ${e.inicio.slice(0, 10) !== hoy() ? 'manana' : ''}">${esc(cuandoCorto(e.inicio))}</span>
      <span class="txt">${esc(e.titulo)}${e.lugar ? `<span class="sub">${esc(e.lugar)}</span>` : ''}</span>
      ${String(e.id).startsWith('g:') ? '' : `<button class="x" data-borrar-evento="${e.id}" title="Borrar">×</button>`}</li>`).join('')
    : '<li class="vacio">Sin eventos. Decime "agendá…" y lo anoto.</li>';

  const recs = D.recordatorios.filter((r) => !r.avisado).sort((a, b) => a.cuando.localeCompare(b.cuando));
  $('#cuenta-recordatorios').textContent = recs.length ? recs.length + ' activos' : '';
  $('#lista-recordatorios').innerHTML = recs.length ? recs.slice(0, 8).map((r) => `
    <li><span class="hora">${esc(cuandoCorto(r.cuando))}</span><span class="txt">${esc(r.texto)}</span>
      <button class="x" data-borrar-rec="${r.id}" title="Borrar">×</button></li>`).join('')
    : '<li class="vacio">Nada pendiente.</li>';

  const orden = { alta: 0, normal: 1, baja: 2 };
  const tareas = D.tareas.filter((t) => !t.hecha)
    .sort((a, b) => (orden[a.prioridad] - orden[b.prioridad]) || (a.vence || '9').localeCompare(b.vence || '9'));
  $('#cuenta-tareas').textContent = tareas.length ? tareas.length + ' pendientes' : '';
  $('#lista-tareas').innerHTML = tareas.length ? tareas.map((t) => `
    <li class="prio-${t.prioridad} ${t.vence && t.vence < ahora ? 'vencida' : ''}">
      <button class="check" data-completar="${t.id}" title="Marcar como hecha" aria-label="Completar"></button>
      <span class="txt">${esc(t.titulo)}${t.vence ? `<span class="sub">vence ${esc(cuandoCorto(t.vence))}</span>` : ''}</span>
      <button class="x" data-borrar-tarea="${t.id}" title="Borrar">×</button></li>`).join('')
    : '<li class="vacio">Todo al día.</li>';
}

function pintarFinanzas() {
  const r = resumenMes();
  $('#fin-mes').textContent = new Date().toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
  const bal = $('#fin-balance');
  bal.textContent = dinero(r.balance);
  bal.classList.toggle('neg', r.balance < 0);
  $('#fin-ingresos').textContent = dinero(r.ingresos);
  $('#fin-gastos').textContent = dinero(r.gastos);

  const max = Math.max(1, ...r.categorias.map((c) => Math.max(c.gastado, c.presupuesto || 0)));
  $('#fin-categorias').innerHTML = r.categorias.length ? r.categorias.map((c) => {
    const ref = c.presupuesto || max;
    const pct = Math.min(100, (c.gastado / ref) * 100);
    const clase = c.presupuesto ? (c.gastado > c.presupuesto ? 'pasado' : c.gastado > c.presupuesto * 0.8 ? 'alerta' : '') : '';
    return `<li><div class="cab"><span>${esc(c.categoria)}</span><b>${dinero(c.gastado)}${c.presupuesto ? ' / ' + dinero(c.presupuesto) : ''}</b></div>
      <div class="pista"><div class="relleno ${clase}" style="width:${pct}%"></div></div></li>`;
  }).join('') : '<li class="vacio">Sin gastos este mes. Probá: "gasté 450 en el súper".</li>';

  const movs = [...D.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 15);
  $('#fin-movimientos').innerHTML = movs.length ? movs.map((m) => `
    <li><span class="txt">${esc(m.descripcion || m.categoria)}<span class="sub">${esc(m.categoria)} · ${esc(cuandoCorto(m.fecha))}</span></span>
      <span class="monto-mov ${m.tipo === 'gasto' ? 'rojo' : 'verde'}">${m.tipo === 'gasto' ? '−' : '+'}${
        (m.moneda && m.moneda !== ajustes.get('moneda', 'UYU')) ? esc(m.monto.toLocaleString('es-UY') + ' ' + m.moneda) : dinero(m.monto)}</span>
      <button class="x" data-borrar-mov="${m.id}" title="Borrar">×</button></li>`).join('')
    : '<li class="vacio">Sin movimientos.</li>';
}

function saludo() {
  const h = new Date().getHours();
  const parte = h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  return `${parte}, ${ajustes.get('nombre', 'señor')}. Todos los sistemas en línea. ¿En qué puedo ayudarte?`;
}

function pintarChat() {
  const msgs = D.chat.slice(-60);
  const chat = $('#chat');
  chat.innerHTML = (msgs.length ? '' : `<div class="msg jarvis">${esc(saludo())}</div>`) + msgs.map((m) => `
    <div class="msg ${m.rol}">${enlazar(m.texto)}${m.usadas?.length ? `<span class="usos">${esc([...new Set(m.usadas)].map((u) => ETIQUETAS[u] || u).join(' · '))}</span>` : ''}</div>`).join('')
    + (pendiente ? `<div class="msg usuario">${esc(pendiente.texto)}</div><div class="msg jarvis pensando" id="pensando">${esc(pendiente.etiqueta)}</div>` : '');
  chat.scrollTop = chat.scrollHeight;
}

function pintarChips() {
  $('#chip-ia').classList.toggle('ok', !!ajustes.get('api_key'));
  $('#chip-ia').classList.toggle('mal', !ajustes.get('api_key'));
  const gBtn = $('#chip-google');
  gBtn.hidden = !G.configurado();
  gBtn.classList.toggle('ok', G.conectado());
  gBtn.classList.toggle('mal', G.configurado() && !G.conectado());
  const s = $('#chip-sync');
  s.hidden = !ajustes.get('gh_token');
  s.classList.toggle('ok', estadoSync.ok);
  s.classList.toggle('mal', !estadoSync.ok);
  s.title = 'Sincronización: ' + estadoSync.texto;
  $('#aj-sync-estado').textContent = ajustes.get('gh_token') ? 'Estado: ' + estadoSync.texto : '';
}

function pintarTodo() { pintarAgenda(); pintarFinanzas(); pintarChat(); pintarChips(); }

// ---------------- Avisos ----------------
function toast(titulo, texto, ms = 7000) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<b>${esc(titulo)}</b>${esc(texto)}`;
  t.onclick = () => t.remove();
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

async function notificar(titulo, texto) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(titulo, { body: texto, icon: 'iconos/icono-192.png', badge: 'iconos/icono-192.png', vibrate: [200, 100, 200] });
    else new Notification(titulo, { body: texto, icon: 'iconos/icono-192.png' });
  } catch { /* */ }
}

function revisarRecordatorios() {
  const ahora = ahoraStr();
  const vencidos = D.recordatorios.filter((r) => !r.avisado && r.cuando <= ahora);
  if (!vencidos.length) return;
  vencidos.forEach((r) => { r.avisado = true; });
  guardar();
  const nombre = ajustes.get('nombre', 'señor');
  for (const r of vencidos) {
    toast('Recordatorio', r.texto, 30000);
    notificar('Jarvis · Recordatorio', r.texto);
  }
  V.hablar(`${nombre}, le recuerdo: ${vencidos.map((r) => r.texto).join('. ')}`);
}

// ---------------- Conversación ----------------
let ocupado = false;
let pendiente = null;
let pidioPermiso = false;

async function enviar(texto) {
  texto = texto.trim();
  if (!texto || ocupado) return;
  if (!pidioPermiso && 'Notification' in window && Notification.permission === 'default') {
    pidioPermiso = true; Notification.requestPermission().catch(() => {});
  }
  V.cancelarHabla();
  ocupado = true;
  setEstado('pensando');
  const chat = $('#chat');
  pendiente = { texto, etiqueta: 'Procesando' };
  pintarChat();
  try {
    const { respuesta } = await pensar(texto, (herr) => {
      pendiente.etiqueta = ETIQUETAS[herr] || 'Trabajando';
      const p = $('#pensando'); if (p) p.textContent = pendiente.etiqueta;
      $('#estado-texto').textContent = (ETIQUETAS[herr] || 'Procesando').toUpperCase();
    });
    ocupado = false;
    pendiente = null;
    pintarChat();
    setEstado('reposo');
    V.hablar(respuesta);
    cargarEventosGoogle();
  } catch (e) {
    ocupado = false;
    pendiente = null;
    pintarChat();
    chat.insertAdjacentHTML('beforeend', `<div class="msg usuario">${esc(texto)}</div><div class="msg jarvis error">${esc(e.message)}</div>`);
    chat.scrollTop = chat.scrollHeight;
    setEstado(V.enVigilia() ? 'vigilia' : 'reposo');
    V.hablar(e.message.split('.')[0] + '.');
    if (/clave/i.test(e.message)) abrirAjustes();
  }
}

// ---------------- Ajustes ----------------
function llenarVoces() {
  const sel = $('#aj-voz');
  const actual = ajustes.get('voz');
  sel.innerHTML = '<option value="">Automática</option>' + V.listaVoces()
    .map((v) => `<option value="${esc(v.name)}" ${v.name === actual ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
}

function abrirAjustes() {
  const dlg = $('#ajustes');
  if (dlg.open) return;
  $('#bienvenida').hidden = !!ajustes.get('api_key');
  $('#aj-api').value = ajustes.get('api_key');
  $('#aj-modelo').value = ajustes.get('modelo', 'claude-sonnet-5-5');
  $('#aj-web').checked = ajustes.get('busqueda_web', 'si') === 'si';
  $('#aj-nombre').value = ajustes.get('nombre');
  $('#aj-moneda').value = ajustes.get('moneda', 'UYU');
  $('#aj-hablar').checked = ajustes.get('hablar', 'si') === 'si';
  $('#aj-velocidad').value = ajustes.get('velocidad', '1.05');
  $('#aj-gh').value = ajustes.get('gh_token');
  $('#aj-google').value = ajustes.get('google_client_id');
  llenarVoces();
  pintarChips();
  dlg.showModal();
}

function guardarAjustes() {
  const tokenAntes = ajustes.get('gh_token');
  ajustes.set('api_key', $('#aj-api').value.trim());
  ajustes.set('modelo', $('#aj-modelo').value);
  ajustes.set('busqueda_web', $('#aj-web').checked ? 'si' : 'no');
  ajustes.set('nombre', $('#aj-nombre').value.trim());
  ajustes.set('moneda', ($('#aj-moneda').value.trim() || 'UYU').toUpperCase());
  ajustes.set('hablar', $('#aj-hablar').checked ? 'si' : 'no');
  ajustes.set('velocidad', $('#aj-velocidad').value);
  ajustes.set('voz', $('#aj-voz').value);
  const gh = $('#aj-gh').value.trim();
  ajustes.set('gh_token', gh);
  if (gh !== tokenAntes) { ajustes.set('gist_id', ''); if (gh) bajar(); }
  const gid = $('#aj-google').value.trim();
  if (gid !== ajustes.get('google_client_id')) { G.desconectar(); ajustes.set('google_ya_autorizo', ''); }
  ajustes.set('google_client_id', gid);
  pintarTodo();
  toast('Sistema', 'Ajustes guardados.', 2500);
}

// ---------------- Eventos de la interfaz ----------------
function conectar() {
  V.configurar({
    alTexto: (t) => { $('#parcial').textContent = ''; enviar(t); },
    alParcial: (t) => { $('#parcial').textContent = t; },
    alEstado: (e, detalle) => setEstado(e, detalle),
  });

  $('#form-chat').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const t = $('#texto').value; $('#texto').value = ''; enviar(t);
  });

  const microfono = () => {
    if (!V.puedeEscuchar) { toast('Voz', 'Este navegador no permite dictado. Usá Chrome o Edge (en iPhone, Safari).'); return; }
    if (estadoActual === 'escuchando') { V.cancelarOrden(); return; }
    if (V.enVigilia()) { V.vigilia(false); $('#btn-vigilia').classList.remove('activo'); }
    V.escucharOrden();
  };
  $('#btn-mic').addEventListener('click', microfono);
  $('#reactor').addEventListener('click', () => { if (estadoActual === 'hablando') { V.cancelarHabla(); setEstado('reposo'); } else microfono(); });

  $('#btn-vigilia').addEventListener('click', () => {
    if (!V.puedeEscuchar) { toast('Voz', 'Este navegador no permite dictado.'); return; }
    const activar = !V.enVigilia();
    V.vigilia(activar);
    $('#btn-vigilia').classList.toggle('activo', activar);
    toast('Modo escucha', activar ? 'Decí "Jarvis" seguido de tu pedido. Funciona mientras la app esté abierta.' : 'Desactivado.', 3500);
  });

  // Atajo: Ctrl + Espacio para hablar
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey && ev.code === 'Space') { ev.preventDefault(); microfono(); }
    if (ev.key === 'Escape') { V.cancelarHabla(); V.cancelarOrden(); }
  });

  $('#form-tarea').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const t = $('#nueva-tarea').value.trim();
    if (t) { await ejecutar('crear_tarea', { titulo: t }); $('#nueva-tarea').value = ''; }
  });

  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.completar) await ejecutar('completar_tarea', { id: d.completar });
    else if (d.borrarTarea) await ejecutar('borrar_tarea', { id: d.borrarTarea });
    else if (d.borrarRec) await ejecutar('borrar_recordatorio', { id: d.borrarRec });
    else if (d.borrarEvento) await ejecutar('borrar_evento', { id: d.borrarEvento });
    else if (d.borrarMov) { if (confirm('¿Borrar este movimiento?')) await ejecutar('borrar_movimiento', { id: d.borrarMov }); }
    else if (d.ir) document.body.dataset.seccion = d.ir;
  });

  $('#chip-google').addEventListener('click', async () => {
    try { await G.conectar(); toast('Google', 'Conectado: Gmail, Calendar y Drive.', 3000); pintarChips(); cargarEventosGoogle(); }
    catch (e) { toast('Google', 'No se pudo conectar: ' + e.message); }
  });

  $('#btn-ajustes').addEventListener('click', abrirAjustes);
  $('#ajustes').addEventListener('close', () => { if ($('#ajustes').returnValue === 'guardar') guardarAjustes(); });
  $('#aj-probar').addEventListener('click', () => {
    const prev = { voz: ajustes.get('voz'), vel: ajustes.get('velocidad'), hablar: ajustes.get('hablar') };
    ajustes.set('voz', $('#aj-voz').value); ajustes.set('velocidad', $('#aj-velocidad').value); ajustes.set('hablar', 'si');
    V.hablar(`A sus órdenes, ${$('#aj-nombre').value.trim() || 'señor'}. Así sueno.`, () => {
      ajustes.set('voz', prev.voz); ajustes.set('velocidad', prev.vel || '1.05'); ajustes.set('hablar', prev.hablar || 'si');
    });
  });
  $('#aj-exportar').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportar()], { type: 'application/json' }));
    a.download = `jarvis-copia-${hoy()}.json`;
    a.click();
  });
  $('#aj-importar').addEventListener('click', () => $('#aj-archivo').click());
  $('#aj-archivo').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try { importar(await f.text()); toast('Datos', 'Copia importada.'); } catch (e) { toast('Datos', 'Error: ' + e.message); }
    ev.target.value = '';
  });
  $('#aj-borrar-chat').addEventListener('click', () => {
    if (confirm('¿Borrar toda la conversación? (Tareas, agenda y finanzas no se tocan.)')) { D.chat = []; guardar(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { bajar(); revisarRecordatorios(); cargarEventosGoogle(); }
  });
}

// ---------------- Arranque ----------------
function iniciar() {
  alCambiar(pintarTodo);
  conectar();
  reloj();
  setInterval(reloj, 1000);
  setInterval(revisarRecordatorios, 15000);
  setInterval(() => { pintarAgenda(); }, 60000);
  pintarTodo();
  revisarRecordatorios();
  bajar();
  cargarEventosGoogle();
  if (!V.puedeEscuchar) $('#btn-vigilia').hidden = true;
  if (!ajustes.get('api_key')) setTimeout(abrirAjustes, 400);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

iniciar();
