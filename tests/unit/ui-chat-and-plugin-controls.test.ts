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
});
