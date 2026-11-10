import { invoke, isTauri } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/scan-job.json';
import {
  cancelScan,
  getScanStatus,
  jobActive,
  parseScanJob,
  startScan,
} from './scan-jobs';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
});

describe('T-042 — contratos de jobs e IPC', () => {
  it('aceita contrato Rust/TS sem converter bytes para Number', () => {
    expect(parseScanJob(fixture)).toEqual(fixture);
    expect(parseScanJob(null)).toBeNull();
    expect(jobActive(parseScanJob(fixture))).toBe(true);
  });
  it.each([
    {},
    { ...fixture, jobId: '' },
    { ...fixture, state: 'finished' },
    { ...fixture, errorCode: 'ERRO' },
    { ...fixture, state: 'failed', errorCode: null },
    {
      ...fixture,
      progress: { ...fixture.progress, totalBytes: 9007199254740992 },
    },
    {
      ...fixture,
      progress: { ...fixture.progress, totalBytes: '9223372036854775808' },
    },
    { ...fixture, progress: { ...fixture.progress, visitedEntries: -1 } },
    { ...fixture, progress: { ...fixture.progress, visitedEntries: 1 } },
  ])('rejeita estado ou progresso inconsistente: %j', (value) => {
    expect(() => parseScanJob(value)).toThrow();
  });
  it('envia somente IDs para iniciar/cancelar e consulta o último job sem caminhos', async () => {
    vi.mocked(invoke).mockResolvedValue(fixture);
    await startScan(fixture.sourceId);
    expect(invoke).toHaveBeenLastCalledWith('start_scan', {
      sourceId: fixture.sourceId,
    });
    await cancelScan(fixture.jobId);
    expect(invoke).toHaveBeenLastCalledWith('cancel_scan', {
      jobId: fixture.jobId,
    });
    expect(await getScanStatus()).toEqual(fixture);
    expect(invoke).toHaveBeenLastCalledWith('get_scan_status', undefined);
  });
  it('recusa respostas de outra fonte ou execução', async () => {
    vi.mocked(invoke).mockResolvedValue(fixture);
    await expect(startScan('outra')).rejects.toThrow();
    await expect(cancelScan('outro')).rejects.toThrow();
  });
  it('não simula scans no navegador', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    for (const operation of [
      getScanStatus,
      () => startScan(fixture.sourceId),
      () => cancelScan(fixture.jobId),
    ]) {
      await expect(operation()).rejects.toThrow(
        'Este recurso requer o aplicativo desktop.',
      );
    }
    expect(invoke).not.toHaveBeenCalled();
  });
});
