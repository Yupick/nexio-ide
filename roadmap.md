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

### Fase 1 MVP Núcleo (completado)
- Electron + Node.js + Monaco integrado.
- Explorador de archivos limitado a carpeta raíz.
- Editor con pestañas y vista diff.
- Backend local (IPC / WebSocket) y sandbox básico.
- Hito actual: snapshot del proyecto y configuración base del runtime.
- Estado: completado; se consolidó la capa de contexto, sandbox, workspace, tabs, menú y launcher del editor.

### Fase 2 Agente Ideas y Planificación (completado parcialmente)
- **Agente de Ideas**: interfaz conversacional para que el usuario explore y refine conceptos.
  - Debe **consultar el estado del proyecto** (archivos, roadmap, tareas) para proponer ideas coherentes.
- **Agente de Planificación**: transforma propuestas en un roadmap técnico con subtareas y dependencias.
- Entregable: flujo completo usuario → ideas → planificación (roadmap listo para ejecutar).
- Hito actual: orquestador + gestor LLM + snapshot del proyecto.
- Estado: validado con tests del flujo base.

### Fase 3 Agente Principal y Plugins Básicos (completado)
- Implementar agente principal (orquestador) como servicio local.
- Definir API de plugins y cargar plugins desde `plugins/`.
- Plugins iniciales: refactor, testing, docs.
- Mecanismo para instanciar múltiples agentes de un plugin.
- Hito actual: plugin manager y registro central de plugins.
- Hito adicional: configuración del provider seleccionado en el runtime y conectores reales para Gemini/Grok, con fallback local y registro de plugins disponibles por el orquestador.
- Estado: implementado y validado con tests.

### Fase 4 Ejecución y Validación (completado)
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
- [x] Revisión manual del flujo completo con un caso real de tarea.
- [x] Ajustes de UX y legibilidad de la consola de agentes.
- [x] Documentación de uso para pruebas internas.
- Estado: lista para validación operativa y cierre de ciclo GitFlow.

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

### Fase B.2 - Consolidación de agentes y persistencia de configuración (Sprint 3.2)
- [x] Unificar la configuración de agentes para eliminar la duplicidad entre "Principal" y "Orquestador" y dejar una sola opción: "Principal / Orquestador".
- [x] Definir la URL por defecto de Ollama como `http://chat.nightslayer.com.ar:11434` y mantener el puerto configurable por entorno.
- [x] Establecer un agente por defecto para la ejecución del flujo cuando no hay una configuración activa o el usuario no ha guardado ninguna preset.
- [x] Centralizar la persistencia de la configuración del editor y la configuración de plugins en almacenamiento persistente del sistema (localStorage para la UI o archivo JSON para runtime de Electron).
- [x] Garantizar que la configuración cargada se reutilice automáticamente en cada arranque y que los cambios se guarden de forma consistente.
- [x] Añadir validación de defaults para no romper la carga del workspace cuando no hay proveedor/modelo guardado.
- [x] Registrar y revisar estados de agente (online/offline/en uso) con la configuración persistida aplicada al runtime.
- Estado: completado; la base del editor ya arranca con la configuración persistida, el agente principal por defecto y la URL global consolidada.

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

## Plan de implementación actualizado (2026-09-12)

### Objetivo
Cerrar la diferencia entre la base funcional validada y la versión lista para pruebas reales de negocio, con flujo end-to-end, aprobación segura, persistencia y validación con Ollama real.

### Estado actual verificado
- [x] Shell de Electron con workspace, tabs, editor y sidebar.
- [x] Agentes de ideas, planificación y principal con orquestación básica.
- [x] Registro de plugins y capacidades por plugin.
- [x] Configuración persistida del runtime y del editor.
- [x] URL por defecto de Ollama consolidada en `http://chat.nightslayer.com.ar:11434`.
- [x] Validación del health check de Ollama con la API real.
- [x] Diff generado y aprobación/rechazo de review flow.
- [x] Persistencia local del historial de decisiones en UI.
- [ ] Persistencia del historial en backend y export/import auditable.
- [ ] Ejecución real de LLM sobre tareas del workflow con validación de modelo + fallback.
- [ ] Aplicación real de cambios aprobados sobre archivos del workspace con guardas de sandbox.
- [ ] Validación end-to-end de un caso real de negocio.
- [ ] Empaque, despliegue y release candidate final.

### Bloques a implementar

#### Bloque 1: Ejecutar flujo real con LLM y contexto completo
1. Enlazar el agente principal con un flujo real de prompt + modelo de Ollama.
2. Incluir metadata del agente, taskId y hash del snapshot en cada request.
3. Validar fallback por provider y manejo de errores de red/y modelo.
4. Asegurar que cada respuesta usable termine con un estado `ok` + diff / patch estructurado.

#### Bloque 2: Aplicación segura del patch aprobado
1. Definir la operación de apply patch solo tras aprobación explícita.
2. Validar que el archivo objetivo esté dentro del workspace permitido.
3. Rechazar operaciones fuera del root, y registrar la decisión.
4. Registrar el diff aplicado y la respuesta final del usuario.

#### Bloque 3: Persistencia del historial real
1. Guardar historial de tareas, decisiones y diffs en un store persistente.
2. Incluir timestamps y resultados de aprobación/rechazo.
3. Exponer el historial a la UI y permitir consultarlo en arranque.
4. Añadir limpieza o rotación de historial para evitar crecimiento ilimitado.

#### Bloque 4: Validación end-to-end y casos reales
1. Ejecutar un caso real de tarea dentro del workspace del proyecto.
2. Validar que Ideas → Planificación → Principal → Plugin → Diff → Aprobación → Aplicación funciona con un escenario concreto.
3. Verificar que la app no rompe el concepto de sandbox ni la estructura del editor.
4. Documentar el resultado en la checklist de QA.

#### Bloque 5: Release candidate y empaquetado
1. Preparar scripts de instalación para Linux y Windows.
2. Definir logs de auditoría y ventanilla de error.
3. Preparar release notes y checklist final.
4. Confirmar que la app trata de forma segura los fallos de provider LLM.

### Criterios de salida
- 0 regresiones en el flujo principal.
- Validación de un caso real de negocio con Ollama activo.
- Historial persistido y consultable.
- Aprobación/rechazo del diff con estado auditable.
- Release candidate con evidencia documentada.

### Orden recomendado
1. Ejecutar flujo real con Ollama y metadata.
2. Aplicación segura + validación del patch aprobado.
3. Persistencia del historial de trabajo.
4. Validación E2E con caso real.
5. Packing + QA final.

