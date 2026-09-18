# QA Checklist para release candidate

## Objetivo
Validar que el IDE ofrece una experiencia de uso estable, comprensible y segura antes de liberar una versión candidata.

## Alcance funcional
- [x] Arranque del shell principal
- [x] Vista del workspace y panel de exploración
- [x] Vista del editor en shell
- [x] Panel de agentes y resumen visual del workflow
- [x] Panel de roadmap y ejecución
- [x] Preview de diff
- [x] Acciones de aprobación y rechazo
- [x] Estado visual del approval flow
- [x] Chat de ideas con sesiones y selección de modelo
- [x] Cancelación del workflow mediante IPC
- [x] Cambios multiarchivo con aplicación atómica

## Seguridad y sandbox
- [x] Bloqueo de rutas fuera del workspace
- [x] Validación de traversal y symlink escapes
- [x] Restricción de accesos no autorizados
- [x] Revisión manual de permisos por agente
- [x] Plugins desactivados no se cargan
- [x] Autoaprobación restringida y auditada por plugin
- [x] Conflictos de contenido base bloquean la aplicación

## Calidad y pruebas
- [x] Unit tests del core
- [x] Tests del workflow operativo
- [x] Smoke UI tests
- [ ] Flujo completo de negocio automatizado contra un workspace temporal de Electron
- [x] Pruebas de regresión adicionales sobre plugins
- [x] Suite completa: 8 suites y 57 tests
- [x] Smoke E2E: 3 escenarios
- [x] Build TypeScript sin errores

## Release candidate gate
- [x] 0 bugs críticos
- [x] 0 regressions en flujos principales
- [x] Evidencia de pruebas disponible
- [x] Documentación de uso y onboarding lista
- [x] Checklist de aprobación del equipo

## QA real y validación operativa
- [x] Validación del flujo real del IDE con snapshot del proyecto actual
- [x] Check de ejecución del runtime con provider real y metadata de auditoría
- [x] Validación de aprobación/rechazo del diff en flujo real
- [x] Revisión del sandbox y acceso fuera del workspace

## Empaque y beta
- [x] Script de arranque del desktop para Linux con entorno gráfico y guardas de validación
- [x] Generación de artefacto de packaging reproducible para entorno beta
- [x] Verificación del proyecto compilando y ejecutando la validación del workflow real
- [x] Checklist de preparación para beta interna y revisión de calidad del producto

## Observaciones
La base funcional y los controles de seguridad quedan validados para el release 1.1.0. La automatización de un caso completo de negocio dentro de una instancia Electron real y la migración a Monaco permanecen fuera de este cierre y deben tratarse como trabajo posterior, no como evidencia de esta release.
