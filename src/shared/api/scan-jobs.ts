import { invoke, isTauri } from '@tauri-apps/api/core';
import { DesktopRequiredError } from './app-status';

export const jobStates = [
  'running',
  'cancelling',
  'publishing',
  'completed',
  'cancelled',
  'failed',
] as const;
export type JobState = (typeof jobStates)[number];
export interface ScanJob {
  jobId: string;
  sourceId: string;
  state: JobState;
  progress: {
    visitedEntries: number;
    filesCount: number;
    foldersCount: number;
    totalBytes: string;
    skippedCount: number;
    errorCount: number;
  };
  errorCode: string | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function parseScanJob(value: unknown): ScanJob | null {
  if (value === null) return null;
  if (
    !record(value) ||
    !text(value.jobId) ||
    !text(value.sourceId) ||
    !jobStates.includes(value.state as JobState) ||
    !record(value.progress)
  ) {
    throw new Error('Estado de indexação incompatível.');
  }
  const p = value.progress;
  if (
    !count(p.visitedEntries) ||
    !count(p.filesCount) ||
    !count(p.foldersCount) ||
    !count(p.skippedCount) ||
    !count(p.errorCount) ||
    p.filesCount + p.foldersCount > p.visitedEntries ||
    !text(p.totalBytes) ||
    !/^(0|[1-9]\d{0,18})$/.test(p.totalBytes) ||
    BigInt(p.totalBytes) > 9223372036854775807n ||
    (value.state === 'failed'
      ? !text(value.errorCode)
      : value.errorCode !== null)
  ) {
    throw new Error('Progresso de indexação incompatível.');
  }
  return {
    jobId: value.jobId,
    sourceId: value.sourceId,
    state: value.state as JobState,
    progress: {
      visitedEntries: p.visitedEntries,
      filesCount: p.filesCount,
      foldersCount: p.foldersCount,
      totalBytes: p.totalBytes,
      skippedCount: p.skippedCount,
      errorCount: p.errorCount,
    },
    errorCode: value.errorCode as string | null,
  };
}
export function jobActive(job: ScanJob | null) {
  return (
    job !== null && ['running', 'cancelling', 'publishing'].includes(job.state)
  );
}
async function call(command: string, args?: Record<string, string>) {
  if (!isTauri()) throw new DesktopRequiredError();
  return parseScanJob(await invoke<unknown>(command, args));
}
export async function getScanStatus(): Promise<ScanJob | null> {
  return call('get_scan_status');
}
export async function startScan(sourceId: string): Promise<ScanJob> {
  const job = await call('start_scan', { sourceId });
  if (!job || job.sourceId !== sourceId) throw new Error('Job de outra fonte.');
  return job;
}
export async function cancelScan(jobId: string): Promise<ScanJob> {
  const job = await call('cancel_scan', { jobId });
  if (!job || job.jobId !== jobId) throw new Error('Job de outra execução.');
  return job;
}
