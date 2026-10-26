import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
const base=fileURLToPath(new URL('../',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const get=name=>JSON.parse(readFileSync(join(base,'evidencias',name),'utf8').replace(/^\uFEFF/,''));
const run=get('ejecuciones.json'), retry=get('reintento-carga.json'), load=get('carga-local.json');
assert.ok(run.finishedUTC,'Ejecución incompleta');
assert.equal(run.results.length,12);
assert.ok(run.results.every(r=>r.exitCode===0 || (r.id==='load-local' && retry.exitCode===0 && load.passed)), 'Hay verificaciones pendientes o fallidas');
assert.ok(load.passed);
const files=[];
function walk(dir) {
  for(const item of readdirSync(dir,{withFileTypes:true})) {
    const path=join(dir,item.name);
    assert.ok(!item.isSymbolicLink(),'No se admiten enlaces');
    if(item.isDirectory()) walk(path);
    else {
      assert.ok(!/(^|[\\/])\.env|\.(pem|key|p12|jks)$/i.test(path),'No empaquetar secretos');
      const bytes=readFileSync(path);
      files.push({path:relative(base,path).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  }
}
for(const platform of ['android','ios']) {
  assert.ok(existsSync(join(base,'artefactos',platform,'metadata.json')),`Falta ${platform}`);
  walk(join(base,'artefactos',platform));
}
assert.ok(files.some(f=>f.path.endsWith('.hbc')),'Falta bytecode móvil');
const plan={timestampUTC:new Date().toISOString(),baseSHA:'14a33cd5a508c263f77c15a5237ae4033dddd072',
  kind:'Ensayo local de preparación de artefacto; NO APK/IPA, NO despliegue',deployExecuted:false,publicationExecuted:false,
  verification:{baseline:'ejecuciones.json',loadRetry:'reintento-carga.json',passed:true},
  stages:[['Código','base develop local'],['Build','bundles Android e iOS locales'],['Análisis estático','local y CI existente'],['Unitarias','local y CI existente'],['Integración','HTTP local y CI existente'],['Aceptación','contrato y lógica locales; E2E propuesto'],['Regresión','local'],['Rendimiento','loopback local'],['Preparación de artefacto','manifiesto SHA256 local'],['Staging','PROPUESTO NO EJECUTADO'],['Aprobación','PENDIENTE revisión humana'],['Producción','PROPUESTO NO EJECUTADO'],['Monitoreo','PROPUESTO en servicio real']],
  files};
writeFileSync(join(base,'evidencias','liberacion-local.json'),JSON.stringify(plan,null,2));
console.log(`Validación local correcta: ${files.length} archivos, ${files.reduce((n,f)=>n+f.bytes,0)} bytes. Staging y producción NO EJECUTADOS.`);
