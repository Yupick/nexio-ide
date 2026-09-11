# Plan de agentes IA y flujo con archivos del workspace

## Objetivo
Definir de forma concreta cómo los agentes del IDE interactúan con el workspace, cómo leen contexto del proyecto y cómo el Agente Principal ejecuta tareas aprobadas por el usuario.

## Principios del diseño
- El Agente de Ideas es de solo lectura.
- El Agente de Planificación transforma ideas en tareas estructuradas.
- El Agente Principal orquesta la ejecución usando plugins.
- El usuario debe aprobar cada diff antes de aplicarse.
- El workspace se accede a través de un sandbox seguro y rutas restringidas.

## Roles y responsabilidades

### 1) Agente de Ideas
Responsabilidades:
- Analizar el estado del proyecto.
- Consultar snapshot del workspace, roadmap y tareas actuales.
- Proponer mejoras, refactors, diagnósticos o tareas concretas.
- No escribir directamente sobre el repositorio.

Entradas:
- snapshot del proyecto
- roadmap vigente
- historial de tareas
- estado de plugins activos

Salidas:
- propuestas de alto nivel
- prompts mejorados para planificación
- sugerencias con criterio técnico y contexto del proyecto

### 2) Agente de Planificación
Responsabilidades:
- Recibir propuestas del Agente de Ideas.
- Convertirlas en tareas ordenadas, priorizadas y dependientes.
- Generar un roadmap técnico ejecutable.
- Definir entregables y criterios de validación.

Entradas:
- propuesta del Agente de Ideas
- contexto del proyecto y tareas previas
- restricciones del sandbox

Salidas:
- roadmap estructurado
- lista de subtareas con prioridad y dependencias
- payload preparado para el Agente Principal

### 3) Agente Principal
Responsabilidades:
- Recibir la tarea planificada.
- Resolver qué plugins deben ejecutarse.
- Coordinar la ejecución en orden de dependencias.
- Entregar diffs para aprobación humana.

Entradas:
- roadmap técnico
- contexto del proyecto
- registro de plugins disponibles

Salidas:
- resultados ejecutados por plugin
- diff unificado
- estado final de la tarea

### 4) Plugins secundarios
Responsabilidades:
- Ejecutar tareas concretas: documentación, refactor, testing, limpieza, seguridad.
- Devolver diffs y resultados operativos.
- Trabajar con el contexto del proyecto, no con permisos globales.

Casos iniciales:
- refactor-plugin
- testing-plugin
- docs-plugin
- syntax-plugin
- security-plugin

## Flujo de interacción con archivos del workspace

### A. Lectura del contexto
1. El shell Electron solicita el workspace actual.
2. El backend genera un snapshot del proyecto.
3. El Agente de Ideas consume el snapshot de solo lectura.
4. Se filtrán rutas fuera del workspace y accesos prohibidos.

### B. Generación de propuestas
1. El usuario describe una necesidad o problema.
2. El Agente de Ideas responde con propuestas basadas en:
   - archivos relevantes
   - roadmap
   - estado de tareas
   - arquitectura del proyecto

### C. Planificación técnica
1. El Agente de Planificación transforma cada idea en tareas con:
   - id
   - título
   - descripción
   - prioridad
   - dependencias
2. Genera un roadmap listo para ejecución.

### D. Ejecución aprobada
1. El Agente Principal recibe el roadmap.
2. Ejecuta plugins en orden lógico.
3. Cada plugin genera un diff.
4. La UI muestra el diff al usuario.
5. El usuario aprueba o rechaza.
6. Si se aprueba, el cambio se aplica al workspace.
7. Si se rechaza, se descarta sin alterar archivos.

## Reglas de seguridad y permisos
- Los agentes de ideas solo leen.
- Los plugins no pueden escribir fuera del workspace raíz.
- Todo cambio debe mostrarse como diff antes de aplicar.
- Solo el Agente Principal puede ejecutar cambios reales sobre archivos.
- El sandbox debe bloquear rutas fuera del proyecto, symlinks y escrituras arbitrarias.

## Implementación por fases

### Fase 1: contratos base
- Definir interfaces de AgentTask, AgentContext y AgentExecutionResult.
- Definir Roadmap y ProjectSnapshot.
- Crear payloads estándar para todos los agentes.

### Fase 2: snapshot del workspace
- Recorrer árbol del proyecto y listar archivos relevantes.
- Exponer snapshot legible para lectura por los agentes.
- Ignorar archivos sensibles o no relevantes: .git, node_modules, dist generados, etc.

### Fase 3: ideas agent
- Implementar interfaz conversacional.
- Añadir consultas al snapshot del proyecto.
- Generar recomendaciones con contexto y lectura limitada.

### Fase 4: planning agent
- Generar roadmap con prioridad y dependencias.
- Enlazar tareas con el feedback del usuario.
- Preparar payloads para la ejecución.

### Fase 5: principal agent y plugins
- Registrar plugins.
- Ejecutar tareas usando la ruta de API estándar.
- Devolver resultados en formato consistente.

### Fase 6: aprobación y aplicación
- Mostrar diff en la UI.
- Solicitar aprobación humana.
- Aplicar y registrar cambios solo cuando se confirme.

### Fase 7: validación y QA
- Ejecutar tests unitarios del flujo.
- Validar casos de acceso restringido.
- Validar recuperación ante errores LLM o fallos del plugin.

## Criterio de éxito
El flujo queda validado cuando un usuario puede:
1. abrir un workspace,
2. pedir ideas o tareas al Agente de Ideas,
3. convertirlas en roadmap con el Agente de Planificación,
4. ejecutar tareas con el Agente Principal,
5. revisar diffs y aprobarlos,
6. dejar el proyecto actualizado sin aplicar cambios no autorizados.

## Entregables esperados
- Agente de Ideas funcional
- Agente de Planificación funcional
- Agente Principal funcional
- API de plugins documentada
- flujo de aprobación humano
- sandbox seguro para workspace
- tests de integración del ciclo completo
