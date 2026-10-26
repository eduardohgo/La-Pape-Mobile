import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
const root = fileURLToPath(new URL('../../../',import.meta.url));
const out=join(root,'docs/actividad4-ci-cd/evidencias'); mkdirSync(out,{recursive:true});
// No hereda DATABASE_URL, tokens ni EXPO_PUBLIC privados. Tampoco carga dotenv.
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SystemRoot|windir|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|ComSpec|PATHEXT|ProgramFiles|PUBLIC)$/i.test(key)));
Object.assign(env,{CI:'1',EXPO_OFFLINE:'1',EXPO_NO_TELEMETRY:'1',EXPO_NO_DOTENV:'1',EXPO_PUBLIC_API_URL:'https://example.invalid',EXPO_PUBLIC_API_ENV:'staging'});
const steps=[
 ['backend-check','backend',['--check','src/server.js']],
 ['backend-test','backend',['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=junit',`--test-reporter-destination=${out}/backend.xml`]],
 ['frontend-lint','frontend',['node_modules/expo/bin/cli','lint','.','--max-warnings=0','--no-cache']],
 ['frontend-typecheck','frontend',['node_modules/typescript/bin/tsc','--noEmit']],
 ['frontend-test-build','frontend',['node_modules/typescript/bin/tsc','--project','tsconfig.test.json']],
 ['frontend-test','frontend',['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=junit',`--test-reporter-destination=${out}/frontend.xml`,'test/http.test.cjs','test/catalog-search.test.cjs','test/storefront-ux.test.cjs']],
 ['integration','frontend',['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=junit',`--test-reporter-destination=${out}/integracion.xml`,'test/health.integration.cjs']],
 ['report-tools','.', ['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=junit',`--test-reporter-destination=${out}/herramientas-ci.xml`,'scripts/ci/test/reportes.test.mjs']],
 ['acceptance-regression','.', ['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=junit',`--test-reporter-destination=${out}/aceptacion-regresion.xml`,'docs/actividad4-ci-cd/scripts/aceptacion-regresion.test.mjs']],
 ['load-local','.', ['docs/actividad4-ci-cd/scripts/carga-local.mjs']],
 ['build-android','frontend',['node_modules/expo/bin/cli','export','--platform','android','--max-workers','2','--output-dir','../docs/actividad4-ci-cd/artefactos/android']],
 ['build-ios','frontend',['node_modules/expo/bin/cli','export','--platform','ios','--max-workers','2','--output-dir','../docs/actividad4-ci-cd/artefactos/ios']],
];
const report={startedUTC:new Date().toISOString(),node:process.version,platform:process.platform,scope:'Ejecuciones locales aisladas; no GitHub Actions',results:[]};
for(const [id,dir,args] of steps) {
  const start=Date.now(); console.log(`Iniciando ${id}`);
  const r=spawnSync(process.execPath,args,{cwd:resolve(root,dir),env,encoding:'utf8',timeout:240000,maxBuffer:16*1024*1024});
  writeFileSync(join(out,`${id}.log`),`${r.stdout??''}\n${r.stderr??''}\n${r.error?.message??''}`);
  report.results.push({id,cwd:dir,executable:process.execPath,args,exitCode:r.status,signal:r.signal,durationMs:Date.now()-start,error:r.error?.message??null});
  writeFileSync(join(out,'ejecuciones.json'),JSON.stringify(report,null,2));
  console.log(`${id}: exit=${r.status} ${Date.now()-start}ms`);
}
report.finishedUTC=new Date().toISOString(); report.passed=report.results.every(r=>r.exitCode===0);
writeFileSync(join(out,'ejecuciones.json'),JSON.stringify(report,null,2));
if(!report.passed) process.exitCode=1;
