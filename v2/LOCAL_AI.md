# IA local compartida · Ollama / LM Studio

**Solo el administrador configura un servidor y un modelo para todo el workspace.** Los demás usuarios no introducen claves ni cambian modelos: todos usan la conexión elegida por el admin. Las empresas distintas mantienen configuraciones independientes.

«Compatible con OpenAI» significa que el servidor entiende el formato HTTP de su API. **No necesitas una cuenta de OpenAI, ni utilizar su nube, ni una clave de pago para ejecutar un modelo local.**

## Opción recomendada: Ollama

1. Instala Ollama en el ordenador donde ejecutarás los modelos: <https://ollama.com/download>.
2. Descarga un modelo de chat. Un punto de partida es:

   ```sh
   ollama pull qwen2.5:3b
   ```

   La descarga inicial necesita Internet. El tamaño y la velocidad dependen del modelo y del hardware. Elige otro modelo si tu equipo lo necesita.
3. Inicia Ollama. Su aplicación de escritorio suele arrancar el servicio; si no está en marcha, abre una terminal y ejecuta:

   ```sh
   ollama serve
   ```

   Si indica que el puerto ya está ocupado, comprueba si Ollama ya está funcionando antes de iniciar otra instancia.
4. Ejecuta **también la v2 en ese ordenador**. Desde el repositorio:

   ```sh
   cd v2
   npm ci
   npm run build
   npm start
   ```

   Para tu conexión privada, sigue el alta limpia del [README](README.md) y configura tu administrador. Para una prueba pública separada, usa `npm run demo` en el puerto 3003: entra sin registro, pero solo admite modelos locales sin token ni datos privados.
5. Abre <http://localhost:3002>. Entra con tu administrador privado. No uses cuentas de la demo en esta aplicación.
6. En **Configuración → Fast setup**, selecciona **Ollama · local**:

   - URL: `http://127.0.0.1:11434/v1`
   - Token: vacío, salvo que tu instalación protegida lo requiera.
   - Pulsa **Consultar modelos** y elige uno de los modelos instalados. El propuesto es `qwen2.5:3b`.
   - Decide si autorizas adjuntar contexto y pulsa **Probar y activar**.
7. Todos los usuarios del espacio ya pueden abrir el asistente y seleccionar **IA local**. La autorización para adjuntar contexto sigue siendo explícita por consulta.

La aplicación no instala Ollama ni descarga pesos de modelos desde su interfaz. «Consultar modelos» solo consulta los que el servidor tiene disponibles; «Probar y activar» exige que el servidor responda a una petición real.

## Alternativa: LM Studio

1. Instala LM Studio desde <https://lmstudio.ai>.
2. Descarga un modelo de chat adecuado para tu equipo y cárgalo en memoria.
3. Abre su panel de servidor local y arráncalo en el puerto `1234`, con su API compatible con OpenAI.
4. En la configuración de la v2, selecciona **LM Studio · local** y la URL `http://127.0.0.1:1234/v1`.
5. Deja el token vacío si el servidor no exige autenticación; si la exige, introduce el token de esa instalación.
6. Pulsa **Consultar modelos**, elige el identificador real del modelo cargado y pulsa **Probar y activar**. `local-model` es solo un marcador inicial: no se instala ni crea un modelo con ese nombre.

## Otro servidor compatible

El perfil **Otro servidor compatible con OpenAI** admite servidores que expongan:

- `GET /v1/models`, con un catálogo `data: [{ id: ... }]`.
- `POST /v1/chat/completions`, con `model`, `messages`, `max_tokens` y `stream: false`.
- Una respuesta de texto en `choices[0].message.content`.

No utiliza `/api/generate`, `/api/chat` nativos de Ollama, ni `/responses`. La URL debe terminar en `/v1` y no puede llevar credenciales, parámetros ni fragmentos.

## ¿El modelo está en otro servidor, contenedor o puerto?

Las peticiones al modelo **salen del servidor Express**, no del navegador. Por tanto:

- Si abres la aplicación en Arena, `localhost` es Arena, **no tu ordenador**.
- Si la aplicación está en Docker, `localhost` es ese contenedor, no el host ni otro contenedor.
- Los usuarios pueden entrar desde otros equipos y utilizar el servidor de modelos compartido, siempre que Express pueda alcanzarlo.

Por seguridad solo se permiten por defecto los orígenes HTTP de `127.0.0.1`, `localhost` y `[::1]`, en los puertos `11434` y `1234`. Otros destinos requieren autorización **del operador del despliegue**, además del admin de la aplicación. Por ejemplo, en una red privada de contenedores:

```sh
export V2_AI_ALLOWED_ORIGINS="http://ollama:11434"
npm start
```

Después, el admin configura `http://ollama:11434/v1`. Para varios orígenes, sepáralos con comas. No hay comodines. Las redirecciones están bloqueadas. Si retiras un origen autorizado, las consultas a ese destino se bloquean también para configuraciones ya guardadas.

No expongas Ollama o LM Studio sin autenticación a Internet. Para otro equipo utiliza una red privada y controles de acceso adecuados. El servidor de modelos también debe escuchar en la interfaz necesaria y aceptar la conexión; la aplicación no modifica su configuración de red ni su firewall.

## Privacidad y comprobaciones

- La inferencia es local **si has instalado un modelo local y el servidor no reenvía a otro proveedor**. La compatibilidad OpenAI o la URL por sí solas no garantizan que otro servidor no use la nube; revisa tu backend.
- No se cambia automáticamente de proveedor local a nube si algo falla.
- Solo se incluyen datos de trabajo cuando el admin lo autoriza y el usuario marca su casilla. Los prompts enviados por el usuario pueden contener datos sensibles aunque no se adjunte contexto.
- Las claves opcionales se cifran como las claves de nube. Una instalación local sin token no genera ni necesita una clave maestra para esa conexión.
- El timeout local es de 120 segundos para permitir la primera carga del modelo. El timeout de nube es 25 s. Se aplican 20 llamadas por usuario/minuto, 60 por empresa/minuto, 2 llamadas simultáneas por empresa y 8 por proceso. Los límites generales de API también se aplican.
- Las pruebas del repositorio comprueban el protocolo HTTP contra un servidor local de prueba y respuestas controladas. **No se han instalado ni ejecutado pesos de un modelo real en Arena.**


## Límites y significado del estado

- «Consultar modelos» consulta el catálogo, **no realiza inferencia** ni guarda una conexión. «Probar y activar» llama a `/chat/completions` y solo guarda al recibir texto válido y no truncado. La fecha visible es histórica: no promete disponibilidad actual.
- Cada pregunta exige elegir IA; sin proveedor o con errores no se simula IA ni se cambia a reglas silenciosamente. Reintento manual: no se repiten automáticamente POST que pueden generar costes.
- El servidor lee como máximo 256 KiB para una respuesta de chat y 1 MiB para el catálogo. Devuelve hasta 16.000 caracteres de texto y avisa si es parcial (`finish_reason=length` o recorte). Comunica uso solo si lo informa el proveedor; no inventa costes. Si falta finish_reason, lo indica como desconocido.
- El contexto opcional contiene hasta 25 filas por tipo y un máximo total de 12.000 caracteres JSON; no es un cálculo exacto de tokens. Tu modelo debe soportar el prompt y el margen de 800 tokens de salida. Acota la pregunta/contexto si su ventana es menor.
- Cancelar desde la UI aborta el fetch del servidor y libera sus recursos. **No garantiza** detener el trabajo remoto ni evitar su coste.
- Cambiar/desconectar configuración o revocar al admin mientras se prueba impide guardar una conexión obsoleta; una petición ya enviada no se puede des-enviar.
- `V2_AI_ALLOWED_ORIGINS` se valida al arrancar: sin rutas, comodines, credenciales ni metadatos/link-local/multicast literales. Se permiten redes privadas elegidas explícitamente para tus motores; eso no es una prohibición de toda IP privada. Usa IPs estáticas o DNS interno controlado y un firewall de salida. No hay pinning DNS/transporte personalizado para orígenes autorizados: no autorices dominios controlados por terceros o DNS mutable no confiable.
- **Demo pública:** no hay llamadas a modelos por defecto, incluso aunque selecciones el perfil de ejemplo admin. El operador puede optar expresamente por `V2_DEMO_AI_ENABLED=true` con un motor desechable sin claves y presupuesto de recursos. No lo actives contra modelos o redes sensibles. Los roles de demo son públicos, no credenciales de operador.


## Conversaciones, herramientas y voz

Consulta [ASSISTANT.md](ASSISTANT.md). El historial privado persiste por usuario y empresa; reenviarlo al modelo exige autorización administrativa de contexto y una casilla explícita del usuario. Las herramientas requieren además el contexto operativo y un modelo con llamadas de función OpenAI (`tools` / `tool_calls`). No se aceptan comandos de escritura en texto libre. Un modelo sin esa capacidad puede responder texto pero no generar una propuesta ejecutable.

Las definiciones de las herramientas añaden entrada al prompt, además de las muestras de contexto y del historial. Usa una ventana de contexto suficiente en el motor, desactiva historial si es necesario y acota la consulta. La aplicación no instala modelos ni modifica su ventana automáticamente. Una propuesta no es ejecución: solo **Confirmar y aplicar** escribe en el espacio privado. La demo pública no admite estas herramientas aunque el operador autorice inferencia.

La voz usa servicios del navegador, no el servidor Ollama/LM Studio. El dictado y algunas voces pueden procesarse en línea; no prometemos voz local. Se detienen al salir del asistente u ocultar la pestaña. La entrada por texto sigue disponible.
