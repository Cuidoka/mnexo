import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createServer } from 'vite';

// T-055/T-061: perfil isolado; CDP só no loopback, sem controlar a janela do usuário.
const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = process.env.MNEXO_TEST_BROWSER
  ? [process.env.MNEXO_TEST_BROWSER]
  : [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ];
let browser;
for (const candidate of candidates) {
  try {
    await access(candidate);
    browser = candidate;
    break;
  } catch {
    /* tentar o próximo */
  }
}
if (!browser)
  throw new Error(
    'Defina MNEXO_TEST_BROWSER com o executável Chrome/Chromium/Edge instalado.',
  );
await mkdir(path.join(root, '.tools'), { recursive: true });
const artifacts = await mkdtemp(path.join(root, '.tools', 'scene-webgl-'));
const profile = path.join(artifacts, 'profile');
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
let child, socket, send;
async function until(probe, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await pause(100);
  }
  throw new Error(message);
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
try {
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/tests/browser/scene.html`;
  const args = [
    '--headless',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    `--user-data-dir=${profile}`,
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    '--window-size=1280,1000',
    url,
  ];
  child = spawn(browser, args, {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let launchError;
  child.on('error', (error) => {
    launchError = error;
  });
  const port = await until(async () => {
    if (launchError) throw launchError;
    try {
      return Number(
        (
          await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
        ).split('\n')[0],
      );
    } catch {
      return null;
    }
  }, 'Chrome não iniciou o endpoint local de teste.');
  const pages = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const page = pages.find((item) => item.type === 'page' && item.url === url);
  check(page, 'A página de teste não foi encontrada no perfil isolado.');
  const endpoint = new URL(page.webSocketDebuggerUrl);
  check(
    ['127.0.0.1', 'localhost'].includes(endpoint.hostname),
    'Endpoint CDP fora do loopback.',
  );
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout CDP: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.text +
          ': ' +
          (result.exceptionDetails.exception?.description ?? ''),
      );
    return result.result.value;
  };
  await until(
    () => evaluate("document.getElementById('result')?.dataset.passed"),
    'Harness não terminou.',
  );
  check(
    await evaluate(
      "document.getElementById('result').dataset.passed === 'true' && !!window.sceneTest",
    ),
    await evaluate("document.getElementById('result').textContent"),
  );
  const coords = await evaluate('window.sceneTest.locate()');
  const settle = () =>
    evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))',
    );
  const shot = async () => {
    await settle();
    return Buffer.from(
      (
        await send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
        })
      ).data,
      'base64',
    );
  };
  const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
  await evaluate(
    "document.querySelector('canvas').focus(); window.sceneTest.clear(); window.sceneTest.reset()",
  );
  const baseline = hash(await shot());
  const mouse = (type, x, y, button = 'none', buttons = 0, extra = {}) =>
    send('Input.dispatchMouseEvent', { type, x, y, button, buttons, ...extra });
  const drag = async (button) => {
    await mouse('mousePressed', 580, 430, button, button === 'left' ? 1 : 2, {
      clickCount: 1,
    });
    await mouse('mouseMoved', 640, 470, button, button === 'left' ? 1 : 2);
    await mouse('mouseReleased', 640, 470, button, 0, { clickCount: 1 });
  };
  await drag('left');
  check(hash(await shot()) !== baseline, 'Arrastar não orbitou a câmera.');
  check(
    (await evaluate('window.sceneTest.state()')).selections === 0,
    'Arrasto foi interpretado como seleção.',
  );
  await evaluate('window.sceneTest.reset()');
  await settle();
  await drag('right');
  check(
    hash(await shot()) !== baseline,
    'Botão direito não deslocou a câmera.',
  );
  await evaluate('window.sceneTest.reset()');
  await settle();
  await mouse('mouseWheel', 580, 430, 'none', 0, { deltaX: 0, deltaY: -240 });
  check(hash(await shot()) !== baseline, 'Roda não ajustou o zoom.');
  await evaluate('window.sceneTest.reset()');
  await settle();
  check(hash(await shot()) === baseline, 'Reenquadrar não restaurou a câmera.');
  const click = async (point, count = 1) => {
    await mouse('mousePressed', point.x, point.y, 'left', 1, {
      clickCount: count,
    });
    await mouse('mouseReleased', point.x, point.y, 'left', 0, {
      clickCount: count,
    });
  };
  await click(coords.file);
  check(
    (await evaluate('window.sceneTest.state()')).selected ===
      '00000000-0000-4000-8000-000000000006',
    'Picking não selecionou o UUID do arquivo.',
  );
  await click(coords.folder);
  await click(coords.folder, 2);
  check(
    (await evaluate('window.sceneTest.state()')).opened ===
      '00000000-0000-4000-8000-000000000005',
    'Duplo clique não abriu o UUID da pasta.',
  );
  await evaluate('window.sceneTest.clear()');
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'ArrowLeft',
    code: 'ArrowLeft',
    windowsVirtualKeyCode: 37,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'ArrowLeft',
    code: 'ArrowLeft',
    windowsVirtualKeyCode: 37,
  });
  check(hash(await shot()) !== baseline, 'Teclado não orbitou a câmera.');
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Home',
    code: 'Home',
    windowsVirtualKeyCode: 36,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Home',
    code: 'Home',
    windowsVirtualKeyCode: 36,
  });
  check(hash(await shot()) === baseline, 'Home não reenquadrou a câmera.');
  await click(coords.folder);
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  check(
    (await evaluate('window.sceneTest.state()')).opened ===
      '00000000-0000-4000-8000-000000000005',
    'Enter não entrou na pasta selecionada.',
  );
  await evaluate('window.sceneTest.finish()');
  const screenshot = path.join(artifacts, 'scene.png');
  await writeFile(screenshot, await shot(), { flag: 'wx' });
  await writeFile(
    path.join(artifacts, 'dom.html'),
    await evaluate('document.documentElement.outerHTML'),
    { flag: 'wx' },
  );
  console.log(
    JSON.stringify({
      ...JSON.parse(
        await evaluate("document.getElementById('result').textContent"),
      ),
      screenshot,
      artifacts,
    }),
  );
} finally {
  if (send && socket?.readyState === WebSocket.OPEN) {
    try {
      await send('Browser.close');
    } catch {
      /* o fechamento pode encerrar o socket antes da resposta */
    }
  }
  socket?.close();
  if (child && child.exitCode === null) child.kill();
  await server.close();
}
