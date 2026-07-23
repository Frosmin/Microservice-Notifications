import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../../../src/providers/template.renderer.js';

describe('template.renderer.js', () => {
  it('renders repeated placeholders and optional whitespace', () => {
    expect(renderTemplate('Hola {{ nombre }}, total {{total}} / {{total}}', {
      nombre: 'Ana', total: 10
    })).toBe('Hola Ana, total 10 / 10');
  });

  it('rejects missing or null variables as a permanent error', () => {
    expect(() => renderTemplate('{{uno}} {{dos}}', { uno: null })).toThrow(
      'Missing template variables: uno, dos'
    );
  });
});
