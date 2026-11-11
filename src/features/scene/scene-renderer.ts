import * as THREE from 'three';
import type { SceneProjection } from '../../shared/api/scene';
import { layoutScene, type SceneBox } from './scene-layout';

export interface SceneSession {
  dispose: () => void;
}

// RF-003 / T-052/T-053. Geometria local; IDs e parentesco vêm exclusivamente do índice.
export function mountScene(
  container: HTMLElement,
  projection: SceneProjection,
  onUnavailable: () => void,
): SceneSession {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c171e');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(geometry);
  const folders = new THREE.LineBasicMaterial({ color: '#81d8cc' });
  const partialEdges = new THREE.LineBasicMaterial({ color: '#edbc7a' });
  const floor = new THREE.MeshLambertMaterial({ color: '#234a50' });
  const files = new THREE.MeshLambertMaterial({ color: '#98b8f8' });
  const partialFiles = new THREE.MeshLambertMaterial({ color: '#edbc7a' });
  let disposed = false;
  let observer: ResizeObserver | undefined;
  function dispose() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    canvas.removeEventListener('webglcontextlost', lost);
    geometry.dispose();
    edges.dispose();
    [folders, partialEdges, floor, files, partialFiles].forEach((material) =>
      material.dispose(),
    );
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  function lost(event: Event) {
    event.preventDefault();
    dispose();
    onUnavailable();
  }
  try {
    const layout = layoutScene(projection);
    function object(box: SceneBox): THREE.Group {
      const group = new THREE.Group();
      group.userData.nodeId = box.node.id;
      group.position.set(...box.position);
      const [width, height, depth] = box.size;
      if (box.node.kind === 'folder') {
        const outline = new THREE.LineSegments(
          edges,
          box.node.sizePartial ? partialEdges : folders,
        );
        outline.scale.set(width, height, depth);
        outline.position.y = height / 2;
        group.add(outline);
        const base = new THREE.Mesh(geometry, floor);
        base.scale.set(width, 0.04, depth);
        group.add(base);
      } else {
        const mesh = new THREE.Mesh(
          geometry,
          box.node.sizePartial ? partialFiles : files,
        );
        mesh.scale.set(...box.size);
        mesh.position.y = height / 2;
        group.add(mesh);
      }
      box.children.forEach((child) => group.add(object(child)));
      return group;
    }
    scene.add(object(layout));
    scene.add(new THREE.AmbientLight('#ffffff', 2));
    const light = new THREE.DirectionalLight('#ffffff', 3);
    light.position.set(10, 20, 12);
    scene.add(light);
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.nodeCount = String(projection.nodes.length + 1);
    container.appendChild(canvas);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    canvas.addEventListener('webglcontextlost', lost);
    function render() {
      if (disposed) return;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Enquadrar a esfera envolvente funciona também em janelas estreitas.
      const radius = Math.hypot(...layout.size) / 2;
      const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
      const angle = Math.min(
        vertical,
        Math.atan(Math.tan(vertical) * camera.aspect),
      );
      const distance = (radius / Math.sin(angle)) * 1.12;
      const target = new THREE.Vector3(0, layout.size[1] / 2, 0);
      camera.position
        .copy(target)
        .add(
          new THREE.Vector3(1.1, 0.9, 1.5).normalize().multiplyScalar(distance),
        );
      camera.far = distance + radius * 3;
      camera.updateProjectionMatrix();
      camera.lookAt(target);
      renderer.render(scene, camera);
    }
    render();
    observer = new ResizeObserver(() => {
      try {
        render();
      } catch {
        dispose();
        onUnavailable();
      }
    });
    observer.observe(container);
    return { dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
