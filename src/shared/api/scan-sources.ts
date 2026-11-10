import { invoke, isTauri } from '@tauri-apps/api/core';
import { DesktopRequiredError } from './app-status';
import { parseScanReport, type ScanReport } from './scan-report';

export interface ScanSource {
  id: string;
  rootPath: string;
  displayName: string;
  authorized: boolean;
  createdAt: string;
  fixtureEligible: boolean;
  lastScan: ScanReport | null;
}

export interface FolderSelection {
  selectionToken: string;
  rootPath: string;
  displayName: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function parseSource(value: unknown): ScanSource {
  if (
    !record(value) ||
    !text(value.id) ||
    !text(value.rootPath) ||
    !text(value.displayName) ||
    typeof value.authorized !== 'boolean' ||
    !text(value.createdAt) ||
    typeof value.fixtureEligible !== 'boolean' ||
    !('lastScan' in value)
  ) {
    throw new Error('Resposta de fonte incompatível.');
  }
  const report =
    value.lastScan === null ? null : parseScanReport(value.lastScan);
  if (report && report.sourceId !== value.id)
    throw new Error('Relatório de outra fonte.');
  return {
    id: value.id,
    rootPath: value.rootPath,
    displayName: value.displayName,
    authorized: value.authorized,
    createdAt: value.createdAt,
    fixtureEligible: value.fixtureEligible,
    lastScan: report,
  };
}

export function parseSelection(value: unknown): FolderSelection | null {
  if (value === null) return null;
  if (
    !record(value) ||
    !text(value.selectionToken) ||
    !text(value.rootPath) ||
    !text(value.displayName)
  ) {
    throw new Error('Resposta de seleção incompatível.');
  }
  return {
    selectionToken: value.selectionToken,
    rootPath: value.rootPath,
    displayName: value.displayName,
  };
}

function requireDesktop() {
  if (!isTauri()) throw new DesktopRequiredError();
}

export async function chooseScanSource(): Promise<FolderSelection | null> {
  requireDesktop();
  return parseSelection(await invoke<unknown>('choose_scan_source'));
}

export async function addScanSource(
  selectionToken: string,
): Promise<ScanSource> {
  requireDesktop();
  return parseSource(
    await invoke<unknown>('add_scan_source', { selectionToken }),
  );
}

export async function listScanSources(): Promise<ScanSource[]> {
  requireDesktop();
  const result = await invoke<unknown>('list_scan_sources');
  if (!Array.isArray(result)) throw new Error('Lista de fontes incompatível.');
  return result.map(parseSource);
}

export async function cancelScanSourceSelection(): Promise<void> {
  requireDesktop();
  await invoke('cancel_scan_source_selection');
}

export async function revokeScanSource(sourceId: string): Promise<ScanSource> {
  requireDesktop();
  return parseSource(await invoke<unknown>('revoke_scan_source', { sourceId }));
}

export async function indexFixtureSource(
  sourceId: string,
): Promise<ScanSource> {
  requireDesktop();
  return parseSource(
    await invoke<unknown>('index_fixture_source', { sourceId }),
  );
}

export function sourceErrorMessage(error: unknown): string {
  const code = record(error) ? error.code : null;
  switch (code) {
    case 'INVALID_FOLDER':
      return 'A pasta não está disponível. Selecione uma pasta existente.';
    case 'LOCAL_FOLDER_REQUIRED':
      return 'Selecione uma pasta em uma unidade local. Fontes de rede ainda não estão disponíveis.';
    case 'LINK_NOT_SUPPORTED':
      return 'Selecione a pasta original. Atalhos e junções ainda não são aceitos como fonte.';
    case 'INVALID_SELECTION':
      return 'A seleção não é mais válida. Selecione a pasta novamente.';
    case 'SELECTION_BUSY':
      return 'Conclua ou cancele o diálogo de pasta já aberto.';
    case 'DATABASE_UNAVAILABLE':
      return 'Não foi possível acessar o banco local. Tente novamente.';
    case 'SOURCE_NOT_FOUND':
      return 'A fonte não foi encontrada. Atualize a lista.';
    case 'SOURCE_NOT_AUTHORIZED':
      return 'A fonte não está autorizada. Atualize a lista e autorize a fixture novamente.';
    case 'FIXTURE_ONLY':
      return 'Neste passo, somente a pasta de teste do projeto pode ser indexada.';
    case 'FIXTURE_UNAVAILABLE':
      return 'A pasta de teste está indisponível ou contém um link na raiz. Confira a fixture e selecione-a novamente.';
    case 'SCAN_UNAVAILABLE':
      return 'Não foi possível concluir a indexação. O relatório anterior foi preservado.';
    default:
      return 'Não foi possível concluir a operação. Tente novamente.';
  }
}
