import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import source from '../../../tests/fixtures/scan-source.json';
import selection from '../../../tests/fixtures/folder-selection.json';
import report from '../../../tests/fixtures/scan-report.json';
import job from '../../../tests/fixtures/scan-job.json';
import { rootPage, folderPage } from '../../../tests/catalog-fixtures';
import { getNodeChildren } from '../../shared/api/catalog';
import sceneFixture from '../../../tests/fixtures/scene-projection.json';
import {
  getSceneProjection,
  parseSceneProjection,
} from '../../shared/api/scene';
import {
  getScanStatus,
  startScan,
  parseScanJob,
} from '../../shared/api/scan-jobs';
import {
  addScanSource,
  cancelScanSourceSelection,
  chooseScanSource,
  listScanSources,
  parseSource,
  revokeScanSource,
  type ScanSource,
} from '../../shared/api/scan-sources';
import { SourcesPanel } from './SourcesPanel';

vi.mock('../../shared/api/scan-sources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/api/scan-sources')>()),
  addScanSource: vi.fn(),
  cancelScanSourceSelection: vi.fn(),
  chooseScanSource: vi.fn(),
  listScanSources: vi.fn(),
  revokeScanSource: vi.fn(),
}));

vi.mock('../../shared/api/scan-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/api/scan-jobs')>()),
  getScanStatus: vi.fn(),
  startScan: vi.fn(),
  cancelScan: vi.fn(),
}));

vi.mock('../../shared/api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/api/catalog')>()),
  getNodeChildren: vi.fn(),
  getNodeDetail: vi.fn(),
}));
vi.mock('../../shared/api/scene', async (original) => ({
  ...(await original<typeof import('../../shared/api/scene')>()),
  getSceneProjection: vi.fn(),
}));
vi.mock('../scene/SceneCanvas', () => ({
  SceneCanvas: () => <p>Canvas simulado neste teste</p>,
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getScanStatus).mockResolvedValue(null);
  vi.mocked(listScanSources).mockResolvedValue([]);
  vi.mocked(chooseScanSource).mockResolvedValue(selection);
  vi.mocked(addScanSource).mockResolvedValue(parseSource(source));
  vi.mocked(cancelScanSourceSelection).mockResolvedValue(undefined);
  vi.mocked(getNodeChildren).mockResolvedValue(rootPage);
  vi.mocked(getSceneProjection).mockResolvedValue(
    parseSceneProjection(sceneFixture),
  );
});

it('T-054 — abre 3D só por clique, passa IDs do snapshot, oferece 2D e fecha ao revogar', async () => {
  const indexed = parseSource({
    ...source,
    fixtureEligible: true,
    lastScan: report,
  });
  vi.mocked(listScanSources).mockResolvedValue([indexed]);
  vi.mocked(revokeScanSource).mockResolvedValue({
    ...indexed,
    authorized: false,
  });
  const user = userEvent.setup();
  render(<SourcesPanel available />);
  await screen.findByRole('button', {
    name: `Ver cena 3D de ${source.displayName}`,
  });
  expect(getSceneProjection).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('button', {
      name: `Ver cena 3D de ${source.displayName}`,
    }),
  );
  expect(await screen.findByText(/12 nós reais/)).toBeInTheDocument();
  expect(getSceneProjection).toHaveBeenCalledWith(
    source.id,
    report.scanId,
    null,
  );
  expect(startScan).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Ver índice 2D' }));
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(
    screen.queryByText('Canvas simulado neste teste'),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', {
      name: `Ver cena 3D de ${source.displayName}`,
    }),
  );
  await screen.findByText(/12 nós reais/);
  await user.click(
    screen.getByRole('button', {
      name: `Revogar autorização de ${source.displayName}`,
    }),
  );
  expect(
    screen.queryByText('Canvas simulado neste teste'),
  ).not.toBeInTheDocument();
});

it('T-054 — atualizar fontes após novo scan remonta a projeção com o novo snapshot', async () => {
  const indexed = parseSource({
    ...source,
    fixtureEligible: true,
    lastScan: report,
  });
  const nextScan = '00000000-0000-4000-8000-000000000099';
  vi.mocked(listScanSources)
    .mockResolvedValueOnce([indexed])
    .mockResolvedValue([
      { ...indexed, lastScan: { ...indexed.lastScan!, scanId: nextScan } },
    ]);
  const user = userEvent.setup();
  render(<SourcesPanel available />);
  await user.click(
    await screen.findByRole('button', {
      name: `Ver cena 3D de ${source.displayName}`,
    }),
  );
  await screen.findByText(/12 nós reais/);
  await user.click(screen.getByRole('button', { name: 'Atualizar catálogo' }));
  await screen.findByText(/12 nós reais/);
  expect(getSceneProjection).toHaveBeenLastCalledWith(
    source.id,
    nextScan,
    null,
  );
  expect(startScan).not.toHaveBeenCalled();
});

describe('T-046/T-048 — integração do catálogo com fontes e snapshots', () => {
  const indexed = parseSource({
    ...source,
    fixtureEligible: true,
    lastScan: report,
  });
  it('abre somente por clique, consulta o snapshot e fecha ao revogar', async () => {
    const user = userEvent.setup();
    vi.mocked(listScanSources).mockResolvedValue([indexed]);
    vi.mocked(revokeScanSource).mockResolvedValue({
      ...indexed,
      authorized: false,
    });
    render(<SourcesPanel available />);
    const open = await screen.findByRole('button', {
      name: `Explorar índice de ${source.displayName}`,
    });
    expect(getNodeChildren).not.toHaveBeenCalled();
    await user.click(open);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(getNodeChildren).toHaveBeenCalledExactlyOnceWith(
      source.id,
      report.scanId,
      null,
    );
    expect(startScan).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', {
        name: `Revogar autorização de ${source.displayName}`,
      }),
    );
    expect(
      screen.queryByRole('region', {
        name: `Índice 2D — ${source.displayName}`,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: `Explorar índice de ${source.displayName}`,
      }),
    ).not.toBeInTheDocument();
  });
  it('atualizar a fonte com novo snapshot reinicia a navegação na raiz', async () => {
    const user = userEvent.setup();
    const nextScan = '00000000-0000-4000-8000-000000000009';
    vi.mocked(listScanSources).mockResolvedValue([indexed]);
    vi.mocked(getNodeChildren).mockImplementation(
      async (_source, scan, folder) => {
        const page =
          folder === folderPage.folder.node.id ? folderPage : rootPage;
        return { ...page, folder: { ...page.folder, scanId: scan } };
      },
    );
    render(<SourcesPanel available />);
    await user.click(
      await screen.findByRole('button', {
        name: `Explorar índice de ${source.displayName}`,
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Abrir pasta Coleção ç' }),
    );
    await screen.findByText('Pasta vazia no índice.');
    vi.mocked(listScanSources).mockResolvedValue([
      parseSource({ ...indexed, lastScan: { ...report, scanId: nextScan } }),
    ]);
    await user.click(
      screen.getByRole('button', { name: 'Atualizar catálogo' }),
    );
    await screen.findByRole('button', { name: 'Abrir pasta Coleção ç' });
    expect(getNodeChildren).toHaveBeenLastCalledWith(source.id, nextScan, null);
    expect(
      screen.getByRole('button', { name: 'Voltar à pasta pai' }),
    ).toBeDisabled();
    expect(startScan).not.toHaveBeenCalled();
  });
});

async function ready() {
  render(<SourcesPanel available />);
  await screen.findByText('Seu espaço ainda está vazio');
}

describe('T-001/T-014/T-034 — autorização explícita na UI', () => {
  it('aguarda a listagem e não abre diálogo nem concede autorização na inicialização', async () => {
    let finish!: (sources: ScanSource[]) => void;
    vi.mocked(listScanSources).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<SourcesPanel available />);
    expect(
      screen.getByRole('button', { name: 'Selecionar pasta' }),
    ).toBeDisabled();
    expect(chooseScanSource).not.toHaveBeenCalled();
    expect(addScanSource).not.toHaveBeenCalled();
    expect(startScan).not.toHaveBeenCalled();
    await act(async () => finish([parseSource(source)]));
    expect(await screen.findByText(source.displayName)).toBeInTheDocument();
    expect(chooseScanSource).not.toHaveBeenCalled();
  });
  it('separar seleção e confirmação impede gravação antes de Autorizar pasta', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Selecionar pasta' }));
    const preview = await screen.findByRole('region', {
      name: 'Autorizar pasta selecionada?',
    });
    expect(within(preview).getByText(selection.rootPath)).toBeInTheDocument();
    expect(addScanSource).not.toHaveBeenCalled();
    await user.click(
      within(preview).getByRole('button', { name: 'Autorizar pasta' }),
    );
    expect(
      await screen.findByText('Autorizada para metadados'),
    ).toBeInTheDocument();
    expect(addScanSource).toHaveBeenCalledExactlyOnceWith(
      selection.selectionToken,
    );
    expect(
      screen.getByText('Pasta autorizada. Nenhuma varredura foi iniciada.'),
    ).toBeInTheDocument();
  });
  it('cancelar o diálogo nativo não cria fonte', async () => {
    const user = userEvent.setup();
    vi.mocked(chooseScanSource).mockResolvedValue(null);
    await ready();
    await user.click(screen.getByRole('button', { name: 'Selecionar pasta' }));
    expect(await screen.findByText('Seleção cancelada.')).toBeInTheDocument();
    expect(addScanSource).not.toHaveBeenCalled();
  });
  it('cancelar a confirmação invalida a seleção sem autorização', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Selecionar pasta' }));
    await user.click(
      await screen.findByRole('button', { name: 'Cancelar autorização' }),
    );
    expect(
      await screen.findByText('Autorização cancelada.'),
    ).toBeInTheDocument();
    expect(cancelScanSourceSelection).toHaveBeenCalledOnce();
    expect(addScanSource).not.toHaveBeenCalled();
  });
  it('falha no banco não apresenta a pasta como autorizada nem mostra detalhes privados', async () => {
    const user = userEvent.setup();
    vi.mocked(addScanSource).mockRejectedValue({
      code: 'DATABASE_UNAVAILABLE',
      message: 'caminho-privado',
    });
    await ready();
    await user.click(screen.getByRole('button', { name: 'Selecionar pasta' }));
    await user.click(
      await screen.findByRole('button', { name: 'Autorizar pasta' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível acessar o banco local',
    );
    expect(
      screen.queryByText('Autorizada para metadados'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('caminho-privado')).not.toBeInTheDocument();
  });
  it('revoga pelo ID e preserva a linha com o estado revogado', async () => {
    const user = userEvent.setup();
    vi.mocked(listScanSources).mockResolvedValue([parseSource(source)]);
    vi.mocked(revokeScanSource).mockResolvedValue(
      parseSource({ ...source, authorized: false }),
    );
    render(<SourcesPanel available />);
    await user.click(
      await screen.findByRole('button', {
        name: `Revogar autorização de ${source.displayName}`,
      }),
    );
    expect(await screen.findByText('Autorização revogada')).toBeInTheDocument();
    expect(screen.getByText(source.rootPath)).toBeInTheDocument();
    expect(revokeScanSource).toHaveBeenCalledExactlyOnceWith(source.id);
  });
  it('carrega fonte revogada após reabrir e reautoriza por nova escolha sem duplicar a linha', async () => {
    const user = userEvent.setup();
    vi.mocked(listScanSources).mockResolvedValue([
      parseSource({ ...source, authorized: false }),
    ]);
    render(<SourcesPanel available />);
    expect(await screen.findByText('Autorização revogada')).toBeInTheDocument();
    expect(addScanSource).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Selecionar pasta' }));
    await user.click(
      await screen.findByRole('button', { name: 'Autorizar pasta' }),
    );
    expect(
      await screen.findByText('Autorizada para metadados'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
  it('não anuncia lista vazia quando a leitura falha e permite tentar novamente', async () => {
    const user = userEvent.setup();
    vi.mocked(listScanSources)
      .mockRejectedValueOnce({ code: 'DATABASE_UNAVAILABLE' })
      .mockResolvedValueOnce([parseSource(source)]);
    render(<SourcesPanel available />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.queryByText('Seu espaço ainda está vazio'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Atualizar lista' }));
    expect(await screen.findByText(source.displayName)).toBeInTheDocument();
  });
});

describe('T-039 — indexação explícita de fixture na UI', () => {
  const fixtureSource = parseSource({ ...source, fixtureEligible: true });
  it('listar ou autorizar uma fixture não dispara scan; o clique mostra o relatório persistido', async () => {
    const user = userEvent.setup();
    vi.mocked(addScanSource).mockResolvedValue(fixtureSource);
    vi.mocked(startScan).mockResolvedValue(parseScanJob(job)!);
    await ready();
    await user.click(screen.getByRole('button', { name: 'Selecionar pasta' }));
    await user.click(
      await screen.findByRole('button', { name: 'Autorizar pasta' }),
    );
    const button = await screen.findByRole('button', {
      name: 'Indexar metadados da fixture',
    });
    expect(startScan).not.toHaveBeenCalled();
    vi.mocked(listScanSources).mockResolvedValue([
      parseSource({ ...fixtureSource, lastScan: report }),
    ]);
    await user.click(button);
    expect(startScan).toHaveBeenCalledExactlyOnceWith(source.id);
    expect(
      screen.queryByText('Pasta autorizada. Nenhuma varredura foi iniciada.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Selecionar pasta' }),
    ).toBeEnabled();
    vi.mocked(getScanStatus).mockResolvedValue(
      parseScanJob({ ...job, state: 'completed' }),
    );
    const view = await screen.findByRole('region', {
      name: 'Último relatório de indexação',
    });
    expect(within(view).getByText('Indexação parcial')).toBeInTheDocument();
    expect(within(view).getByText('9.007.199.254.740.993')).toBeInTheDocument();
    await user.click(
      within(view).getByText('Ver relatório de erros e exclusões'),
    );
    expect(within(view).getByText(/Link ou junção ignorado/)).toBeVisible();
  });
  it('não oferece indexação para pasta pessoal ou fonte revogada', async () => {
    vi.mocked(listScanSources).mockResolvedValue([
      parseSource(source),
      parseSource({ ...fixtureSource, id: 'revogada', authorized: false }),
    ]);
    render(<SourcesPanel available />);
    await screen.findByText('Autorização revogada');
    expect(
      screen.queryByRole('button', { name: 'Indexar metadados da fixture' }),
    ).not.toBeInTheDocument();
    expect(startScan).not.toHaveBeenCalled();
  });
  it('reabre o relatório salvo sem nova varredura', async () => {
    vi.mocked(listScanSources).mockResolvedValue([
      parseSource({ ...fixtureSource, lastScan: report }),
    ]);
    render(<SourcesPanel available />);
    expect(
      await screen.findByRole('region', {
        name: 'Último relatório de indexação',
      }),
    ).toBeInTheDocument();
    expect(startScan).not.toHaveBeenCalled();
  });
  it('falha ao indexar preserva o relatório anterior e permite tentar novamente', async () => {
    const user = userEvent.setup();
    vi.mocked(listScanSources).mockResolvedValue([
      parseSource({ ...fixtureSource, lastScan: report }),
    ]);
    vi.mocked(startScan).mockRejectedValue({
      code: 'SCAN_UNAVAILABLE',
      message: 'SQL-privado',
    });
    render(<SourcesPanel available />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Indexar metadados da fixture',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A operação de indexação ficou indisponível',
    );
    expect(
      screen.getByRole('region', { name: 'Último relatório de indexação' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Indexar metadados da fixture' }),
    ).toBeEnabled();
    expect(screen.queryByText('SQL-privado')).not.toBeInTheDocument();
  });
});
