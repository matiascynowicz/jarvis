// Herramientas que Jarvis (Claude) puede usar: tareas, recordatorios, agenda,
// finanzas, memoria, Gmail, Google Calendar y Drive.
import { D, guardar, nuevoId, ajustes } from './datos.js';
import * as G from './google.js';

const p2 = (n) => String(n).padStart(2, '0');
export const fmt = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const ahoraStr = () => fmt(new Date());
export const mesActual = () => ahoraStr().slice(0, 7);
const normFecha = (f) => (f || '').trim().replace('T', ' ').slice(0, 16);
const moneda = () => ajustes.get('moneda', 'UYU');

const FECHA = 'Formato "AAAA-MM-DD HH:MM" en hora local.';

const def = (name, description, properties = {}, required = []) =>
  ({ name, description, input_schema: { type: 'object', properties, required } });

const LOCALES = [
  def('crear_tarea', 'Agrega una tarea pendiente a la lista.', {
    titulo: { type: 'string' },
    vence: { type: 'string', description: 'Opcional. ' + FECHA },
    prioridad: { type: 'string', enum: ['baja', 'normal', 'alta'] },
  }, ['titulo']),
  def('listar_tareas', 'Lista las tareas.', { incluir_hechas: { type: 'boolean' } }),
  def('completar_tarea', 'Marca una tarea como hecha.', { id: { type: 'integer' } }, ['id']),
  def('borrar_tarea', 'Borra una tarea.', { id: { type: 'integer' } }, ['id']),

  def('crear_recordatorio', 'Programa un aviso (Jarvis habla y muestra una notificación a esa hora, si la app está abierta).', {
    texto: { type: 'string' }, cuando: { type: 'string', description: FECHA },
  }, ['texto', 'cuando']),
  def('listar_recordatorios', 'Lista los recordatorios pendientes.'),
  def('borrar_recordatorio', 'Borra un recordatorio.', { id: { type: 'integer' } }, ['id']),

  def('crear_evento', 'Agrega un evento a la agenda (en Google Calendar si está conectado; si no, en la agenda local).', {
    titulo: { type: 'string' }, inicio: { type: 'string', description: FECHA },
    fin: { type: 'string', description: 'Opcional, por defecto 1 hora después. ' + FECHA },
    lugar: { type: 'string' }, notas: { type: 'string' },
  }, ['titulo', 'inicio']),
  def('listar_eventos', 'Lista eventos de la agenda entre dos fechas (local + Google Calendar si está conectado).', {
    desde: { type: 'string', description: FECHA }, hasta: { type: 'string', description: FECHA },
  }, ['desde', 'hasta']),
  def('borrar_evento', 'Borra un evento por id (los de Google empiezan con "g:").', { id: { type: 'string' } }, ['id']),

  def('registrar_movimiento', 'Registra un gasto o ingreso de dinero.', {
    monto: { type: 'number', description: 'Siempre positivo.' },
    tipo: { type: 'string', enum: ['gasto', 'ingreso'] },
    categoria: { type: 'string', description: 'En minúsculas, ej: comida, transporte, alquiler, salidas, sueldo, servicios, salud, compras, suscripciones, otros.' },
    descripcion: { type: 'string' },
    fecha: { type: 'string', description: 'Opcional, por defecto ahora. ' + FECHA },
    moneda: { type: 'string', description: 'Código, ej UYU o USD. Por defecto la moneda principal.' },
  }, ['monto', 'tipo', 'categoria']),
  def('listar_movimientos', 'Lista movimientos de dinero.', {
    mes: { type: 'string', description: 'AAAA-MM. Por defecto el mes actual.' },
    categoria: { type: 'string' }, limite: { type: 'integer' },
  }),
  def('resumen_finanzas', 'Resumen del mes: ingresos, gastos, balance, gastos por categoría y presupuestos.', {
    mes: { type: 'string', description: 'AAAA-MM. Por defecto el mes actual.' },
  }),
  def('borrar_movimiento', 'Borra un movimiento de dinero.', { id: { type: 'integer' } }, ['id']),
  def('fijar_presupuesto', 'Fija el límite mensual de gasto para una categoría (0 para quitarlo).', {
    categoria: { type: 'string' }, limite: { type: 'number' },
  }, ['categoria', 'limite']),

  def('recordar_dato', 'Guarda un dato duradero sobre el usuario para recordarlo siempre (gustos, personas, datos útiles).', {
    dato: { type: 'string' },
  }, ['dato']),
  def('olvidar_dato', 'Borra un dato guardado en la memoria.', { id: { type: 'integer' } }, ['id']),
];

const DE_GOOGLE = [
  def('buscar_mails', 'Busca mails en Gmail. Usa la sintaxis de búsqueda de Gmail (ej: "is:unread", "from:juan", "newer_than:2d").', {
    consulta: { type: 'string' }, maximo: { type: 'integer' },
  }, ['consulta']),
  def('leer_mail', 'Lee el contenido completo de un mail por id.', { id: { type: 'string' } }, ['id']),
  def('crear_borrador', 'Guarda un borrador en Gmail (no lo envía).', {
    para: { type: 'string' }, asunto: { type: 'string' }, cuerpo: { type: 'string' },
  }, ['para', 'asunto', 'cuerpo']),
  def('enviar_mail', 'Envía un mail. SOLO usar después de que el usuario confirmó explícitamente destinatario, asunto y texto.', {
    para: { type: 'string' }, asunto: { type: 'string' }, cuerpo: { type: 'string' },
    confirmado: { type: 'boolean', description: 'true solo si el usuario dijo que sí al texto final.' },
  }, ['para', 'asunto', 'cuerpo', 'confirmado']),
  def('buscar_drive', 'Busca archivos en Google Drive por texto.', { texto: { type: 'string' } }, ['texto']),
];

export function definiciones() {
  const lista = [...LOCALES];
  if (G.configurado()) lista.push(...DE_GOOGLE);
  if (ajustes.get('busqueda_web', 'si') === 'si') {
    lista.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 });
  }
  return lista;
}

// ---------------- Lógica ----------------
const buscar = (lista, id) => {
  const x = lista.find((e) => e.id === Number(id));
  if (!x) throw new Error('No existe el id ' + id);
  return x;
};
const quitar = (nombre, id) => {
  const n = D[nombre].length;
  D[nombre] = D[nombre].filter((e) => e.id !== Number(id));
  if (D[nombre].length === n) throw new Error('No existe el id ' + id);
  guardar();
  return { ok: true };
};

export function resumenMes(mes = mesActual()) {
  const movs = D.movimientos.filter((m) => m.fecha.startsWith(mes) && (m.moneda || moneda()) === moneda());
  const suma = (t) => movs.filter((m) => m.tipo === t).reduce((a, m) => a + m.monto, 0);
  const porCat = {};
  movs.filter((m) => m.tipo === 'gasto').forEach((m) => (porCat[m.categoria] = (porCat[m.categoria] || 0) + m.monto));
  const categorias = Object.entries(porCat).sort((a, b) => b[1] - a[1])
    .map(([categoria, gastado]) => ({ categoria, gastado, presupuesto: D.presupuestos[categoria] ?? null }));
  for (const [categoria, presupuesto] of Object.entries(D.presupuestos)) {
    if (!porCat[categoria]) categorias.push({ categoria, gastado: 0, presupuesto });
  }
  const otras = D.movimientos.filter((m) => m.fecha.startsWith(mes) && (m.moneda || moneda()) !== moneda());
  return {
    mes, moneda: moneda(), ingresos: suma('ingreso'), gastos: suma('gasto'),
    balance: suma('ingreso') - suma('gasto'), categorias,
    ...(otras.length ? { en_otras_monedas: otras.map(({ monto, tipo, moneda: mo, descripcion }) => ({ monto, tipo, moneda: mo, descripcion })) } : {}),
  };
}

export async function eventosEntre(desde, hasta) {
  const locales = D.eventos.filter((e) => e.inicio >= desde && e.inicio <= hasta).map((e) => ({ ...e, origen: 'local' }));
  let google = [];
  if (G.configurado() && G.conectado()) {
    try { google = await G.listarEventos(desde, hasta); } catch (e) { console.warn(e); }
  }
  return [...locales, ...google].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

const FN = {
  crear_tarea({ titulo, vence = '', prioridad = 'normal' }) {
    const t = { id: nuevoId(), titulo, vence: normFecha(vence), prioridad, hecha: false, creada: ahoraStr() };
    D.tareas.push(t); guardar(); return t;
  },
  listar_tareas({ incluir_hechas = false }) {
    return D.tareas.filter((t) => incluir_hechas || !t.hecha);
  },
  completar_tarea({ id }) { const t = buscar(D.tareas, id); t.hecha = true; guardar(); return t; },
  borrar_tarea: ({ id }) => quitar('tareas', id),

  crear_recordatorio({ texto, cuando }) {
    const r = { id: nuevoId(), texto, cuando: normFecha(cuando), avisado: false };
    D.recordatorios.push(r); guardar(); return r;
  },
  listar_recordatorios: () => D.recordatorios.filter((r) => !r.avisado).sort((a, b) => a.cuando.localeCompare(b.cuando)),
  borrar_recordatorio: ({ id }) => quitar('recordatorios', id),

  async crear_evento({ titulo, inicio, fin = '', lugar = '', notas = '' }) {
    inicio = normFecha(inicio);
    if (!fin) { const d = new Date(inicio.replace(' ', 'T')); d.setHours(d.getHours() + 1); fin = fmt(d); }
    fin = normFecha(fin);
    if (G.configurado() && G.conectado()) return G.crearEvento({ titulo, inicio, fin, lugar, notas });
    const e = { id: nuevoId(), titulo, inicio, fin, lugar, notas };
    D.eventos.push(e); guardar(); return { ...e, origen: 'agenda local' };
  },
  listar_eventos: ({ desde, hasta }) => eventosEntre(normFecha(desde), normFecha(hasta)),
  async borrar_evento({ id }) {
    id = String(id);
    if (id.startsWith('g:')) { await G.borrarEvento(id.slice(2)); return { ok: true }; }
    return quitar('eventos', id);
  },

  registrar_movimiento({ monto, tipo, categoria, descripcion = '', fecha = '', moneda: mo = '' }) {
    const m = { id: nuevoId(), monto: Math.abs(Number(monto)), tipo, categoria: (categoria || 'otros').toLowerCase().trim(),
                descripcion, fecha: normFecha(fecha) || ahoraStr(), moneda: (mo || moneda()).toUpperCase() };
    D.movimientos.push(m); guardar();
    return { registrado: m, resumen_del_mes: resumenMes(m.fecha.slice(0, 7)) };
  },
  listar_movimientos({ mes = mesActual(), categoria = '', limite = 50 }) {
    return D.movimientos.filter((m) => m.fecha.startsWith(mes) && (!categoria || m.categoria === categoria.toLowerCase()))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, limite);
  },
  resumen_finanzas: ({ mes }) => resumenMes(mes || mesActual()),
  borrar_movimiento: ({ id }) => quitar('movimientos', id),
  fijar_presupuesto({ categoria, limite }) {
    categoria = categoria.toLowerCase().trim();
    if (Number(limite) > 0) D.presupuestos[categoria] = Number(limite); else delete D.presupuestos[categoria];
    guardar(); return { presupuestos: D.presupuestos };
  },

  recordar_dato({ dato }) { const m = { id: nuevoId(), dato, creado: ahoraStr() }; D.memoria.push(m); guardar(); return m; },
  olvidar_dato: ({ id }) => quitar('memoria', id),

  buscar_mails: ({ consulta, maximo = 10 }) => G.buscarMails(consulta, Math.min(maximo, 20)),
  leer_mail: ({ id }) => G.leerMail(id),
  crear_borrador: ({ para, asunto, cuerpo }) => G.crearBorrador(para, asunto, cuerpo),
  enviar_mail({ para, asunto, cuerpo, confirmado }) {
    if (!confirmado) return { error: 'Falta confirmación. Leé el mail al usuario y preguntá si lo envío.' };
    return G.enviarMail(para, asunto, cuerpo);
  },
  buscar_drive: ({ texto }) => G.buscarDrive(texto),
};

export async function ejecutar(nombre, entrada) {
  const fn = FN[nombre];
  if (!fn) return { error: 'Herramienta desconocida: ' + nombre };
  try { return (await fn(entrada || {})) ?? { ok: true }; }
  catch (e) { return { error: e.message }; }
}

export const ETIQUETAS = {
  crear_tarea: 'Creando tarea', listar_tareas: 'Revisando tareas', completar_tarea: 'Completando tarea',
  borrar_tarea: 'Borrando tarea', crear_recordatorio: 'Programando recordatorio', listar_recordatorios: 'Revisando recordatorios',
  borrar_recordatorio: 'Borrando recordatorio', crear_evento: 'Agendando', listar_eventos: 'Consultando agenda',
  borrar_evento: 'Borrando evento', registrar_movimiento: 'Registrando movimiento', listar_movimientos: 'Revisando movimientos',
  resumen_finanzas: 'Analizando finanzas', borrar_movimiento: 'Borrando movimiento', fijar_presupuesto: 'Ajustando presupuesto',
  recordar_dato: 'Guardando en memoria', olvidar_dato: 'Olvidando dato', buscar_mails: 'Buscando en Gmail',
  leer_mail: 'Leyendo mail', crear_borrador: 'Redactando borrador', enviar_mail: 'Enviando mail',
  buscar_drive: 'Buscando en Drive', web_search: 'Buscando en internet',
};
