import fixture from '../fixtures/scene-projection.json';
import { parseSceneProjection } from '../../src/shared/api/scene';
import { mountScene } from '../../src/features/scene/scene-renderer';

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
  const final = mountScene(viewport, projection, () => {
    throw new Error('Contexto final perdido');
  });
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
