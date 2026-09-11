# Plan de pruebas antes de la versión final

## Objetivo
Preparar la aplicación para una fase de pruebas internas y validación de calidad antes de la versión final. El objetivo es verificar que el flujo principal del IDE funciona de forma consistente, segura y reproducible.

## Alcance

### Funcionalidad principal
- Arranque del editor y carga del proyecto.
- Generación de ideas a partir del contexto del repositorio.
- Planificación técnica en formato roadmap.
- Delegación al agente principal y ejecución con plugins.
- Aprobación o rechazo de diffs por parte del usuario.
- Persistencia del historial y observabilidad básica del flujo.

### Seguridad
- Restricción de acceso al workspace.
- Bloqueo de intentos de escritura fuera del directorio permitido.
- Garantía de que los plugins solo operen dentro del sandbox.
- Validación de permisos por tipo de agente.

### Calidad de software
- Tests unitarios del núcleo.
- Tests de integración del flujo de agente.
- Smoke tests E2E del inicio y tareas principales.
- Colección de regresiones para cambios críticos.

## Matriz de pruebas

### 1. Smoke tests
- Inicio de la app.
- Carga de proyecto desde un workspace válido.
- Render de la vista principal.
- Estado inicial del flujo sin errores críticos.

### 2. Tests unitarios
- Generación de snapshots del proyecto.
- Validación del sandbox.
- Orquestador de ideas y planificación.
- Gestión de ejecución con aprobación y rechazo.
- Registro y carga de plugins.

### 3. Tests de integración
- Flujo completo: usuario → ideas → roadmap → ejecución.
- Diferentes tipos de plugin (refactor, docs, test).
- Manejo de errores de acceso o de contexto.

### 4. Tests E2E
- Crear una tarea simple.
- Capturar y validar el estado del proyecto.
- Ejecutar el flujo principal.
- Aceptar un diff y confirmar resultado.
- Rechazar un diff y asegurar que no se modifica nada.

### 5. Pruebas de seguridad
- Escritura fuera del workspace.
- Acceso a rutas temporales o del sistema.
- Acceso no autorizado por plugin no permitido.
- Logs de auditoría y eventos de ejecución.

## Criterios de aceptación

### Para pruebas internas
- El arranque de la app es estable.
- El flujo principal funciona sin errores críticos.
- Los diffs son visibles antes de la aprobación.
- El sandbox bloquea accesos no autorizados.
- Los tests del núcleo y del flujo principal pasan de forma reproducible.

### Para release candidate
- 0 errores críticos.
- 0 regresiones en los flujos principales.
- Evidencia de pruebas en CI y documentación de resultados.
- Release checklist completado.

## Fase recomendada de ejecución
1. Validar núcleo y plugins.
2. Ejecutar pruebas de smoke.
3. Ejecutar pruebas E2E del flujo principal.
4. Cerrar bugs críticos.
5. Repetir validación antes del release candidate.

## Entregables esperados
- Suite de unit tests en verde.
- Suite E2E con flujos mínimos ejecutados.
- Evidencia de sandbox seguro.
- Checklist de release candidate.
- Registro de defects y estado de resolución.
