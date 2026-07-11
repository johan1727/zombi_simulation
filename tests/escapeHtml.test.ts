import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../src/ui/resultado';

/**
 * Regresión de la revisión final del Plan 4: el HUD interpola la semilla
 * (que puede venir de un ?reto= armado por un desconocido) dentro de
 * innerHTML. escapeHtml es la única barrera — si deja pasar '<' o '>',
 * cualquier link de desafío se vuelve un vector de XSS.
 */
describe('escapeHtml', () => {
  it('neutraliza las etiquetas HTML', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('neutraliza un payload de svg onload realista', () => {
    const payload = '<svg onload=alert(document.cookie)>';
    const escapado = escapeHtml(payload);
    expect(escapado).not.toContain('<svg');
    expect(escapado).toContain('&lt;svg');
  });

  it('escapa el ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('deja intacto un texto normal', () => {
    expect(escapeHtml('PANDEMIA-abc123')).toBe('PANDEMIA-abc123');
  });
});
