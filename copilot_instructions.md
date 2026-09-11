# Instrucciones para GitHub Copilot y buenas prácticas

## Objetivo
Proveer instrucciones claras para generar código coherente, mantenible y alineado con el roadmap, incluyendo el **Agente de Ideas** y el **Agente de Planificación**.

## Stack y convenciones
- **Lenguaje**: TypeScript (strict).
- **Frontend**: Electron + React (opcional) + Monaco Editor.
- **Backend local**: Node.js (IPC / WebSocket).
- **Testing**: Jest + Playwright.
- **Linting**: ESLint + Prettier.
- **Hooks**: Husky.

## Arquitectura de agentes (resumen)
- **Agente de Ideas**: interfaz conversacional; **acceso de solo lectura** al estado del proyecto y roadmap; genera propuestas conceptuales y prompts técnicos.
- **Agente de Planificación**: transforma propuestas en roadmap técnico (tareas, dependencias, prioridades).
- **Agente Principal**: orquestador que recibe roadmap y delega a plugins.
- **Agentes Secundarios (plugins)**: implementan `IAgentPlugin` y devuelven diffs.

## Interacción y permisos
- El **Agente de Ideas** puede leer: roadmap, lista de archivos, estado de tareas, agentes activos.
- No puede escribir directamente en el repositorio; sus propuestas pasan por el Agente de Planificación y luego por el Agente Principal.
- Todas las modificaciones propuestas por agentes deben entregarse como **diffs** y requerir aprobación humana antes de aplicar.

## Interfaz de plugin (IAgentPlugin)
- Métodos mínimos:
  - `init(context: PluginContext): Promise<void>`
  - `handleTask(task: AgentTask): Promise<AgentResult>` (devuelve diff en formato unificado)
  - `shutdown(): Promise<void>`
- `PluginContext` incluye: `sandboxApi`, `logger`, `config`, `readOnlyProjectSnapshot` (para agentes de ideas).

## GitFlow
- `main`, `develop`, `feature/*`, `release/*`, `hotfix/*`.
- PRs con checklist, tests y revisión.

## Reglas para Copilot
- Generar tests junto con la funcionalidad.
- Priorizar seguridad del sandbox y generación de diffs.
- Documentar con TSDoc y comentarios arquitectónicos.
- Incluir ejemplos de uso en `examples/`.

## Requisitos de entrega
- Implementar Agente de Ideas y Agente de Planificación con interfaces claras.
- Agente de Ideas: endpoint UI (chat) y adaptador que consulta snapshot del proyecto.
- Agente de Planificación: genera roadmap estructurado (JSON) listo para el Agente Principal.

## Integración LLM
- Implementar `/src/backend/llm` con adaptadores para OpenAI, Ollama y modelos locales.
- Crear `prompt manager` con plantillas versionadas.
- Agente de Ideas usa `readOnlyProjectSnapshot` (solo lectura) y no escribe directamente.
- Todas las llamadas LLM deben incluir metadata: agente, taskId, snapshotHash.
- Implementar fallback y rate-limit handling.
- Añadir tests que simulen respuestas LLM (mocks) y validen truncado de contexto.



