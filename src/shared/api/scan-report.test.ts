import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/scan-report.json';
import { parseScanReport } from './scan-report';
import { parseSource } from './scan-sources';
import source from '../../../tests/fixtures/scan-source.json';

describe('T-039 — relatório de metadados', () => {
  it('preserva bytes maiores que o inteiro seguro de JavaScript na fixture Rust/TS', () => {
    expect(parseScanReport(fixture)).toEqual(fixture);
    expect(BigInt(parseScanReport(fixture).totalBytes)).toBe(9007199254740993n);
  });
  it.each([
    { ...fixture, totalBytes: 9007199254740992 },
    { ...fixture, totalBytes: '-1' },
    { ...fixture, totalBytes: '9223372036854775808' },
    { ...fixture, filesCount: 1.5 },
    { ...fixture, errorCount: 0 },
    { ...fixture, partial: false },
    { ...fixture, issuesTruncated: true },
    { ...fixture, issues: [{ relativePath: 'x', code: 'MENSAGEM_PRIVADA' }] },
  ])('recusa valores imprecisos ou inconsistentes: %j', (value) => {
    expect(() => parseScanReport(value)).toThrow();
  });
  it('não associa relatório de outra fonte ao cadastro', () => {
    expect(() =>
      parseSource({ ...source, lastScan: { ...fixture, sourceId: 'outra' } }),
    ).toThrow('Relatório de outra fonte');
  });
});
