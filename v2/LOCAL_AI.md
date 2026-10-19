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
   DEMO_MODE=true npm start
   ```

   El prefijo `DEMO_MODE=true` es sintaxis de terminal POSIX. En PowerShell utiliza `$env:DEMO_MODE="true"; npm start`. Para datos reales, sigue el alta limpia del [README](README.md), sin modo demo.
5. Abre <http://localhost:3002>. En la demo, entra como admin con `ava@northstar.io` y `Northstar2026!`.
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
- El timeout local es de 120 segundos para permitir la primera carga del modelo. Sigue existiendo el límite de 20 llamadas por usuario/empresa por minuto.
- Las pruebas del repositorio comprueban el protocolo HTTP contra un servidor local de prueba y respuestas controladas. **No se han instalado ni ejecutado pesos de un modelo real en Arena.**
