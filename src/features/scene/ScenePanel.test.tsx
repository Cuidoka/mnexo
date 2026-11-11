import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/scene-projection.json';
import folderFixture from '../../../tests/fixtures/scene-folder-projection.json';
import { fileDetail } from '../../../tests/catalog-fixtures';
import { getNodeDetail, type NodeDetail } from '../../shared/api/catalog';
import {
  getSceneProjection,
  parseSceneProjection,
  type SceneProjection,
} from '../../shared/api/scene';
import { ScenePanel } from './ScenePanel';

vi.mock('../../shared/api/scene', async (original) => ({
  ...(await original<typeof import('../../shared/api/scene')>()),
  getSceneProjection: vi.fn(),
}));
vi.mock('./SceneCanvas', () => ({
  SceneCanvas: ({
    onSelect,
    onOpen,
  }: {
    onSelect: (id: string | null) => void;
    onOpen: (id: string) => void;
  }) => (
    <>
      <p>Canvas simulado neste teste</p>
      <button onClick={() => onSelect(fixture.nodes[1].id)}>
        Clique 3D no arquivo
      </button>
      <button onClick={() => onOpen(fixture.nodes[0].id)}>
        Duplo clique 3D na pasta
      </button>
    </>
  ),
}));
vi.mock('../../shared/api/catalog', async (original) => ({
  ...(await original<typeof import('../../shared/api/catalog')>()),
  getNodeDetail: vi.fn(),
}));
const projection = parseSceneProjection(fixture);
const props = {
  sourceId: projection.root.sourceId,
  scanId: projection.root.scanId,
  sourceName: projection.root.sourceName,
  onClose: vi.fn(),
  onRefresh: vi.fn(),
  onOpen2D: vi.fn(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSceneProjection).mockResolvedValue(projection);
  vi.mocked(getNodeDetail).mockResolvedValue(fileDetail);
});

it('RF-004/T-011/T-060 — seleção 3D mostra detalhe do ID real e pasta navega por pai/breadcrumb', async () => {
  const user = userEvent.setup();
  const folder = parseSceneProjection(folderFixture);
  vi.mocked(getSceneProjection)
    .mockResolvedValueOnce(projection)
    .mockResolvedValueOnce(folder)
    .mockResolvedValue(projection);
  render(<ScenePanel {...props} />);
  await screen.findByText(/12 nós reais/);
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  await user.click(
    await screen.findByRole('button', { name: 'Clique 3D no arquivo' }),
  );
  expect(
    await screen.findByRole('heading', { name: fileDetail.node.title }),
  ).toBeInTheDocument();
  expect(getNodeDetail).toHaveBeenCalledExactlyOnceWith(
    props.sourceId,
    props.scanId,
    fileDetail.node.id,
  );
  expect(
    screen.getByRole('button', { name: 'Entrar na pasta selecionada' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Duplo clique 3D na pasta' }),
  );
  expect(await screen.findByText(/10 nós reais/)).toBeInTheDocument();
  expect(getSceneProjection).toHaveBeenLastCalledWith(
    props.sourceId,
    props.scanId,
    folder.root.node.id,
  );
  expect(
    screen.getByRole('navigation', { name: 'Caminho da cena' }),
  ).toHaveTextContent(folder.root.node.title);
  await user.click(screen.getByRole('button', { name: 'Voltar à pasta pai' }));
  await screen.findByText(/12 nós reais/);
  expect(getSceneProjection).toHaveBeenLastCalledWith(
    props.sourceId,
    props.scanId,
    projection.root.node.id,
  );
  expect(
    screen.getByRole('button', { name: 'Voltar à pasta pai' }),
  ).toBeDisabled();
});

it('T-060 — navegação textual por teclado e pasta vazia não dependem de WebGL', async () => {
  const user = userEvent.setup();
  vi.mocked(getNodeDetail).mockResolvedValue(
    parseSceneProjection(folderFixture).root,
  );
  vi.mocked(getSceneProjection)
    .mockResolvedValueOnce(projection)
    .mockResolvedValueOnce(
      parseSceneProjection({ ...folderFixture, nodes: [] }),
    )
    .mockResolvedValue(projection);
  render(<ScenePanel {...props} />);
  await screen.findByText(/12 nós reais/);
  await user.click(screen.getByText('Relação dos 12 nós exibidos'));
  const folderButton = screen.getByRole('button', {
    name: `Selecionar ${folderFixture.root.node.title}`,
  });
  folderButton.focus();
  await user.keyboard('{Enter}');
  await user.click(
    screen.getByRole('button', { name: 'Entrar na pasta selecionada' }),
  );
  await screen.findByText(/1 nós reais/);
  await user.click(
    within(
      screen.getByRole('navigation', { name: 'Caminho da cena' }),
    ).getByRole('button', { name: projection.root.node.title }),
  );
  await screen.findByText(/12 nós reais/);
  expect(getSceneProjection).toHaveBeenLastCalledWith(
    props.sourceId,
    props.scanId,
    projection.root.node.id,
  );
});

it('T-060 — detalhe atrasado não reaparece após navegar', async () => {
  let resolve!: (value: NodeDetail) => void;
  vi.mocked(getNodeDetail).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  vi.mocked(getSceneProjection)
    .mockResolvedValueOnce(projection)
    .mockResolvedValue(parseSceneProjection(folderFixture));
  const user = userEvent.setup();
  render(<ScenePanel {...props} />);
  await user.click(
    await screen.findByRole('button', { name: 'Clique 3D no arquivo' }),
  );
  expect(
    screen.getByText('Carregando metadados da seleção…'),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Duplo clique 3D na pasta' }),
  );
  await screen.findByText(/10 nós reais/);
  await act(async () => resolve(fileDetail));
  expect(
    screen.queryByRole('heading', { name: fileDetail.node.title }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: folderFixture.root.node.title }),
  ).toBeInTheDocument();
});

it('T-060 — falha de navegação descarta cena antiga e permite voltar à raiz', async () => {
  vi.mocked(getSceneProjection)
    .mockResolvedValueOnce(projection)
    .mockRejectedValueOnce({ code: 'INDEX_CHANGED' })
    .mockResolvedValue(projection);
  const user = userEvent.setup();
  render(<ScenePanel {...props} />);
  await user.click(
    await screen.findByRole('button', { name: 'Duplo clique 3D na pasta' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('índice mudou');
  expect(
    screen.queryByText('Canvas simulado neste teste'),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Voltar à raiz da fonte' }),
  );
  await screen.findByText(/12 nós reais/);
  expect(getSceneProjection).toHaveBeenLastCalledWith(
    props.sourceId,
    props.scanId,
    null,
  );
});

it('T-054 — informa snapshot, contagem e parentesco com bytes exatos', async () => {
  const user = userEvent.setup();
  render(<ScenePanel {...props} />);
  expect(await screen.findByText(/12 nós reais/)).toBeInTheDocument();
  await user.click(screen.getByText('Relação dos 12 nós exibidos'));
  expect(screen.getAllByRole('row')).toHaveLength(13);
  expect(screen.getAllByText('9.007.199.254.740.993 bytes')).toHaveLength(3);
  expect(
    screen.getByText('tamanho dos arquivos em escala', { exact: false }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ver índice 2D' }));
  await user.click(screen.getByRole('button', { name: 'Fechar cena' }));
  expect(props.onOpen2D).toHaveBeenCalledOnce();
  expect(props.onClose).toHaveBeenCalledOnce();
});

it('T-054 — comunica projeção truncada e índice parcial sem inferir itens ausentes', async () => {
  vi.mocked(getSceneProjection).mockResolvedValue({
    ...projection,
    truncated: true,
    root: {
      ...projection.root,
      node: { ...projection.root.node, sizePartial: true },
    },
  });
  render(<ScenePanel {...props} />);
  expect(
    await screen.findByText(/Há itens do índice fora desta cena/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Índice parcial/)).toBeInTheDocument();
});

it('T-054 — erro de índice mantém ação de atualizar e não vira cena vazia', async () => {
  vi.mocked(getSceneProjection).mockRejectedValue({ code: 'INDEX_CHANGED' });
  const user = userEvent.setup();
  render(<ScenePanel {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('índice mudou');
  expect(
    screen.queryByText('Canvas simulado neste teste'),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Atualizar catálogo' }));
  expect(props.onRefresh).toHaveBeenCalledOnce();
});

it('T-054 — resposta atrasada após fechar não reabre a cena', async () => {
  let resolve!: (value: SceneProjection) => void;
  vi.mocked(getSceneProjection).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(<ScenePanel {...props} />);
  view.unmount();
  await act(async () => resolve(projection));
  expect(
    screen.queryByText('Canvas simulado neste teste'),
  ).not.toBeInTheDocument();
});
