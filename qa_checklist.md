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
La base funcional queda validada para una etapa beta interna con evidencia real del flujo de trabajo, empaquetado reproducible y control de seguridad del workspace. El siguiente cierre recomendado es la finalización del release GA con monitoreo y observabilidad operativa.
