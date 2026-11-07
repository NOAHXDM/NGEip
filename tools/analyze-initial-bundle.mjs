import { readFile } from 'node:fs/promises';

// 比較本專案 application builder 的 esbuild metafile。
// 從 main、polyfills 與 styles 輸出沿靜態 import 追蹤，排除 lazy chunks。
// 用法：node tools/analyze-initial-bundle.mjs <升級前 stats.json> <升級後 stats.json>
const paths = process.argv.slice(2);
if (paths.length !== 2) {
  throw new Error('請提供升級前與升級後兩份 stats.json 路徑');
}

function summarize(stats) {
  const outputs = stats.outputs;
  const roots = Object.keys(outputs).filter((name) => /^(main|polyfills|styles)-/.test(name));
  if (roots.length !== 3) throw new Error('預期 main、polyfills、styles 三個入口，請核對 build 設定');
  const initial = new Set();
  function visit(name) {
    if (initial.has(name) || !outputs[name]) return;
    initial.add(name);
    for (const dependency of outputs[name].imports) {
      if (dependency.kind !== 'dynamic-import' && !dependency.external) visit(dependency.path);
    }
  }
  roots.forEach(visit);
  const packages = {};
  let attributedBytes = 0;
  for (const name of initial) {
    for (const [source, input] of Object.entries(outputs[name].inputs)) {
      const segments = source.split('node_modules/').at(-1).split('/');
      const pkg = source.includes('node_modules/')
        ? segments.slice(0, segments[0].startsWith('@') ? 2 : 1).join('/')
        : 'app/styles';
      packages[pkg] = (packages[pkg] ?? 0) + input.bytesInOutput;
      attributedBytes += input.bytesInOutput;
    }
  }
  const initialBytes = [...initial].reduce((sum, name) => sum + outputs[name].bytes, 0);
  return { initialBytes, unattributedBytes: initialBytes - attributedBytes, packages };
}

const [baseline, upgraded] = await Promise.all(paths.map(async (path) =>
  summarize(JSON.parse(await readFile(path, 'utf8')))
));
const contributions = [...new Set([...Object.keys(baseline.packages), ...Object.keys(upgraded.packages)])]
  .map((name) => ({
    name,
    baselineBytes: baseline.packages[name] ?? 0,
    upgradedBytes: upgraded.packages[name] ?? 0,
    deltaBytes: (upgraded.packages[name] ?? 0) - (baseline.packages[name] ?? 0),
  }))
  .sort((a, b) => Math.abs(b.deltaBytes) - Math.abs(a.deltaBytes));
console.log(JSON.stringify({
  baselineInitialBytes: baseline.initialBytes,
  upgradedInitialBytes: upgraded.initialBytes,
  deltaBytes: upgraded.initialBytes - baseline.initialBytes,
  unattributedDeltaBytes: upgraded.unattributedBytes - baseline.unattributedBytes,
  contributions,
}, null, 2));
