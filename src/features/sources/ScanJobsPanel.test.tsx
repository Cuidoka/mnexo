import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/scan-job.json';
import source from '../../../tests/fixtures/scan-source.json';
import {
  cancelScan,
  getScanStatus,
  parseScanJob,
  startScan,
  type ScanJob,
} from '../../shared/api/scan-jobs';
import { parseSource } from '../../shared/api/scan-sources';
import { ScanJobsPanel } from './ScanJobsPanel';

vi.mock('../../shared/api/scan-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/api/scan-jobs')>()),
  getScanStatus: vi.fn(),
  startScan: vi.fn(),
  cancelScan: vi.fn(),
}));

const running = parseScanJob(fixture)!;
const fixtureSource = parseSource({ ...source, fixtureEligible: true });
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.mocked(getScanStatus).mockResolvedValue(null);
  vi.mocked(startScan).mockResolvedValue(running);
  vi.mocked(cancelScan).mockResolvedValue({ ...running, state: 'cancelling' });
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function show(onSettled = vi.fn()) {
  const view = render(
    <ScanJobsPanel
      available
      blocked={false}
      sources={[fixtureSource]}
      onSettled={onSettled}
    />,
  );
  await act(async () => {});
  return {
    ...view,
    onSettled,
    click: async (element: HTMLElement) => {
      await act(async () => {
        fireEvent.click(element);
      });
    },
  };
}
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe('T-007/T-042 — acompanhamento responsivo e cancelamento', () => {
  it('consulta estado sem iniciar scan e usa progresso sem percentual inventado', async () => {
    const { click } = await show();
    expect(startScan).not.toHaveBeenCalled();
    await click(
      screen.getByRole('button', { name: 'Indexar metadados da fixture' }),
    );
    expect(startScan).toHaveBeenCalledExactlyOnceWith(source.id);
    expect(screen.getByText('Indexação em andamento')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value');
    expect(screen.getByText('9.007.199.254.740.993')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancelar varredura' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Indexar metadados da fixture' }),
    ).toBeDisabled();
  });
  it('distingue solicitação de cancelamento da confirmação e permite reiniciar do zero', async () => {
    vi.mocked(getScanStatus).mockResolvedValue(running);
    const { click, onSettled } = await show();
    await click(screen.getByRole('button', { name: 'Cancelar varredura' }));
    expect(cancelScan).toHaveBeenCalledExactlyOnceWith(running.jobId);
    expect(screen.getByText('Cancelamento solicitado')).toBeInTheDocument();
    expect(screen.queryByText('Varredura cancelada')).not.toBeInTheDocument();
    expect(onSettled).not.toHaveBeenCalled();
    vi.mocked(getScanStatus).mockResolvedValue({
      ...running,
      state: 'cancelled',
    });
    await tick();
    expect(screen.getByText('Varredura cancelada')).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledTimes(1);
    await tick();
    expect(onSettled).toHaveBeenCalledTimes(1);
    vi.mocked(startScan).mockResolvedValue({
      ...running,
      jobId: 'nova-execucao',
      progress: {
        visitedEntries: 0,
        filesCount: 0,
        foldersCount: 0,
        totalBytes: '0',
        skippedCount: 0,
        errorCount: 0,
      },
    });
    await click(
      screen.getByRole('button', { name: 'Indexar metadados da fixture' }),
    );
    expect(screen.getByText('Indexação em andamento')).toBeInTheDocument();
    expect(startScan).toHaveBeenCalledExactlyOnceWith(source.id);
  });
  it('não oferece cancelar durante publicação e recarrega o relatório uma vez na conclusão', async () => {
    vi.mocked(getScanStatus).mockResolvedValue({
      ...running,
      state: 'publishing',
    });
    const { onSettled } = await show();
    expect(screen.getByText('Salvando o índice')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancelar varredura' }),
    ).not.toBeInTheDocument();
    vi.mocked(getScanStatus).mockResolvedValue({
      ...running,
      state: 'completed',
    });
    await tick();
    await tick();
    expect(screen.getByText('Varredura concluída')).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(startScan).not.toHaveBeenCalled();
  });
  it('mantém o último estado conhecido se a consulta falhar e recupera sem vazar detalhes', async () => {
    vi.mocked(getScanStatus).mockResolvedValue(running);
    await show();
    vi.mocked(getScanStatus).mockRejectedValue(
      new Error('SQL-caminho-privado'),
    );
    await tick();
    expect(screen.getByText('Indexação em andamento')).toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'SQL-caminho-privado',
    );
    expect(screen.queryByText('Varredura concluída')).not.toBeInTheDocument();
    vi.mocked(getScanStatus).mockResolvedValue({
      ...running,
      state: 'cancelled',
    });
    await tick();
    expect(screen.getByText('Varredura cancelada')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('uma resposta antiga de polling não apaga o job iniciado por clique', async () => {
    const { click } = await show();
    let resolveOld!: (job: ScanJob | null) => void;
    vi.mocked(getScanStatus).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    await tick();
    await click(
      screen.getByRole('button', { name: 'Indexar metadados da fixture' }),
    );
    await act(async () => {
      resolveOld(null);
    });
    expect(screen.getByText('Indexação em andamento')).toBeInTheDocument();
    expect(
      screen.queryByText('Nenhuma varredura iniciada nesta sessão.'),
    ).not.toBeInTheDocument();
  });
  it('para polling ao desmontar e ignora respostas tardias', async () => {
    let resolveLate!: (job: ScanJob | null) => void;
    vi.mocked(getScanStatus).mockReturnValue(
      new Promise((resolve) => {
        resolveLate = resolve;
      }),
    );
    const { unmount, onSettled } = await show();
    unmount();
    await act(async () => {
      resolveLate({ ...running, state: 'completed' });
    });
    await tick();
    expect(getScanStatus).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();
  });
  it('exibe falha do job por mensagem pública e permite nova tentativa explícita', async () => {
    vi.mocked(getScanStatus).mockResolvedValue({
      ...running,
      state: 'failed',
      errorCode: 'DATABASE_UNAVAILABLE',
    });
    await show();
    expect(screen.getByText('Falha na indexação')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível acessar o banco local',
    );
    expect(
      screen.getByRole('button', { name: 'Indexar metadados da fixture' }),
    ).toBeEnabled();
    expect(startScan).not.toHaveBeenCalled();
  });
});
