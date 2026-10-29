const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.dirname(require.resolve('../package.json'));
const destination = path.join(root, 'coverage', 'caja-blanca');
fs.mkdirSync(destination, { recursive: true });
const compile = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--project', 'tsconfig.test.json'], { cwd: root, encoding: 'utf8' });
if (compile.error) throw compile.error;
if (compile.status !== 0) {
  process.stderr.write(compile.stdout + compile.stderr);
  process.exit(compile.status ?? 1);
}
const files = fs.readdirSync(path.join(root, 'test')).filter(file => file.endsWith('.test.cjs')).sort().map(file => `test/${file}`);
const command = [
  '--test', '--experimental-test-coverage', '--test-coverage-include=.test-build/**/*.js',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=./test/support/coverage-reporter.cjs', `--test-reporter-destination=${path.join(destination, 'eventos.jsonl')}`,
  ...files,
];
const result = spawnSync(process.execPath, command, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (result.error) throw result.error;
fs.writeFileSync(path.join(destination, 'ejecucion.txt'), result.stdout + result.stderr);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
const events = fs.readFileSync(path.join(destination, 'eventos.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const coverage = events.filter(event => event.type === 'test:coverage').map(event => event.data);
const sourceFiles = fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter(file => /\.(ts|tsx)$/.test(file)).map(file => `src/${file.replaceAll(path.sep, '/')}`);
const summary = coverage.at(-1)?.summary;
if (!summary) throw new Error('Coverage summary missing; do not accredit coverage');
const catalogFiles = summary.files.filter(file => file.path.includes(`${path.sep}features${path.sep}catalogo${path.sep}`));
function aggregate(files) {
  const counts = Object.fromEntries(['totalLineCount', 'coveredLineCount', 'totalBranchCount', 'coveredBranchCount', 'totalFunctionCount', 'coveredFunctionCount']
    .map(key => [key, files.reduce((total, file) => total + file[key], 0)]));
  return { ...counts,
    lines: 100 * counts.coveredLineCount / counts.totalLineCount,
    branches: 100 * counts.coveredBranchCount / counts.totalBranchCount,
    functions: 100 * counts.coveredFunctionCount / counts.totalFunctionCount,
  };
}
const measuredSources = summary.files.map(file => path.relative(root, file.path).replaceAll(path.sep, '/').replace(/^\.test-build\//, 'src/').replace(/\.js$/, '.ts'));
const measurements = { catalog: aggregate(catalogFiles), executedCompiledSubset: aggregate(summary.files), globalApplication: null };
const uncovered = summary.files.map(file => ({
  compiledFile: path.relative(root, file.path).replaceAll(path.sep, '/'),
  lines: file.lines.filter(line => line.count === 0).map(line => line.line),
  branches: file.branches.filter(branch => branch.count === 0),
  functions: file.functions.filter(fn => fn.count === 0),
})).filter(file => file.lines.length || file.branches.length || file.functions.length);
fs.writeFileSync(path.join(destination, 'resultado.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), node: process.version, command: [process.execPath, ...command],
  exitCode: result.status, testFiles: files, summaries: events.filter(event => event.type === 'test:summary').map(event => event.data),
  coverage, sourceFiles, measurements, uncovered,
  unmeasuredSourceFiles: sourceFiles.filter(file => !measuredSources.includes(file)),
  scope: 'Executed compiled files under .test-build only; NOT global application coverage. SSR hooks do not mount or run effects.',
  mappedTypeScriptCoverage: false,
}, null, 2) + '\n');
process.exitCode = result.status ?? 1;
