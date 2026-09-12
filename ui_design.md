# Diseño de interfaces gráficas
Estilo: **moderno, actual y sencillo**. Priorizar claridad, flujo de trabajo y una sensación de editor profesional sin saturar la pantalla.

## Principios
- Minimalismo funcional.
- Consistencia y tokens de diseño.
- Accesibilidad y feedback inmediato.
- El agente debe adaptarse al contexto del proyecto; no debe forzar un lenguaje manual por parte del usuario.

## Direcciones visuales actuales
- **Tema oscuro con profundidad**: fondos oscuros con degradados suaves y paneles con bordes sutiles.
- **Acento principal**: azul brillante para acciones prioritarias, selección activa y estados relevantes.
- **Jerarquía clara**: explorador, editor central y panel lateral con separación visual definida.
- **Microinteracciones**: hover, focus, transiciones rápidas y botones con respuesta visual inmediata.

## Componentes clave
- **Barra lateral (Explorador)**: árbol de archivos del workspace; acciones rápidas y navegación por carpetas.
- **Editor central**: área de edición con pestañas, estado activo y contorno enfocado.
- **Panel inferior / consola IA**:
  - **Modo Ideas**: borradores, propuestas conceptuales y consultas rápidas.
  - **Modo Ejecución**: mensajes del agente principal, diff y acciones de validación.
- **Panel derecho (Roadmap / revisión)**:
  - tareas del flujo, contexto del proyecto y aprobación del cambio propuesto.
- **Modal de configuración**: ajustes del agente por perfil, con proveedor, base URL, API key y modelo.
- **Panel de estado**: indicadores rápidos de actividad y mensajes del sistema.

## Flujo de interacción (UI)
1. El usuario abre el workspace desde el menú Archivo.
2. El editor muestra archivos en pestañas y el explorador refleja la estructura del proyecto.
3. El agente usa el contenido real del workspace para generar ideas, plan y ejecución.
4. El usuario revisa el diff y decide aprobar o solicitar cambios.
5. La configuración del agente se ajusta por perfil, no por lenguaje forzado del usuario.

## Arquitectura de agentes y plugins

### 1) Agente de Ideas
- Es el punto de contacto con el usuario.
- Trabaja en modo lectura y propone opciones, sugerencias, estructura y enfoque inicial.
- No debe escribir directamente en el workspace; su trabajo es preparar el contexto y plantear soluciones.
- Su objetivo es convertir el prompt del usuario y el estado del proyecto en una propuesta clara.

### 2) Agente de Planificación
- Recibe la propuesta del agente de ideas.
- Genera el plan de trabajo, el roadmap y las tareas ordenadas por prioridad y dependencias.
- Se encarga de convertir conceptos en ejecución concreta y validable.
- Define la secuencia de trabajo para el agente principal/orquestador.

### 3) Agente Principal / Orquestador
- Es el ejecutor de alto nivel.
- Recibe el roadmap y el contexto del proyecto.
- Consulta qué plugins están activos y qué capacidades tienen cada uno.
- Asigna trabajo según especialidad: documentación, refactor, validación, sintaxis, testing, etc.
- Puede invocar una o varias instancias de plugins especializados según la tarea.

### 4) Plugins especializados
Los plugins no son “acciones sueltas”; son capacidades registradas del sistema.
Cada uno debe declarar sus especialidades, por ejemplo:
- Docs Plugin → documentación, README, guías
- Refactor Plugin → refactor, limpieza, estructura de código
- Syntax Plugin → parseo, validación sintáctica, compilación
- Testing Plugin → QA, validación, pruebas, verificación

Cuando se cargan, el agente principal los registra y los analiza para saber qué tareas puede resolver cada uno.

El flujo recomendado es:
1. Usuario habla con el Agente de Ideas.
2. Agente de Ideas propone una dirección.
3. Agente de Planificación genera el roadmap.
4. Agente Principal activa los plugins relevantes.
5. El plugin especializado ejecuta la parte que le corresponde.
6. El orquestador consolida la salida y deja la revisión final para aprobación.

## Configuración de agentes y persistencia
- La configuración por agente se guarda en la clave `nexio-agent-config` dentro de `localStorage` del navegador/renderer.
- El payload persistido contiene:
  - `activeAgent`
  - `agentProfiles`
- Cada perfil incluye proveedor, modelo, URL base, API key, temperatura y el agente asociado.
- La selección de lenguaje ya no forma parte de la interfaz de configuración porque el runtime debe inferirlo a partir del contexto del archivo o del proyecto.
- Cuando se guarda, la aplicación también refleja la configuración activa en el runtime principal de Electron para que el backend use el agente configurado en la sesión actual.

## Microinteracciones y accesibilidad
- Transiciones 120–180ms.
- Navegación por teclado y foco visible en controles.
- Contraste con lectura clara en modos oscuro.
- Estados activos y hover con consistencia visual.

## Paleta y tipografía
- **Primario**: Azul `#5EA2FF` / `#2F6EF6`.
- **Fondo oscuro**: `#07111F`, `#0F172A`, `#020817`.
- **Texto**: `#E5EEFB` y `#A5B7D6`.
- **Monoespaciada**: JetBrains Mono o Fira Code.

