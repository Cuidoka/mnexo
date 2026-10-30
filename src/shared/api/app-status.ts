import { invoke, isTauri } from '@tauri-apps/api/core';

/** MVP-002 / T-025: banco pronto sempre informa uma versão válida. */
export type AppStatus = {
  appVersion: string;
  backendStatus: 'ready';
  assistantStatus: 'disabled';
} & (
  | { databaseStatus: 'ready'; schemaVersion: number }
  | { databaseStatus: 'unavailable'; schemaVersion: null }
);

export class DesktopRequiredError extends Error {
  constructor() {
    super('Este recurso requer o aplicativo desktop.');
    this.name = 'DesktopRequiredError';
  }
}

export function parseAppStatus(value: unknown): AppStatus {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('appVersion' in value) ||
    typeof value.appVersion !== 'string' ||
    value.appVersion.length === 0 ||
    !('backendStatus' in value) ||
    value.backendStatus !== 'ready' ||
    !('databaseStatus' in value) ||
    !('schemaVersion' in value) ||
    !('assistantStatus' in value) ||
    value.assistantStatus !== 'disabled'
  ) {
    throw new Error('Resposta de status incompatível.');
  }

  const common: Pick<
    AppStatus,
    'appVersion' | 'backendStatus' | 'assistantStatus'
  > = {
    appVersion: value.appVersion,
    backendStatus: value.backendStatus,
    assistantStatus: value.assistantStatus,
  };

  if (
    value.databaseStatus === 'ready' &&
    typeof value.schemaVersion === 'number' &&
    Number.isSafeInteger(value.schemaVersion) &&
    value.schemaVersion >= 1
  ) {
    return {
      ...common,
      databaseStatus: 'ready',
      schemaVersion: value.schemaVersion,
    };
  }
  if (value.databaseStatus === 'unavailable' && value.schemaVersion === null) {
    return { ...common, databaseStatus: 'unavailable', schemaVersion: null };
  }
  throw new Error('Resposta de status incompatível.');
}

export async function getAppStatus(): Promise<AppStatus> {
  if (!isTauri()) {
    throw new DesktopRequiredError();
  }

  return parseAppStatus(await invoke<unknown>('get_app_status'));
}
