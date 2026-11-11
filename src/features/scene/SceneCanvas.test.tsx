import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../tests/fixtures/scene-projection.json';
import { parseSceneProjection } from '../../shared/api/scene';
import { mountScene } from './scene-renderer';
import { SceneCanvas } from './SceneCanvas';

vi.mock('./scene-renderer', () => ({ mountScene: vi.fn() }));
const projection = parseSceneProjection(fixture);
beforeEach(() => vi.resetAllMocks());

it('T-053 — monta uma sessão e a descarta uma vez, inclusive em StrictMode', async () => {
  const dispose = vi.fn();
  vi.mocked(mountScene).mockReturnValue({ dispose });
  const view = render(
    <StrictMode>
      <SceneCanvas projection={projection} />
    </StrictMode>,
  );
  await waitFor(() => expect(mountScene).toHaveBeenCalledOnce());
  expect(screen.getByRole('img')).toHaveAccessibleName(/12 nós/);
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});

it('T-053 — falha de WebGL não inventa uma cena renderizada', async () => {
  vi.mocked(mountScene).mockImplementation(() => {
    throw new Error('driver privado');
  });
  render(<SceneCanvas projection={projection} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('índice 2D');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByText('driver privado')).not.toBeInTheDocument();
});

it('T-053 — perda do contexto informa indisponibilidade e fecha a sessão', async () => {
  const dispose = vi.fn();
  vi.mocked(mountScene).mockReturnValue({ dispose });
  const view = render(<SceneCanvas projection={projection} />);
  await waitFor(() => expect(mountScene).toHaveBeenCalledOnce());
  act(() => vi.mocked(mountScene).mock.calls[0][2]());
  expect(screen.getByRole('alert')).toHaveTextContent('indisponível');
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});
