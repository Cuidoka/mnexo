import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneProjection } from '../../shared/api/scene';
import { layoutScene, type SceneBox } from './scene-layout';

export interface SceneSession {
  dispose: () => void;
  setSelection: (id: string | null) => void;
  zoom: (factor: number) => void;
  orbit: (angle: number) => void;
  resetView: () => void;
}
export interface SceneActions {
  onSelect?: (id: string | null) => void;
  onOpen?: (id: string) => void;
}

// RF-004 / T-058/T-059: controles e picking preservam a identidade do catálogo.
export function mountScene(
  container: HTMLElement,
  projection: SceneProjection,
  onUnavailable: () => void,
  actions: SceneActions = {},
): SceneSession {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c171e');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(geometry);
  const folders = new THREE.LineBasicMaterial({ color: '#81d8cc' });
  const partialEdges = new THREE.LineBasicMaterial({ color: '#edbc7a' });
  const floor = new THREE.MeshLambertMaterial({ color: '#234a50' });
  const files = new THREE.MeshLambertMaterial({ color: '#98b8f8' });
  const partialFiles = new THREE.MeshLambertMaterial({ color: '#edbc7a' });
  const selectedLine = new THREE.LineBasicMaterial({ color: '#fff3a1' });
  const selectedFile = new THREE.MeshLambertMaterial({ color: '#fff3a1' });
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.autoRotate = false;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI - 0.05;
  const objects = new Map<
    string,
    {
      kind: string;
      visual: THREE.Mesh | THREE.LineSegments;
      material: THREE.Material;
    }
  >();
  const targets: THREE.Object3D[] = [];
  const raycaster = new THREE.Raycaster();
  let selected: string | null = null;
  let lastHit: string | null = null;
  let disposed = false;
  let observer: ResizeObserver | undefined;
  let fitDistance = 1;
  let radius = 1;
  const activePointers = new Set<number>();
  let gesture: { id: number; x: number; y: number; moved: boolean } | null =
    null;
  let suppressClick = false;

  function draw() {
    if (!disposed) renderer.render(scene, camera);
  }
  function safeDraw() {
    try {
      draw();
    } catch {
      dispose();
      onUnavailable();
    }
  }
  function setSelection(id: string | null) {
    const previous = selected === null ? undefined : objects.get(selected);
    if (previous) previous.visual.material = previous.material;
    selected = id !== null && objects.has(id) ? id : null;
    const item = selected === null ? undefined : objects.get(selected);
    if (item)
      item.visual.material =
        item.kind === 'folder' ? selectedLine : selectedFile;
    safeDraw();
  }
  function pick(event: MouseEvent): string | null {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster.intersectObjects(targets, false)[0];
    const id: unknown = hit?.object.userData.nodeId;
    return typeof id === 'string' && objects.has(id) ? id : null;
  }
  function click(event: MouseEvent) {
    if (disposed || suppressClick || event.button !== 0) return;
    const id = pick(event);
    lastHit = id;
    if (id !== selected) {
      setSelection(id);
      actions.onSelect?.(id);
    }
  }
  function open(id: string | null) {
    if (
      id !== null &&
      id !== projection.root.node.id &&
      objects.get(id)?.kind === 'folder'
    )
      actions.onOpen?.(id);
  }
  function doubleClick(event: MouseEvent) {
    if (!disposed && !suppressClick && event.button === 0) {
      const id = pick(event);
      if (id === lastHit) open(id);
    }
  }
  function down(event: PointerEvent) {
    activePointers.add(event.pointerId);
    if (activePointers.size === 1) {
      suppressClick = false;
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      canvas.focus({ preventScroll: true });
    } else {
      suppressClick = true;
      if (gesture) gesture.moved = true;
    }
  }
  function move(event: PointerEvent) {
    if (
      gesture?.id === event.pointerId &&
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5
    )
      gesture.moved = true;
  }
  function up(event: PointerEvent) {
    if (gesture?.id === event.pointerId) {
      suppressClick ||= gesture.moved;
      gesture = null;
    }
    activePointers.delete(event.pointerId);
  }
  function cancel() {
    gesture = null;
    activePointers.clear();
    suppressClick = true;
  }
  function zoom(factor: number) {
    if (disposed || !Number.isFinite(factor) || factor <= 0) return;
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(
      THREE.MathUtils.clamp(
        offset.length() * factor,
        controls.minDistance,
        controls.maxDistance,
      ),
    );
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }
  function rotate(horizontal: number, vertical = 0) {
    if (disposed) return;
    const spherical = new THREE.Spherical().setFromVector3(
      camera.position.clone().sub(controls.target),
    );
    spherical.theta += horizontal;
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi + vertical,
      controls.minPolarAngle,
      controls.maxPolarAngle,
    );
    camera.position
      .copy(controls.target)
      .add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
  }
  function pan(x: number, y: number) {
    const distance = camera.position.distanceTo(controls.target) * 0.08;
    const offset = new THREE.Vector3()
      .setFromMatrixColumn(camera.matrix, 0)
      .multiplyScalar(x * distance)
      .add(
        new THREE.Vector3()
          .setFromMatrixColumn(camera.matrix, 1)
          .multiplyScalar(y * distance),
      );
    controls.target.add(offset);
    camera.position.add(offset);
    controls.update();
  }
  function key(event: KeyboardEvent) {
    if (disposed || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.startsWith('Arrow')) {
      if (event.shiftKey)
        pan(
          event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0,
          event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0,
        );
      else
        rotate(
          event.key === 'ArrowLeft'
            ? -0.15
            : event.key === 'ArrowRight'
              ? 0.15
              : 0,
          event.key === 'ArrowUp'
            ? -0.12
            : event.key === 'ArrowDown'
              ? 0.12
              : 0,
        );
    } else if (event.key === '+' || event.key === '=') zoom(0.8);
    else if (event.key === '-') zoom(1.25);
    else if (event.key === 'Home') resetView();
    else if (event.key === 'Enter') open(selected);
    else if (event.key === 'Escape') {
      setSelection(null);
      actions.onSelect?.(null);
    } else return;
    event.preventDefault();
  }
  function resetView() {
    if (disposed) return;
    controls.target.set(0, layout.size[1] / 2, 0);
    camera.position
      .copy(controls.target)
      .add(
        new THREE.Vector3(1.1, 0.9, 1.5)
          .normalize()
          .multiplyScalar(fitDistance),
      );
    controls.update();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    controls.removeEventListener('change', safeDraw);
    controls.dispose();
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('click', click);
    canvas.removeEventListener('dblclick', doubleClick);
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('keydown', key);
    canvas.ownerDocument.removeEventListener('pointermove', move, true);
    canvas.ownerDocument.removeEventListener('pointerup', up, true);
    canvas.ownerDocument.removeEventListener('pointercancel', cancel, true);
    geometry.dispose();
    edges.dispose();
    [
      folders,
      partialEdges,
      floor,
      files,
      partialFiles,
      selectedLine,
      selectedFile,
    ].forEach((material) => material.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  function lost(event: Event) {
    event.preventDefault();
    dispose();
    onUnavailable();
  }
  const layout = layoutScene(projection);
  try {
    function object(box: SceneBox): THREE.Group {
      const group = new THREE.Group();
      group.userData.nodeId = box.node.id;
      group.position.set(...box.position);
      const [width, height, depth] = box.size;
      let visual: THREE.Mesh | THREE.LineSegments;
      let material: THREE.Material;
      if (box.node.kind === 'folder') {
        material = box.node.sizePartial ? partialEdges : folders;
        visual = new THREE.LineSegments(edges, material);
        visual.scale.set(width, height, depth);
        visual.position.y = height / 2;
        const base = new THREE.Mesh(geometry, floor);
        base.scale.set(width, 0.04, depth);
        base.userData.nodeId = box.node.id;
        group.add(base);
        targets.push(base);
      } else {
        material = box.node.sizePartial ? partialFiles : files;
        visual = new THREE.Mesh(geometry, material);
        visual.scale.set(...box.size);
        visual.position.y = height / 2;
      }
      visual.userData.nodeId = box.node.id;
      objects.set(box.node.id, { kind: box.node.kind, visual, material });
      group.add(visual);
      targets.push(visual);
      box.children.forEach((child) => group.add(object(child)));
      return group;
    }
    scene.add(object(layout));
    scene.add(new THREE.AmbientLight('#ffffff', 2));
    const light = new THREE.DirectionalLight('#ffffff', 3);
    light.position.set(10, 20, 12);
    scene.add(light);
    canvas.tabIndex = 0;
    canvas.setAttribute(
      'aria-label',
      'Área 3D interativa. Setas giram; Shift e setas deslocam; mais e menos ajustam zoom; Home reenquadra; Enter entra na pasta selecionada.',
    );
    canvas.dataset.nodeCount = String(projection.nodes.length + 1);
    container.appendChild(canvas);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    controls.addEventListener('change', safeDraw);
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('click', click);
    canvas.addEventListener('dblclick', doubleClick);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('keydown', key);
    canvas.ownerDocument.addEventListener('pointermove', move, true);
    canvas.ownerDocument.addEventListener('pointerup', up, true);
    canvas.ownerDocument.addEventListener('pointercancel', cancel, true);
    function resize() {
      if (disposed) return;
      const ratio = camera.position.distanceTo(controls.target) / fitDistance;
      const width = Math.max(1, container.clientWidth),
        height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      radius = Math.hypot(...layout.size) / 2;
      raycaster.params.Line.threshold = Math.max(0.025, radius * 0.004);
      const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
      const angle = Math.min(
        vertical,
        Math.atan(Math.tan(vertical) * camera.aspect),
      );
      fitDistance = (radius / Math.sin(angle)) * 1.12;
      controls.minDistance = Math.max(0.2, radius * 0.12);
      controls.maxDistance = Math.max(fitDistance * 4, radius * 12);
      camera.far = controls.maxDistance + radius * 4;
      camera.updateProjectionMatrix();
      if (initialized) {
        const direction = camera.position
          .clone()
          .sub(controls.target)
          .normalize();
        camera.position
          .copy(controls.target)
          .add(
            direction.multiplyScalar(
              THREE.MathUtils.clamp(
                fitDistance * ratio,
                controls.minDistance,
                controls.maxDistance,
              ),
            ),
          );
        controls.update();
      } else {
        initialized = true;
        resetView();
      }
      draw();
    }
    let initialized = false;
    resize();
    observer = new ResizeObserver(() => {
      try {
        resize();
      } catch {
        dispose();
        onUnavailable();
      }
    });
    observer.observe(container);
    return {
      dispose,
      setSelection,
      zoom,
      orbit: (angle) => rotate(angle),
      resetView,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
