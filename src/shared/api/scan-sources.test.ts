import { invoke, isTauri } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import source from '../../../tests/fixtures/scan-source.json';
import selection from '../../../tests/fixtures/folder-selection.json';
import {
  addScanSource,
  cancelScanSourceSelection,
  chooseScanSource,
  listScanSources,
  parseSelection,
  parseSource,
  revokeScanSource,
  sourceErrorMessage,
} from './scan-sources';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
});

describe('T-034 — contratos e comandos de fontes', () => {
  it('aceita as fixtures compartilhadas com Rust e o cancelamento nativo', () => {
    expect(parseSource(source)).toEqual(source);
    expect(parseSelection(selection)).toEqual(selection);
    expect(parseSelection(null)).toBeNull();
  });
  it.each([
    null,
    {},
    { ...source, authorized: 'true' },
    { ...source, id: '' },
    { ...source, rootPath: null },
  ])('rejeita fonte incompatível %j', (value) => {
    expect(() => parseSource(value)).toThrow();
  });
  it.each([
    {},
    { ...selection, selectionToken: '' },
    { ...selection, rootPath: 3 },
  ])('rejeita seleção incompatível %j', (value) => {
    expect(() => parseSelection(value)).toThrow();
  });
  it('abre o seletor sem enviar um caminho ao backend', async () => {
    vi.mocked(invoke).mockResolvedValue(selection);
    expect(await chooseScanSource()).toEqual(selection);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('choose_scan_source');
  });
  it('autoriza somente com o token e revoga somente pelo ID', async () => {
    vi.mocked(invoke).mockResolvedValue(source);
    await addScanSource(selection.selectionToken);
    expect(invoke).toHaveBeenLastCalledWith('add_scan_source', {
      selectionToken: selection.selectionToken,
    });
    await revokeScanSource(source.id);
    expect(invoke).toHaveBeenLastCalledWith('revoke_scan_source', {
      sourceId: source.id,
    });
  });
  it('valida a listagem e limpa a seleção pelo comando dedicado', async () => {
    vi.mocked(invoke).mockResolvedValue([source]);
    expect(await listScanSources()).toEqual([source]);
    expect(invoke).toHaveBeenLastCalledWith('list_scan_sources');
    vi.mocked(invoke).mockResolvedValue(null);
    await cancelScanSourceSelection();
    expect(invoke).toHaveBeenLastCalledWith('cancel_scan_source_selection');
    await expect(listScanSources()).rejects.toThrow(
      'Lista de fontes incompatível.',
    );
  });
  it('não simula nenhuma operação no navegador', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    for (const operation of [
      chooseScanSource,
      listScanSources,
      cancelScanSourceSelection,
      () => addScanSource(selection.selectionToken),
      () => revokeScanSource(source.id),
    ]) {
      await expect(operation()).rejects.toThrow(
        'Este recurso requer o aplicativo desktop.',
      );
    }
    expect(invoke).not.toHaveBeenCalled();
  });
  it('não apresenta caminhos, SQL ou mensagens internas nos erros', () => {
    expect(
      sourceErrorMessage({
        code: 'DATABASE_UNAVAILABLE',
        message: 'segredo-privado',
      }),
    ).not.toContain('segredo-privado');
    expect(sourceErrorMessage(new Error('segredo-privado'))).not.toContain(
      'segredo-privado',
    );
  });
});
