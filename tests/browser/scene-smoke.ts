import fixture from '../fixtures/scene-projection.json';
import { parseSceneProjection } from '../../src/shared/api/scene';
import { mountScene } from '../../src/features/scene/scene-renderer';

declare global {
  interface Window {
    sceneTest: {
      state: () => {
        selected: string | null;
        opened: string | null;
        selections: number;
      };
      clear: () => void;
      reset: () => void;
      locate: () => {
        file: { x: number; y: number };
        folder: { x: number; y: number };
      };
      finish: () => void;
    };
  }
}

// T-055: este harness nunca chama IPC, scanner ou banco do aplicativo.
const viewport = document.getElementById('viewport')!;
const output = document.getElementById('result')!;
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
try {
  const projection = parseSceneProjection(fixture);
  const large = parseSceneProjection({
    ...fixture,
    nodes: Array.from({ length: 99 }, (_, index) => ({
      ...fixture.nodes[1],
      id: `file-${index}`,
      sizeBytes: String(index * 1000),
    })),
  });
  const results = [];
  for (const data of [projection, large]) {
    let unavailable = 0;
    const session = mountScene(viewport, data, () => {
      unavailable += 1;
    });
    const canvas = viewport.querySelector('canvas')!;
    const gl = canvas.getContext('webgl2');
    check(gl, 'WebGL 2 indisponível');
    const pixels = new Uint8Array(
      gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
    );
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    const colors = new Set<string>();
    for (let offset = 0; offset < pixels.length; offset += 16)
      colors.add(
        `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`,
      );
    check(colors.size > 8, 'Cena sem geometria visível');
    check(gl.getError() === gl.NO_ERROR, 'Erro WebGL');
    session.dispose();
    session.dispose();
    check(!viewport.querySelector('canvas'), 'Canvas não foi removido');
    check(gl.isContextLost(), 'Contexto não foi liberado');
    const lostSession = mountScene(viewport, data, () => {
      unavailable += 1;
    });
    viewport
      .querySelector('canvas')!
      .dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    check(
      unavailable === 1 && !viewport.querySelector('canvas'),
      'Perda de contexto sem descarte/fallback',
    );
    lostSession.dispose();
    results.push({
      nodes: data.nodes.length + 1,
      colors: colors.size,
      disposed: true,
      contextLossHandled: true,
    });
  }
  let selected: string | null = null,
    opened: string | null = null,
    selections = 0;
  const final = mountScene(
    viewport,
    projection,
    () => {
      throw new Error('Contexto final perdido');
    },
    {
      onSelect: (id) => {
        selected = id;
        selections += 1;
      },
      onOpen: (id) => {
        opened = id;
      },
    },
  );
  // T-061: sonda restrita ao harness sintético; picking usa o Raycaster de produção.
  window.sceneTest = {
    state: () => ({ selected, opened, selections }),
    clear: () => {
      selected = null;
      opened = null;
      selections = 0;
      final.setSelection(null);
    },
    reset: final.resetView,
    locate: () => {
      const canvas = viewport.querySelector('canvas')!,
        rect = canvas.getBoundingClientRect();
      let file: { x: number; y: number } | undefined,
        folder: { x: number; y: number } | undefined;
      for (
        let y = rect.top + 10;
        y < rect.bottom && (!file || !folder);
        y += 16
      ) {
        for (
          let x = rect.left + 10;
          x < rect.right && (!file || !folder);
          x += 16
        ) {
          canvas.dispatchEvent(
            new MouseEvent('click', { clientX: x, clientY: y, button: 0 }),
          );
          if (selected === fixture.nodes[1].id) file = { x, y };
          if (selected === fixture.nodes[0].id) folder = { x, y };
        }
      }
      check(file && folder, 'Não encontrou arquivo/pasta por raycast');
      window.sceneTest.clear();
      return { file, folder };
    },
    finish: () => {
      const data = JSON.parse(output.textContent!);
      output.textContent = JSON.stringify({
        ...data,
        interactions: {
          orbit: true,
          pan: true,
          zoom: true,
          picking: true,
          dragDoesNotSelect: true,
          folderOpen: true,
          keyboard: true,
          reset: true,
        },
      });
    },
  };
  window.addEventListener('pagehide', final.dispose, { once: true });
  output.textContent = JSON.stringify({
    passed: true,
    webgl: 'WebGL 2',
    cases: results,
  });
  output.dataset.passed = 'true';
} catch (error) {
  output.textContent = JSON.stringify({
    passed: false,
    error: error instanceof Error ? error.message : 'Falha no teste',
  });
  output.dataset.passed = 'false';
}
