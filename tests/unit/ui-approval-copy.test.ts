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
});
