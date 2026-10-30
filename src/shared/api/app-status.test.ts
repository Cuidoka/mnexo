import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import fixture from '../../../tests/fixtures/app-status.json';
import unavailableFixture from '../../../tests/fixtures/app-status-unavailable.json';
import {
  DesktopRequiredError,
  getAppStatus,
  parseAppStatus,
} from './app-status';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('T-025 — contrato de status e fronteira IPC', () => {
  it('aceita o mesmo contrato JSON verificado pelo Rust', () => {
    expect(parseAppStatus(fixture)).toEqual(fixture);
    expect(parseAppStatus(unavailableFixture)).toEqual(unavailableFixture);
  });

  it.each([
    null,
    {},
    { ...fixture, schemaVersion: null },
    { ...fixture, schemaVersion: 0 },
    { ...fixture, schemaVersion: -1 },
    { ...fixture, schemaVersion: 1.5 },
    { ...fixture, schemaVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...fixture, databaseStatus: 'notInitialized' },
    { ...unavailableFixture, schemaVersion: 1 },
    { ...fixture, assistantStatus: 'enabled' },
    { ...fixture, backendStatus: 'failed' },
    { ...fixture, appVersion: '' },
  ])('rejeita resposta incompatível: %j', (value) => {
    expect(() => parseAppStatus(value)).toThrow(
      'Resposta de status incompatível.',
    );
  });

  it('consulta somente o comando permitido, sem argumentos de caminho', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue(fixture);

    await expect(getAppStatus()).resolves.toEqual(fixture);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('get_app_status');
  });

  it('não simula backend quando a página é aberta no navegador', async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    await expect(getAppStatus()).rejects.toBeInstanceOf(DesktopRequiredError);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('valida a resposta recebida pela chamada IPC', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue({ ...fixture, schemaVersion: 'zero' });

    await expect(getAppStatus()).rejects.toThrow(
      'Resposta de status incompatível.',
    );
  });
});
