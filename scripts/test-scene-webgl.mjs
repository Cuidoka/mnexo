import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

// T-055: navegador isolado, somente harness/fixture sintética no loopback.
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
const screenshot = path.join(artifacts, 'scene.png');
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
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
    `--user-data-dir=${path.join(artifacts, 'profile')}`,
    '--window-size=1280,1000',
    '--virtual-time-budget=7000',
    `--screenshot=${screenshot}`,
    '--dump-dom',
    url,
  ];
  const dom = await new Promise((resolve, reject) => {
    const child = spawn(browser, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Timeout no teste WebGL (45 s).'));
    }, 45000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `Chrome encerrou com código ${code}. ${stderr.slice(-1500)}`,
          ),
        );
    });
  });
  await writeFile(path.join(artifacts, 'dom.html'), dom, { flag: 'wx' });
  const match = dom.match(/<pre id="result"[^>]*>(.*?)<\/pre>/s);
  if (!match) throw new Error(`Harness não respondeu. Evidência: ${artifacts}`);
  const result = JSON.parse(
    match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
  );
  console.log(JSON.stringify({ ...result, screenshot, artifacts }));
  if (!result.passed) process.exitCode = 1;
} finally {
  await server.close();
}
