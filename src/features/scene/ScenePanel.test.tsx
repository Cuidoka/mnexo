import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/scene-projection.json';
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
  SceneCanvas: () => <p>Canvas simulado neste teste</p>,
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
});

it('T-054 — informa snapshot, contagem e parentesco com bytes exatos', async () => {
  const user = userEvent.setup();
  render(<ScenePanel {...props} />);
  expect(await screen.findByText(/12 nós reais/)).toBeInTheDocument();
  await user.click(screen.getByText('Relação dos 12 nós exibidos'));
  expect(screen.getAllByRole('row')).toHaveLength(13);
  expect(screen.getAllByText('9.007.199.254.740.993 bytes')).toHaveLength(2);
  expect(
    screen.getByText('Câmera fixa nesta versão.', { exact: false }),
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
