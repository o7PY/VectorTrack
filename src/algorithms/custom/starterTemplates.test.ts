import { describe, expect, it } from 'vitest';
import { compile } from '../../vtl/compile';
import { STARTER_TEMPLATES, starterTemplatesForMode } from './starterTemplates';

describe('starter templates', () => {
  for (const template of STARTER_TEMPLATES) {
    it(`"${template.name}" (${template.mode}) compiles cleanly`, () => {
      const result = compile(template.source, template.mode);
      expect(result.ok, !result.ok ? result.errors.map((e) => e.message).join('; ') : undefined).toBe(true);
    });
  }

  it('starterTemplatesForMode filters by mode', () => {
    expect(starterTemplatesForMode('line').every((t) => t.mode === 'line')).toBe(true);
    expect(starterTemplatesForMode('maze').every((t) => t.mode === 'maze')).toBe(true);
    expect(starterTemplatesForMode('line').length + starterTemplatesForMode('maze').length).toBe(STARTER_TEMPLATES.length);
  });

  it('every template has a unique id', () => {
    const ids = STARTER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
