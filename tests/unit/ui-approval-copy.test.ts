import fs from 'node:fs';
import path from 'node:path';

describe('UI approval copy', () => {
  it('shows the clearer diff action labels expected by the UX review', () => {
    const htmlPath = path.resolve(__dirname, '../../src/ui/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('Resumen del cambio');
    expect(html).toContain('Aplicar cambios');
    expect(html).toContain('Descartar cambios');
  });

  it('uses typed approval IPC and does not persist approval history in the renderer', () => {
    const htmlPath = path.resolve(__dirname, '../../src/ui/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('window.electronAPI.decideApproval');
    expect(html).toContain('window.electronAPI.getApprovalHistory');
    expect(html).toContain('state.pendingChange');
    expect(html).toContain('currentPlanId');
    expect(html).not.toContain('pushWorkflowHistoryEntry');
    expect(html).not.toContain("window.localStorage.setItem('nexio-workflow-history'");
    const decisionBlock = html.slice(html.indexOf('async function decidePendingChange'), html.indexOf('function getStoredPluginConfig'));
    expect(decisionBlock).not.toContain('window.electronAPI.writeFile');
  });

  it('does not enable approval for a preview without a structured change', () => {
    const htmlPath = path.resolve(__dirname, '../../src/ui/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('approveButton.disabled = !change');
    expect(html).toContain('rejectButton.disabled = !change');
    expect(html).toContain('change.targetPath');
    expect(html).toContain('change.patch');
  });

  it('exposes approval decisions and history through the Electron IPC contract', () => {
    const preload = fs.readFileSync(path.resolve(__dirname, '../../src/electron/preload.ts'), 'utf8');
    const main = fs.readFileSync(path.resolve(__dirname, '../../src/electron/main.ts'), 'utf8');

    expect(preload).toContain('decideApproval: (decision: ApprovalDecision)');
    expect(preload).toContain("ipcRenderer.invoke('approval:decide', decision)");
    expect(preload).toContain("ipcRenderer.invoke('approval:history')");
    expect(main).toContain("ipcMain.handle('approval:decide'");
    expect(main).toContain("ipcMain.handle('approval:history'");
    expect(main).toContain('getExecutionManager().decideApproval');
  });
});
