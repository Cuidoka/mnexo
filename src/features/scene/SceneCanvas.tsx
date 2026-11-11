import { useEffect, useRef, useState } from 'react';
import type { SceneProjection } from '../../shared/api/scene';
import { mountScene, type SceneSession } from './scene-renderer';

export function SceneCanvas({
  projection,
  selectedId = projection.root.node.id,
  onSelect,
  onOpen,
}: {
  projection: SceneProjection;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onOpen?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const session = useRef<SceneSession | null>(null);
  const callbacks = useRef({ onSelect, onOpen });
  const selection = useRef(selectedId);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  useEffect(() => {
    callbacks.current = { onSelect, onOpen };
  }, [onSelect, onOpen]);
  useEffect(() => {
    selection.current = selectedId;
    session.current?.setSelection(selectedId);
  }, [selectedId]);
  useEffect(() => {
    let active = true;
    let mounted: SceneSession | undefined;
    Promise.resolve()
      .then(() => {
        if (!active || !container.current) return;
        mounted = mountScene(
          container.current,
          projection,
          () => {
            if (active) setStatus('failed');
          },
          {
            onSelect: (id) => callbacks.current.onSelect?.(id),
            onOpen: (id) => callbacks.current.onOpen?.(id),
          },
        );
        session.current = mounted;
        mounted.setSelection(selection.current);
        if (active) setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('failed');
      });
    return () => {
      active = false;
      mounted?.dispose();
      session.current = null;
    };
  }, [projection]);
  return (
    <>
      <div
        className="scene-controls"
        role="group"
        aria-label="Controles da câmera"
      >
        <button
          type="button"
          className="secondary-button"
          disabled={status !== 'ready'}
          onClick={() => session.current?.orbit(-0.2)}
        >
          Girar à esquerda
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={status !== 'ready'}
          onClick={() => session.current?.orbit(0.2)}
        >
          Girar à direita
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={status !== 'ready'}
          onClick={() => session.current?.zoom(0.8)}
        >
          Aproximar
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={status !== 'ready'}
          onClick={() => session.current?.zoom(1.25)}
        >
          Afastar
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={status !== 'ready'}
          onClick={() => session.current?.resetView()}
        >
          Reenquadrar
        </button>
      </div>
      <p>
        Arraste para orbitar; use a roda para zoom e o botão direito para
        deslocar. Clique para selecionar; dê duplo clique em uma pasta para
        entrar. Na área 3D, use setas para girar, Shift + setas para deslocar,
        +/− para zoom, Home para reenquadrar e Enter para entrar na pasta
        selecionada.
      </p>
      {status === 'loading' && <p role="status">Preparando cena 3D…</p>}
      {status === 'failed' && (
        <p role="alert">
          A cena 3D ficou indisponível. Você pode consultar os mesmos metadados
          no índice 2D.
        </p>
      )}
      <div
        ref={container}
        className="scene-viewport"
        hidden={status === 'failed'}
        role="group"
        aria-label={`Cena 3D de ${projection.nodes.length + 1} nós do índice. Seleção e navegação também disponíveis na relação textual.`}
      />
    </>
  );
}
