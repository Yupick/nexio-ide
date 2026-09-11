# Plan: editor funcional como programa de escritorio

## Objetivo
Hacer que Nexio IDE se ejecute como una aplicación de escritorio funcional, con una interfaz moderna y consistente con el diseño definido en [ui_design.md](ui_design.md), y que permita abrir un workspace, editar archivos, revisar el flujo de agentes y ejecutar aprobaciones de diff sin depender solo del prototipo estático.

## Principios de diseño a respetar
- Layout de 3 columnas: explorador, editor y panel de control/IA.
- Priorizar claridad, flujo de trabajo y amplitud visual.
- Minimalismo funcional con contraste accesible y feedback inmediato.
- Paleta de referencia: azul primario #0B5FFF, neutros #111827 y #F8FAFC, texto claro sobre fondos oscuros.
- Editor central con visual tipo Monaco, pestañas y panel de errores.
- Consola IA con dos modos: Ideas y Ejecución.
- Modal de aprobación con diff legible y botones Approve / Request Changes / Dismiss.

## Alcance del plan
### 1. Arranque real de la app en desktop
- Ejecutar la aplicación con Electron como ventana principal.
- Cargar la UI desde [src/ui/index.html](src/ui/index.html) o un entorno React si se integra más adelante.
- Configurar ventana, tamaño, menús mínimos y estado inicial del workspace.
- Validar que el proceso arranque sin depender de un servidor externo.

### 2. Workspace y explorador funcional
- Resolver la carpeta raíz del proyecto desde una configuración local.
- Mostrar estructura de archivos en la barra lateral.
- Permitir abrir archivos y listarlos sin salir del sandbox.
- Limitar navegación a la carpeta permitida por configuración.

### 3. Editor central operativo
- Integrar Monaco Editor como editor principal.
- Soportar pestañas por archivo abierto.
- Guardar cambios en disco con flujo simple y seguro.
- Mostrar errores y estados de archivo.
- Dar soporte básico a tabs, selección y edición de texto.

### 4. Panel IA y flujo de trabajo
- Panel izquierdo o derecho con:
  - Ideas: chat del agente de ideas
  - Ejecución: logs del agente principal y plugin
- Mostrar roadmap actual y estado de tareas.
- Mostrar cola de tareas, dependencias y prioridad.
- Activar diffs y flujo de aprobación con feedback visual.

### 5. Ejecución real con aprobación humana
- Asegurar que los plugins entreguen diffs formateados y legibles.
- Crear flujo de aprobación con estado visible: pending, approved, rejected.
- Aplicar cambios solo tras aprobación explícita.
- Mantener auditoría de acciones con mensajes de estado.

### 6. Hardening mínimo para desktop
- Validar rutas y permisos con sandbox.
- Evitar accesos fuera del workspace.
- Manejar errores de carga de ventana y de archivos.
- Registrar errores con mensajes útiles.

## Fases de implementación

### Fase A - Fundamentos del editor desktop
1. Corregir arranque de Electron y layout principal.
2. Definir shell de UI con columnas y tokens visuales.
3. Cargar una vista de trabajo real del proyecto.
4. Validar render inicial sobre Linux.

### Fase B - Editor + workspace
1. Integrar Monaco.
2. Registrar archivos del workspace.
3. Abrir, editar y guardar archivos.
4. Añadir tabs y estado activo.

### Fase C - IA + roadmap + aprobación
1. Conectar el panel IA con el runtime de agentes.
2. Mostrar roadmap y tareas.
3. Generar diffs con revisión visual.
4. Aprobar/rechazar cambios con modal de confirmación.

### Fase D - Robustez y QA funcional
1. Validar inicio, apertura de archivos y edición.
2. Verificar sandbox y bloqueo de rutas no permitidas.
3. Probar flujo completo usuario → ideas → planificación → ejecución → aprobación.
4. Corregir defectos y preparar evidencia de validación.

## Criterios de aceptación
- La aplicación se ejecuta como escritorio y se abre una ventana funcional sin errores.
- El usuario puede navegar el workspace desde la barra lateral.
- El editor abre un archivo, lo edita y guarda cambios.
- La consola IA presenta estado de agentes y roadmap.
- Los diffs se visualizan y pueden aprobarse o rechazarse.
- Las rutas fuera del sandbox quedan bloqueadas.
- La UI cumple con la estructura y estilo del diseño base.

## Dependencias
- [src/electron/main.ts](src/electron/main.ts)
- [src/ui/index.html](src/ui/index.html)
- [src/backend/sandbox.ts](src/backend/sandbox.ts)
- [src/backend/workflow-runtime.ts](src/backend/workflow-runtime.ts)
- [src/backend/orchestrator.ts](src/backend/orchestrator.ts)
- [src/backend/plugin-manager.ts](src/backend/plugin-manager.ts)
- [ui_design.md](ui_design.md)

## Hitos previstos
- Hito 1: ventana de escritorio operativa
- Hito 2: editor y explorador funcionando
- Hito 3: flujo IA + roadmap + diff
- Hito 4: validación funcional y hardening

## Estado
Planificado para la rama feature/editor-desktop-functional.
