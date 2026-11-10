export const issueLabels = {
  METADATA_UNAVAILABLE: 'Metadados indisponíveis',
  DIRECTORY_UNREADABLE: 'Não foi possível listar a pasta',
  ENTRY_UNREADABLE: 'Não foi possível consultar uma entrada da pasta',
  DIRECTORY_CHANGED: 'A pasta mudou durante a leitura',
  LINK_SKIPPED: 'Link ou junção ignorado',
  EXCLUDED_ENTRY: 'Entrada excluída pela política desta etapa',
  UNSUPPORTED_TYPE: 'Tipo de arquivo não suportado',
  INVALID_NAME: 'Nome não representável nesta etapa',
  DATES_UNAVAILABLE: 'Uma ou mais datas estão indisponíveis',
  SIZE_OVERFLOW: 'Tamanho excede o limite do catálogo',
  DEPTH_LIMIT: 'Limite de profundidade atingido',
  SCAN_LIMIT: 'Limite de entradas ou tempo atingido',
} as const;

export interface ScanReport {
  sourceId: string;
  scanId: string;
  completedAt: string;
  filesCount: number;
  foldersCount: number;
  totalBytes: string;
  skippedCount: number;
  errorCount: number;
  partial: boolean;
  issues: { relativePath: string; code: keyof typeof issueLabels }[];
  issuesTruncated: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function parseScanReport(value: unknown): ScanReport {
  if (
    !record(value) ||
    !text(value.sourceId) ||
    !text(value.scanId) ||
    !text(value.completedAt) ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    !count(value.filesCount) ||
    !count(value.foldersCount) ||
    !count(value.skippedCount) ||
    !count(value.errorCount) ||
    !text(value.totalBytes) ||
    !/^(0|[1-9]\d{0,18})$/.test(value.totalBytes) ||
    BigInt(value.totalBytes) > 9223372036854775807n ||
    typeof value.partial !== 'boolean' ||
    value.partial !== value.errorCount > 0 ||
    typeof value.issuesTruncated !== 'boolean' ||
    !Array.isArray(value.issues) ||
    value.issues.length > 100 ||
    value.issues.length > value.errorCount ||
    value.issuesTruncated !== value.issues.length < value.errorCount
  )
    throw new Error('Relatório de indexação incompatível.');
  const issues = value.issues.map((issue: unknown) => {
    if (
      !record(issue) ||
      !text(issue.relativePath) ||
      !text(issue.code) ||
      !Object.hasOwn(issueLabels, issue.code)
    ) {
      throw new Error('Ocorrência de indexação incompatível.');
    }
    return {
      relativePath: issue.relativePath,
      code: issue.code as keyof typeof issueLabels,
    };
  });
  return {
    sourceId: value.sourceId,
    scanId: value.scanId,
    completedAt: value.completedAt,
    filesCount: value.filesCount,
    foldersCount: value.foldersCount,
    totalBytes: value.totalBytes,
    skippedCount: value.skippedCount,
    errorCount: value.errorCount,
    partial: value.partial,
    issues,
    issuesTruncated: value.issuesTruncated,
  };
}
