import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../tests/fixtures/app-status.json';
import unavailableFixture from '../../tests/fixtures/app-status-unavailable.json';
import {
  DesktopRequiredError,
  getAppStatus,
  parseAppStatus,
  type AppStatus,
} from '../shared/api/app-status';
import { App } from './App';
import { listScanSources } from '../shared/api/scan-sources';

vi.mock('../shared/api/scan-sources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/api/scan-sources')>()),
  listScanSources: vi.fn(),
}));

vi.mock('../shared/api/app-status', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/api/app-status')>()),
  getAppStatus: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listScanSources).mockResolvedValue([]);
});

describe('T-026 — estados da primeira janela', () => {
  it('aguarda o backend antes de anunciar conexão e banco pronto', async () => {
    let resolveStatus!: (status: AppStatus) => void;
    vi.mocked(getAppStatus).mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    render(<App />);

    expect(
      screen.getByText('Verificando a conexão local…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Conexão local verificada'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled();

    await act(async () => resolveStatus(parseAppStatus(fixture)));

    expect(
      await screen.findByText('Conexão local verificada'),
    ).toBeInTheDocument();
    expect(screen.getByText('Pronto')).toBeInTheDocument();
    expect(screen.getByText('Desativado')).toBeInTheDocument();
  });

  it('não exibe detalhes internos da falha e permite verificar novamente', async () => {
    const user = userEvent.setup();
    vi.mocked(getAppStatus)
      .mockRejectedValueOnce(new Error('Detalhe interno privado'))
      .mockResolvedValueOnce(parseAppStatus(fixture));
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível',
    );
    expect(
      screen.queryByText('Detalhe interno privado'),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Verificar novamente' }),
    );
    expect(
      await screen.findByText('Conexão local verificada'),
    ).toBeInTheDocument();
    expect(getAppStatus).toHaveBeenCalledTimes(2);
  });

  it('explica a ausência de backend no navegador', async () => {
    vi.mocked(getAppStatus).mockRejectedValue(new DesktopRequiredError());
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Abra o aplicativo desktop',
    );
    expect(
      screen.queryByText('Conexão local verificada'),
    ).not.toBeInTheDocument();
  });

  it('distingue banco indisponível de falha IPC e permite recuperar por nova tentativa', async () => {
    const user = userEvent.setup();
    vi.mocked(getAppStatus)
      .mockResolvedValueOnce(parseAppStatus(unavailableFixture))
      .mockResolvedValueOnce(parseAppStatus(fixture));
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível preparar o banco local',
    );
    expect(screen.getByText('Conexão local verificada')).toBeInTheDocument();
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
    expect(screen.queryByText('Pronto')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Verificar novamente' }),
    );
    expect(await screen.findByText('Pronto')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
