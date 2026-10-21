# Asistente: conversación, cambios confirmados y voz

Actualización funcional — 21/10/2026. Solo afecta a `v2/`; no despliega ni modifica v1.

## Historial y continuidad

- **Aplicación privada:** los últimos 40 turnos completados se guardan en SQLite, aislados por empresa y usuario. Se recuperan al volver al asistente, recargar o iniciar otra sesión de la misma cuenta. Se actualizan al recuperar el foco. No hay historial privado en localStorage/sessionStorage.
- Cambiar de sección mantiene el borrador y la consulta en curso en memoria, sin abortarla. El micrófono y la lectura sí se detienen. **Recargar/cerrar** la página o cerrar sesión cancela la petición del navegador: no se garantiza guardar una respuesta aún incompleta ni detener el procesamiento/coste remoto. No hay trabajos de IA en segundo plano independientes del navegador.
- **Demo:** historial separado por perfil público en sessionStorage de la pestaña. No se persisten conversaciones comunes en el servidor. Si se bloquea almacenamiento, se conserva en memoria al navegar pero se pierde al recargar/cerrar.
- Guardar y visualizar no equivale a reenviar al modelo. **Enviar últimos mensajes** está desactivado de inicio y requiere autorización administrativa de contexto. Envía como máximo 8 turnos completos y 12.000 caracteres JSON. Sin marcarlo, el modelo solo recibe la consulta actual y el contexto operativo que autorices por separado; no conoce automáticamente conversaciones anteriores. Los estados actuales de propuestas se adjuntan al historial autorizado para no confundir «propuesto» con «aplicado».
- **Borrar historial** pide confirmación y elimina únicamente tus turnos y metadatos de propuestas, invalidando las pendientes. Una respuesta antigua en vuelo no puede resucitar el historial borrado. No elimina registros de trabajo, su auditoría ni copias de seguridad existentes.

**Privacidad:** los textos se guardan sin cifrado adicional, con los permisos/protecciones de SQLite y del directorio privado. Las copias incluyen este historial: ajustar acceso, cifrado de volumen y retención. No enviar contraseñas ni secretos. El saneado de la clave exacta de conexión en respuestas del proveedor no es DLP universal. El proveedor puede retener las consultas según sus condiciones; borrar el historial local no borra sus copias.

## Herramientas de modificación

1. El administrador configura el único proveedor compartido y autoriza contexto operativo.
2. El usuario selecciona **IA local / IA real**, marca **Adjuntar muestra operativa** y **Permitir propuestas de cambios**.
3. Pide **un cambio cada vez**. Ejemplo: «Crea una tarea llamada Preparar presentación, responsable [nombre exacto del equipo], fecha 2026-12-01».
4. Revisa la tarjeta con campos exactos y, al editar, sus valores anteriores. Puedes **Confirmar y aplicar**, cancelar o pedir otra propuesta; no hay edición libre de argumentos al confirmar.
5. El servidor ejecuta solo al confirmar, actualiza las vistas y registra la modificación con actor, antes/después y el ID de propuesta del asistente.

| Rol | Crear/modificar mediante propuestas |
|---|---|
| Admin / manager | Proyectos, tareas, reuniones, incidencias y eventos |
| Member | Tareas, reuniones e incidencias |
| Viewer | Ningún cambio |

- No hay herramientas para borrar, administrar usuarios, aprobar pagos, ejecutar SQL/código/shell, navegar por archivos o contactar otros servicios.
- El modelo debe admitir llamadas de función compatibles con OpenAI. El servidor solo reconoce diez funciones permitidas, una propuesta por respuesta, con argumentos acotados. Texto como «ya lo he cambiado» **no ejecuta nada**. En una respuesta con herramienta se sustituye esa afirmación por un aviso inequívoco de cambio no aplicado.
- Las herramientas comparten **exactamente el servicio de mutación de los formularios HTTP**: campos permitidos, enums, tipos, fechas, referencias de tu empresa, permisos actuales y auditoría transaccional. Los argumentos de la confirmación no sustituyen los guardados en la propuesta.
- Cada propuesta pertenece al usuario/empresa que la pidió y caduca a los **10 minutos**. Confirmarla repetidamente devuelve el mismo resultado sin duplicar registros ni auditoría. Si pierde permisos o cambia cualquier campo del registro desde la propuesta, se rechaza: debe pedir otra. Un fallo de auditoría revierte también el cambio y la confirmación.
- El contexto con herramientas contiene hasta 25 filas por tipo (proyectos/tareas/incidencias/reuniones/eventos/equipo activo), máximo 12.000 caracteres JSON. Incluye IDs y nombres para preparar cambios; no notas, agendas, descripciones, correos, invitaciones ni sesiones. Es una muestra, no una búsqueda completa: si el registro no aparece, usa edición manual o proporciona su identificación. El historial autorizado y los esquemas de herramientas consumen contexto adicional.
- Las propuestas sin historial asociado se depuran al caducar al generar nuevas propuestas; no hay proceso de limpieza en segundo plano. Las vinculadas siguen disponibles mientras se conserve su turno, con estado actualizado.
- En la **demo pública las herramientas de IA están deshabilitadas**: sus perfiles son públicos, no identidades privadas.

## Voz

- Marca la autorización de dictado y pulsa **Dictar pregunta**. Requiere HTTPS (localhost también se considera seguro), SpeechRecognition/webkitSpeechRecognition y permiso de micrófono. Un iframe o la política del navegador puede bloquearlo: abre la aplicación en una pestaña propia si es necesario. El servidor permite micrófono solo a su propio origen; cámara/geolocalización siguen deshabilitadas.
- El texto dictado se añade al borrador, limitado a 2.000 caracteres. Pulsa **Detener dictado**, revisa y luego **Enviar**. No hay envío ni confirmación de cambios mediante voz automática.
- **Leer respuesta** usa speechSynthesis; puedes activar lectura automática de respuestas nuevas o detenerla. No se leen automáticamente conversaciones recuperadas. Al cambiar de sección, ocultar la pestaña o salir, se detienen captura y reproducción; una respuesta que llegue mientras estás fuera no se lee sola.
- Español por defecto; inglés y euskera sujetos a soporte real del navegador. No se incluyen motores ni voces descargadas.
- El dictado y algunas voces pueden utilizar servicios en línea del navegador. **No se garantiza voz local**, incluso con un LLM local. La aplicación no recibe/graba audio; el texto enviado sí forma parte del historial normal. Sin soporte o permisos, sigue escribiendo y leyendo.

## Verificación de esta ampliación

- Suite `npm test`: **156 pruebas aprobadas**, incluidas persistencia y límites, aislamiento, consentimiento, demo sin historial compartido, diez funciones permitidas, cinco recursos, confirmación idempotente, permisos revocados, caducidad/cancelación, cambios concurrentes, rollback de auditoría, borrado durante inferencia y sesión revocada en vuelo.
- `npm run lint -- --deny-warnings`: sin errores ni avisos. `npm run build`: correcto. `npm audit --omit=dev`: **0 vulnerabilidades conocidas** en dependencias de ejecución.
- Navegador Chromium headless con API/SQLite temporales reales y respuestas de proveedor **controladas**: conversación tras navegar/recargar, consulta que termina desde otra sección, propuesta sin escritura antes de confirmar, confirmación efectiva, dictado simulado sin envío, lectura/parada y móvil de 390 px sin desbordamiento; sin errores JavaScript de página.
- Demo pública real en navegador: entrada sin login, historial tras recargar en su pestaña y otra pestaña sin conversación compartida; sin errores JavaScript. UI y readiness 200 en puertos 3002/3003/5174/5175; historial anónimo privado 401 y demo 200.
- **No se ha validado inferencia con un modelo real ni audio físico/permisos reales**: la voz del navegador se sustituyó por dobles controlados. No se instaló Ollama/LM Studio ni se reanudó la validación cancelada por el usuario. El dictamen operativo de [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) sigue vigente; estos resultados no equivalen a autorización de producción.
