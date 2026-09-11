# Diseño de interfaces gráficas
Estilo: **moderno, actual y sencillo**. Priorizar claridad y flujo de trabajo.

## Principios
- Minimalismo funcional.
- Consistencia y tokens de diseño.
- Accesibilidad y feedback inmediato.

## Componentes clave
- **Barra lateral (Explorador)**: árbol de archivos del sandbox; acciones rápidas.
- **Editor central**: Monaco Editor con pestañas; errores en línea.
- **Panel inferior (Consola IA)**:
  - **Modo Ideas**: chat con el *Agente de Ideas* (borradores, propuestas conceptuales).
  - **Modo Ejecución**: mensajes del *Agente Principal* y acciones (ver diff, aprobar).
- **Panel derecho (Inspector / Roadmap)**:
  - Vista del roadmap actual (tareas, dependencias).
  - Botones: “Enviar a planificación”, “Pausar agente principal”, “Forzar instancia de plugin”.
- **Modal de aprobación**: diff unificado con resaltado por línea; botones: Approve, Request Changes, Dismiss.
- **Panel de estado**: indicadores de agentes activos, cola de tareas y prioridad.

## Flujo de interacción (UI)
1. Usuario abre **Modo Ideas** y conversa con el Agente de Ideas.
2. Agente de Ideas propone opciones; usuario selecciona y envía a **Agente de Planificación**.
3. Agente de Planificación genera roadmap; se muestra en el Inspector.
4. Usuario confirma y el roadmap se envía al Agente Principal para ejecución.
5. Cambios propuestos aparecen como diffs en la consola IA para aprobación.

## Microinteracciones y accesibilidad
- Transiciones 100–200ms.
- Navegación por teclado y roles ARIA.
- Contraste WCAG AA.

## Paleta y tipografía
- **Primario**: Azul `#0B5FFF`.
- **Neutros**: `#111827`, `#6B7280`, fondo `#F8FAFC`.
- **Monoespaciada**: Fira Code o JetBrains Mono.

