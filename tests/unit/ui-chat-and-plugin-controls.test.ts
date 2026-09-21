import fs from 'node:fs';
import path from 'node:path';

describe('UI agent and plugin controls', () => {
  it('includes the new idea chat controls and plugin approval settings', () => {
    const htmlPath = path.resolve(__dirname, '../../src/ui/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('Nueva sesión');
    expect(html).toContain('Modelo de ideas');
    expect(html).toContain('Autoaprobar cambios');
    expect(html).toContain('Configurar plugins');
    expect(html).toContain('Cancelar workflow');
  });

  it('removes the static roadmap block from the principal panel', () => {
    const htmlPath = path.resolve(__dirname, '../../src/ui/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).not.toContain('Inicio del workspace');
    expect(html).not.toContain('Explorador de archivos');
    expect(html).not.toContain('Editor + flujo de guardado');
    expect(html).not.toContain('Revisión de diff con aprobación');
  });

  it('exposes the resizable panel layout contract', () => {
    const htmlPath = path.resolve(__dirname, '../../src/ui/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toMatch(/--sidebar-width:\s*270px/);
    expect(html).toMatch(/--right-panel-width:\s*340px/);
    expect(html).toMatch(/grid-template-columns:\s*var\(--sidebar-width\)\s+minmax\(320px,\s*1fr\)\s+var\(--right-panel-width\)/);
    expect(html).toContain('data-panel-resize="sidebar"');
    expect(html).toContain('data-panel-resize="right-panel"');
    expect(html).toContain('nexio-panel-layout');
    expect(html).toContain('pointerdown');
    expect(html).toContain('pointermove');
    expect(html).toContain('setPointerCapture');
    expect(html).toContain('clampPanelWidth');
    expect(html).toContain('aria-valuemin="220"');
    expect(html).toContain('aria-valuemax="520"');
  });

  it('routes conversation through Ideas and execution through a confirmed plan', () => {
    const htmlPath = path.resolve(__dirname, '../../src/ui/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const proposalStart = html.indexOf("if (flowMode === 'proposal')");
    const proposalBlock = html.slice(proposalStart, html.indexOf('async function syncPlanFromConversation', proposalStart));

    expect(html).toContain('sendIdeaChatMessage');
    expect(proposalBlock).toContain('window.electronAPI.sendIdeaChatMessage');
    expect(proposalBlock).not.toContain('window.electronAPI.runAgentWorkflow');
    expect(html).toContain('window.electronAPI.runAgentWorkflow(state.currentPlanId');
    expect(proposalBlock).toContain('history: historyBeforeMessage');
    expect(proposalBlock).toContain('setIdeaChatPending(false)');
    expect(proposalBlock).not.toContain('He preparado una propuesta segura');
    expect(html).toContain('event.preventDefault();');
  });

  it('exposes explicit plan generation and orchestrator handoff actions', () => {
    const htmlPath = path.resolve(__dirname, '../../src/ui/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="generate-plan-button"');
    expect(html).toContain('id="handoff-plan-button"');
    expect(html).toContain('id="execute-plan-button"');
    expect(html).toContain('id="workflow-run-preview"');
    expect(html).toContain('id="workflow-activity-preview"');
    expect(html).toContain('id="workflow-pause-button"');
    expect(html).toContain('id="workflow-resume-button"');
    expect(html).toContain('id="workflow-retry-button"');
    expect(html).toContain('window.electronAPI.generatePlan');
      expect(html).toContain('window.electronAPI.syncPlan');
    expect(html).toContain('window.electronAPI.handoffPlan');
    expect(html).toContain('window.electronAPI.runAgentWorkflow');
    expect(html).toContain('runAgentWorkflow(state.currentPlanId');
    expect(html).toContain('window.electronAPI.pauseWorkflow');
    expect(html).toContain('window.electronAPI.resumeWorkflow');
    expect(html).toContain('window.electronAPI.retryTask');
    expect(html).toContain('window.electronAPI.getWorkflowActivity');
    expect(html).toContain('sessionId: session.id');
    expect(html).toContain('messages: session.messages.slice(-16)');
    expect(html).toContain('restoreCurrentPlan');
    expect(html).toContain('syncPlanFromConversation');
  });
});
