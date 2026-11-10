import { describe, expect, it } from 'vitest';
import { formatBytes, formatFilesystemDate } from './metadata-format';

describe('T-044/T-048 — apresentação fiel de metadados', () => {
  it('preserva inteiros de 64 bits e não confunde indisponível com zero', () => {
    expect(formatBytes('9007199254740993')).toBe('9.007.199.254.740.993 bytes');
    expect(formatBytes('0')).toBe('0 bytes');
    expect(formatBytes(null)).toBe('Indisponível');
  });
  it('mostra datas ausentes ou fora da faixa sem arredondar nem criar Invalid Date', () => {
    expect(formatFilesystemDate(null)).toBe('Indisponível');
    expect(formatFilesystemDate('9007199254740993')).toBe(
      '9007199254740993 ms desde 1970 (fora do intervalo de exibição)',
    );
    expect(formatFilesystemDate('-1')).not.toContain('Invalid');
  });
});
