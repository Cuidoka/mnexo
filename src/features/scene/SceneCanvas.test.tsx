import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import fixture from '../../../tests/fixtures/scene-projection.json';
import { parseSceneProjection } from '../../shared/api/scene';
import { mountScene } from './scene-renderer';
import { SceneCanvas } from './SceneCanvas';

vi.mock('./scene-renderer', () => ({ mountScene: vi.fn() }));
const projection = parseSceneProjection(fixture);
beforeEach(() => vi.resetAllMocks());

it('T-053 — monta uma sessão e a descarta uma vez, inclusive em StrictMode', async () => {
  const dispose = vi.fn();
  vi.mocked(mountScene).mockReturnValue({
    dispose,
    setSelection: vi.fn(),
    zoom: vi.fn(),
    orbit: vi.fn(),
    resetView: vi.fn(),
  });
  const view = render(
    <StrictMode>
      <SceneCanvas projection={projection} />
    </StrictMode>,
  );
  await waitFor(() => expect(mountScene).toHaveBeenCalledOnce());
  expect(
    screen.getByRole('group', { name: /Cena 3D de 12 nós/ }),
  ).toBeInTheDocument();
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});

it('T-053 — falha de WebGL não inventa uma cena renderizada', async () => {
  vi.mocked(mountScene).mockImplementation(() => {
    throw new Error('driver privado');
  });
  render(<SceneCanvas projection={projection} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('índice 2D');
  expect(
    screen.queryByRole('group', { name: /Cena 3D de/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('driver privado')).not.toBeInTheDocument();
});

it('T-053 — perda do contexto informa indisponibilidade e fecha a sessão', async () => {
  const dispose = vi.fn();
  vi.mocked(mountScene).mockReturnValue({
    dispose,
    setSelection: vi.fn(),
    zoom: vi.fn(),
    orbit: vi.fn(),
    resetView: vi.fn(),
  });
  const view = render(<SceneCanvas projection={projection} />);
  await waitFor(() => expect(mountScene).toHaveBeenCalledOnce());
  act(() => vi.mocked(mountScene).mock.calls[0][2]());
  expect(screen.getByRole('alert')).toHaveTextContent('indisponível');
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});

it('T-058/T-059 — controles e seleção atualizam a sessão sem remontar WebGL', async () => {
  const session = {
    dispose: vi.fn(),
    setSelection: vi.fn(),
    zoom: vi.fn(),
    orbit: vi.fn(),
    resetView: vi.fn(),
  };
  vi.mocked(mountScene).mockReturnValue(session);
  const selected = vi.fn(),
    opened = vi.fn();
  const view = render(
    <SceneCanvas
      projection={projection}
      selectedId={projection.root.node.id}
      onSelect={selected}
      onOpen={opened}
    />,
  );
  const user = userEvent.setup();
  await waitFor(() => expect(mountScene).toHaveBeenCalledOnce());
  await user.click(screen.getByRole('button', { name: 'Aproximar' }));
  await user.click(screen.getByRole('button', { name: 'Afastar' }));
  await user.click(screen.getByRole('button', { name: 'Girar à direita' }));
  await user.click(screen.getByRole('button', { name: 'Reenquadrar' }));
  expect(session.zoom.mock.calls).toEqual([[0.8], [1.25]]);
  expect(session.orbit).toHaveBeenCalledWith(0.2);
  expect(session.resetView).toHaveBeenCalledOnce();
  view.rerender(
    <SceneCanvas
      projection={projection}
      selectedId={projection.nodes[1].id}
      onSelect={selected}
      onOpen={opened}
    />,
  );
  expect(session.setSelection).toHaveBeenLastCalledWith(projection.nodes[1].id);
  expect(mountScene).toHaveBeenCalledOnce();
  act(() => {
    vi.mocked(mountScene).mock.calls[0][3]!.onSelect!(projection.nodes[1].id);
    vi.mocked(mountScene).mock.calls[0][3]!.onOpen!(projection.nodes[0].id);
  });
  expect(selected).toHaveBeenCalledWith(projection.nodes[1].id);
  expect(opened).toHaveBeenCalledWith(projection.nodes[0].id);
  view.unmount();
  expect(session.dispose).toHaveBeenCalledOnce();
});
