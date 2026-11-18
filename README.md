# J.A.R.V.I.S. — mi asistente personal

Asistente personal estilo Iron Man que funciona como **web app**: se abre en el navegador de la PC y en el celular se instala como una app más.

**Dirección:** https://matiascynowicz.github.io/jarvis/

## Qué hace

- **Voz:** le hablás (botón de micrófono, tocar el reactor, o `Ctrl + Espacio`) y te contesta en voz alta. Con el botón del ojo 👁 activás el modo **"Hey Jarvis"**: escucha hasta que decís su nombre.
- **Agenda y recordatorios:** "agendá dentista el jueves a las 4", "recordame en 20 minutos sacar la ropa".
- **Tareas:** "anotá pagar la luz, prioridad alta".
- **Finanzas:** "gasté 450 en el súper", "cobré 30.000 de sueldo", "¿cuánto gasté en salidas este mes?", "poné un presupuesto de 8.000 para comida".
- **Gmail, Google Calendar y Drive** (opcional): "¿tengo mails sin leer?", "respondele a Juan que mañana no puedo".
- **Internet:** clima, noticias, precios, lo que sea.
- **Memoria:** recuerda cosas tuyas ("mi novia se llama…", "soy alérgico a…").

## 1. Activar la página (una sola vez)

En GitHub, en este repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch" → Branch: `main` / `(root)` → Save**. En 1–2 minutos queda en la dirección de arriba.

## 2. Clave de Claude (obligatoria)

1. Entrá a https://console.anthropic.com → **API Keys → Create Key**.
2. Cargá crédito en **Billing** (con 5 USD dura bastante; Haiku es el más barato).
3. En Jarvis, tocá ⚙ y pegá la clave. Se guarda **solo en ese dispositivo**, nunca en GitHub.

## 3. Instalarlo en el celular

- **Android (Chrome):** abrí la dirección → menú ⋮ → **Instalar app** (o "Agregar a pantalla principal").
- **iPhone (Safari):** abrí la dirección → botón Compartir → **Agregar a inicio**.

En la PC, con Chrome o Edge aparece un ícono de "Instalar" en la barra de direcciones.

## 4. Sincronizar PC ↔ celular (recomendado)

Sin esto, cada dispositivo tiene sus propios datos.

1. Entrá a https://github.com/settings/tokens/new (token "classic").
2. Nota: `jarvis`. Expiración: la que quieras. Marcá **solo** el permiso **`gist`**. Generar.
3. Copiá el token y pegalo en ⚙ → *Sincronizar* en **los dos** dispositivos.

Tus datos quedan en un Gist **privado** de tu cuenta.

## 5. Conectar Google (opcional)

1. Entrá a https://console.cloud.google.com y creá un proyecto ("Jarvis").
2. **APIs y servicios → Biblioteca:** habilitá **Gmail API**, **Google Calendar API** y **Google Drive API**.
3. **Pantalla de consentimiento OAuth:** tipo *Externo*, completá nombre y tu mail, y en **Usuarios de prueba** agregá tu propio Gmail.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web.**
   En **Orígenes de JavaScript autorizados** poné: `https://matiascynowicz.github.io`
5. Copiá el **ID de cliente** (termina en `.apps.googleusercontent.com`) y pegalo en ⚙ → Google.
6. Tocá el botón **GOOGLE** de arriba y aceptá. (Google pide reconectar cada ~1 hora: un toque en ese botón.)

## Bueno saber

- Los **recordatorios** suenan si Jarvis está abierto (en la PC alcanza con dejar la pestaña abierta). Para avisos con la app cerrada, pedile que lo agende en Google Calendar.
- La **voz** anda mejor en Chrome / Edge / Android. En iPhone funciona en Safari.
- Antes de **enviar un mail** siempre te pide confirmación.
- ⚙ → *Exportar copia* baja todos tus datos en un archivo.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `css/estilo.css` | La interfaz (HUD) |
| `js/cerebro.js` | Habla con Claude y decide qué hacer |
| `js/herramientas.js` | Tareas, agenda, finanzas, memoria, mail |
| `js/voz.js` | Reconocimiento y síntesis de voz |
| `js/google.js` | Gmail, Calendar y Drive |
| `js/datos.js` | Guardado local y sincronización |
| `sw.js`, `manifest.webmanifest` | Lo que lo hace instalable como app |

Al subir cambios, subí el número de `VERSION` en `sw.js` para que el celular se actualice.
