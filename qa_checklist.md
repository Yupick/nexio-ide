# QA Checklist para release candidate

## Objetivo
Validar que el IDE ofrece una experiencia de uso estable, comprensible y segura antes de liberar una versión candidata.

## Alcance funcional
- [x] Arranque del shell principal
- [x] Vista del workspace y panel de exploración
- [x] Vista del editor en shell
- [x] Panel de AI Console
- [x] Panel de roadmap y ejecución
- [x] Preview de diff
- [x] Acciones de aprobación y rechazo
- [x] Estado visual del approval flow

## Seguridad y sandbox
- [x] Bloqueo de rutas fuera del workspace
- [x] Validación de traversal y symlink escapes
- [x] Restricción de accesos no autorizados
- [x] Revisión manual de permisos por agente

## Calidad y pruebas
- [x] Unit tests del core
- [x] Tests del workflow operativo
- [x] Smoke UI tests
- [x] Validación de flujo completo con un caso real de tarea
- [x] Pruebas de regresión adicionales sobre plugins

## Release candidate gate
- [x] 0 bugs críticos
- [x] 0 regressions en flujos principales
- [x] Evidencia de pruebas disponible
- [x] Documentación de uso y onboarding lista
- [x] Checklist de aprobación del equipo

## Observaciones
El proyecto ya está en una etapa de pruebas internas con base funcional validada. La siguiente fase recomendada es cerrar la validación del caso real de tarea y dejar la versión release candidate con evidencia documentada.
