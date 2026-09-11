# Roadmap del proyecto: Editor IA Multiplataforma

## Visión
Crear un editor de código visual multiplataforma (Windows, Linux) que integre:
- **Agente de Ideas** (interacción con el usuario para definir conceptos).
- **Agente de Planificación** (convierte ideas en roadmap técnico).
- **Agente Principal Autónomo** (Project Manager que ejecuta el roadmap).
- **Agentes Secundarios** (plugins instanciables: refactor, testing, docs, seguridad, etc.).
Todo dentro de un **sandbox seguro** y con control humano para aprobar diffs.

## Objetivos principales
- MVP funcional en 3 meses.
- Soporte multiplataforma (Windows, Linux).
- Arquitectura híbrida: plugins + creación dinámica de instancias.
- Interfaz visual moderna con Monaco Editor.
- Flujo: Usuario → Agente Ideas → Agente Planificación → Agente Principal → Agentes Secundarios.
- Seguridad: sandbox, permisos y logs auditable.

## Roadmap por fases

### Fase 0 Preparación (completada)
- Estructura del repo y convenciones.
- Crear `roadmap.md`, `copilot_instructions.md`, `ui_design.md`.
- Configurar TypeScript, ESLint, Prettier, Husky.
- Estado: entregado y validado con tests iniciales.

### Fase 1 MVP Núcleo (en curso)
- Electron + Node.js + Monaco integrado.
- Explorador de archivos limitado a carpeta raíz.
- Editor con pestañas y vista diff.
- Backend local (IPC / WebSocket) y sandbox básico.
- Hito actual: snapshot del proyecto y configuración base del runtime.
- Estado: activo; se implementa la capa de contexto, sandbox y configuración del workspace.

### Fase 2 Agente Ideas y Planificación (completado parcialmente)
- **Agente de Ideas**: interfaz conversacional para que el usuario explore y refine conceptos.
  - Debe **consultar el estado del proyecto** (archivos, roadmap, tareas) para proponer ideas coherentes.
- **Agente de Planificación**: transforma propuestas en un roadmap técnico con subtareas y dependencias.
- Entregable: flujo completo usuario → ideas → planificación (roadmap listo para ejecutar).
- Hito actual: orquestador + gestor LLM + snapshot del proyecto.
- Estado: validado con tests del flujo base.

### Fase 3 Agente Principal y Plugins Básicos (hito actual)
- Implementar agente principal (orquestador) como servicio local.
- Definir API de plugins y cargar plugins desde `plugins/`.
- Plugins iniciales: refactor, testing, docs.
- Mecanismo para instanciar múltiples agentes de un plugin.
- Hito actual: plugin manager y registro central de plugins.
- Estado: implementado y validado con tests.

### Fase 4 Ejecución y Validación (hito actual)
- Flujo completo: agente principal recibe roadmap del agente de planificación y ejecuta.
- Plugins devuelven diffs; usuario aprueba/rechaza.
- Logs y auditoría.
- Hito actual: generación de patches y ejecución con aprobación explícita.
- Estado: implementado y validado con tests.

### Fase 5 Seguridad, Permisos y Hardening (2 semanas)
- Sandbox robusto, permisos granulares por agente.
- Auditoría y pruebas de seguridad.
- Restricción de acceso a rutas fuera del workspace, ejecución no autorizada y límites por plugin.
- Estado: planeado para antes de cerrar la versión beta.

### Fase 6 QA, Testing y Preparación para Pruebas (3 semanas)
- Definir matriz de pruebas: unitarias, integración, E2E, smoke, regresión y seguridad.
- Validar flujo final usuario → ideas → planificación → ejecución → aprobación → diff.
- Crear entorno de pruebas reproducible con datos de ejemplo.
- Definir criterio de aceptación para la versión de pruebas.
- Hito principal: dejar el producto listo para pruebas internas con evidencia de ejecución.
- Estado: planificado y documentado como fase previa a la versión final.

### Fase 7 UX, Extensibilidad y Release Candidate (3 semanas)
- Marketplace/plantillas de plugins.
- Mejoras UX: panel de estado, notificaciones, historial, feedback del agente.
- Validación de estabilidad en Windows y Linux.
- Preparar release candidate con logs, métricas opcionales y checklist de despliegue.
- Estado: pendiente de la validación completa desde QA.

### Fase 8 Documentación, Lanzamiento y Version Final (2 semanas)
- Documentación de arquitectura, API de plugins, guías de contribución y onboarding.
- Checklist de release final, soporte de instalación y escenarios de uso.
- Releases multiplataforma.
- Estado: gated por superación de QA y validación funcional.

## Plan de pruebas antes de la versión final

### Objetivo
Dejar el producto en un estado de pruebas internas y de validación de calidad, con evidencia de que cada flujo principal funciona sin regresiones críticas.

### Alcance
- Flujo principal del IDE: crear tarea, generar ideas, convertir a roadmap, ejecutar tareas, aprobar/rechazar diffs.
- Seguridad del sandbox y permisos por agente.
- Integración con LLM y manejo de errores de conectividad y rate limits.
- Validación del runtime de Electron y del acceso al workspace.

### Casos mínimos obligatorios
1. Smoke test del arranque de la app.
2. Render de la UI principal y carga de proyecto.
3. Generación de un roadmap válido desde un prompt inicial.
4. Ejecución de un plugin con diff aprobado.
5. Rechazo explícito de un diff sin aplicar cambios.
6. Bloqueo de acceso fuera del directorio de trabajo.
7. Recuperación ante fallo LLM o respuesta vacía.
8. Reintento y regresión en tareas con dependencias.

### Criterio de entrada a testing
- Unit tests del núcleo y plugins verdes.
- Smoke tests E2E del flujo principal ejecutados en CI.
- Sin errores críticos de seguridad o sandbox.
- Documentación del proceso de pruebas disponible en el repositorio.

### Criterio de salida a versión final
- 0 bugs críticos.
- 0 regresiones en flujos principales.
- Evidencia de QA con registros y resultados reproducibles.
- Release checklist aprobado.

## Backlog técnico (priorizado)
- Conectores para modelos locales y remotos.
- Vector store para memoria compartida entre agentes.
- Telemetría opt-in y métricas de agentes.
- Marketplace de plugins.

## Riesgos y mitigaciones
- **Agentes con permisos excesivos** → Mitigación: sandbox y permisos por agente.
- **Ideas incoherentes** → Mitigación: Agente de Ideas consulta estado y roadmap antes de proponer.
- **Complejidad de orquestación** → Mitigación: diseño modular, contratos y tests.

## Roadmap de producción y sprints

### Fase A - Estabilización y hardening (Sprint 1 - Sprint 2)
- [x] Estructura base del proyecto y convenciones.
- [x] Arquitectura de agentes, plugins y sandbox básico.
- [x] Flujo Ideas → Planificación → Ejecución con aprobación.
- [x] Pruebas unitarias del runtime y del flujo principal.
- [x] Validación de seguridad básica del sandbox y escapes por symlink.
- [x] Smoke tests del shell de interfaz.
- [ ] Revisión manual del flujo completo con un caso real de tarea.
- [ ] Ajustes de UX y legibilidad de la consola de agentes.
- [ ] Documentación de uso para pruebas internas.
- Estado: casi lista para validación operativa.

### Fase B - QA de release candidate (Sprint 3 - Sprint 4)
- [x] Ejecutar la matriz de pruebas de QA: unitarias, integración, E2E, smoke y seguridad.
- [ ] Validar el flujo completo de un caso real de negocio dentro del IDE.
- [x] Revisar los diffs generados y confirmar que solo se aplican con aprobación.
- [x] Verificar rendimiento básico, arranque y estabilidad del shell.
- [x] Cerrar bugs críticos y de prioridad alta.
- [x] Definir versión release candidate y checklist final.
- [ ] Conectar la RC con modelos reales (OpenAI/Ollama) y validar fallback.
- Estado: RC configurada para pruebas internas con conectividad de modelos por entorno.

### Fase B.1 - Conectividad de modelos para pruebas de producción (Sprint 3.1)
- [x] Añadir configuración por entorno para proveedores LLM.
- [x] Habilitar llamadas reales a OpenAI compatible y Ollama cuando hay credenciales/configuración.
- [x] Mantener fallback local seguro si el proveedor real falla.
- [ ] Ejecutar pruebas de smoke con un modelo real en staging.
- [ ] Validar latencia, errores de red y límites de tokens en producción simulada.
- Estado: implementación realizada; pendiente validación con entorno real.

### Fase C - Empaque y despliegue (Sprint 5)
- [ ] Preparar configuración de instalación para Linux y Windows.
- [ ] Generar artefactos o instaladores para pruebas de entorno real.
- [ ] Habilitar logs, auditoría y revisión de ejecución de agentes.
- [ ] Preparar script de rollout para entorno de staging.
- Estado: pendiente antes de beta pública.

### Fase D - Beta y validación productiva (Sprint 6)
- [ ] Ejecutar pruebas beta con usuarios internos.
- [ ] Recoger feedback de UX, estabilidad y flujo de trabajo.
- [ ] Ajustar permisos, detalles del sandbox y visuales del editor.
- [ ] Definir criterios de salida a producción.
- Estado: pendiente tras cierre de QA y release candidate.

### Fase E - Producción GA (Sprint 7 - Sprint 8)
- [ ] Desplegar versión estable en entorno productivo.
- [ ] Activar monitorización, manejo de incidentes y dashboard básico.
- [ ] Preparar documentación de onboarding, soporte y troubleshooting.
- [ ] Publicar release notes y versión final.
- Estado: depende de la validación beta y el cierre de riesgos críticos.

## Criterio de entrada a producción
- Core funcional estable y validado.
- Shell UI operativa con aprobación/rechazo y editor base funcional.
- Sandbox con restricciones verificadas.
- Suite de pruebas de unitarios + E2E ejecutadas con éxito.
- Release candidate con evidencia de QA.

## Criterio de salida a producción
- 0 bugs críticos.
- 0 regresiones en flujos principales.
- Validación del flujo completo por usuario real.
- Release notes aprobados y artefactos de instalación listos.
- Soporte y monitoreo definidos para producción.

## Estado actual del roadmap
El proyecto ya consolidó la base funcional y la organización técnica; el siguiente bloque clave es la transición desde prototipo validado hacia release candidate y despliegue real. La roadmap previa cubría la base técnica; esta sección añade la capa de producción con sprints y gate de salida.

