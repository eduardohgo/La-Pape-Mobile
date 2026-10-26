// Auditoría local sin carga ni comunicaciones de red. Usa una lista explícita de publicación.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, relative, dirname, sep } from 'node:path';
const base=fileURLToPath(new URL('../',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const staged=process.argv[2]==='--indice';
assert.ok(process.argv.length<=3 && (!process.argv[2]||staged),'Usar sin argumentos o --indice');
const json=p=>JSON.parse(readFileSync(resolve(base,p),'utf8').replace(/^\uFEFF/,''));
const files=json('config/archivos-publicables.json').files;
assert.equal(new Set(files).size,files.length,'Lista duplicada');
const problems=[];const records=[];
const patterns={
  privateKey:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  token:/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{24,})\b/,
  email:/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
  personalPath:/(?:[A-Z]:[\\/]+Users[\\/]+[^\\/\s"]+|\/Users\/[^/\s"]+|\/home\/(?!runner\b)[^/\s"]+)/i,
  credentialURI:/\b(?:postgres(?:ql)?|https?)\x3a\/\/[^/\s:@]+:[^@\s/]+@/i,
  jwt:/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/,
};
for(const rel of files) {
  assert.ok(!rel.startsWith('/')&&!rel.includes('..')&&!rel.includes('\\')&&!/^[a-z]:/i.test(rel),`Ruta inválida: ${rel}`);
  assert.ok(!/(^|\/)(node_modules|artefactos|qa|local-publicacion|backups?|\.env[^/]*)(\/|$)|\.(pdf|png|jpg|jpeg|zip|hbc|aab|apk|ipa|pem|key|p12|dump|backup)$/i.test(rel),`Archivo excluido: ${rel}`);
  assert.ok(!/rubrica|catalogo-comercial|003_identity/i.test(rel),`Fuera de alcance: ${rel}`);
  const path=resolve(base,rel);assert.ok(existsSync(path),`Falta ${rel}`);assert.ok(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),`Tipo inválido ${rel}`);
  const bytes=readFileSync(path),text=bytes.toString('utf8');assert.ok(!bytes.includes(0),`Binario ${rel}`);
  for(const [kind,regex] of Object.entries(patterns)) if(regex.test(text))problems.push({file:rel,kind});
  if(rel.endsWith('.md')) {
    for(const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const link=match[1];if(/^(https?:|mailto:|#)/.test(link))continue;
      const target=resolve(dirname(path),decodeURIComponent(link.split('#')[0]));
      assert.ok(target===root.slice(0,-1)||target.startsWith(root),`Enlace fuera del repositorio en ${rel}`);
      assert.ok(existsSync(target),`Enlace roto en ${rel}: ${link}`);
      if(target.startsWith(base))assert.ok(files.includes(relative(base,target).split(sep).join('/')),`Enlace a archivo excluido en ${rel}`);
    }
  }
  if(rel!=='evidencias/auditoria-publicacion.json')records.push({file:rel,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
assert.equal(problems.length,0,`No publicar: hallazgos en ${JSON.stringify(problems)}. Solo se muestran rutas y categorías.`);
const load=readFileSync(resolve(base,'scripts/carga-local.mjs'),'utf8');
for(const guard of [".listen(0,'127.0.0.1')","redirect:'error'",'totalMax:77','concurrencyMax:2','globalDeadlineMs:15000',"assert.equal(config.database,null)","assert.equal(config.catalogApiEnabled,false)"])
  assert.ok(load.includes(guard),`Falta guardia local: ${guard}`);
assert.ok(!/process\.(?:env|argv)/.test(load),'La carga no debe admitir destino del entorno o CLI');
const yaml=readFileSync(resolve(base,'config/liberacion-local.ejemplo.yml'),'utf8');
assert.ok(yaml.includes('contents: read')&&!/secrets\.|eas (?:submit|update|build)|environment:/i.test(yaml),'Ejemplo debe permanecer sin deploy o secretos');
assert.ok(!files.some(f=>f.startsWith('.github/')));
const eas=json('config/eas.ejemplo.json');assert.deepEqual(Object.keys(eas.build),['preview']);assert.ok(!eas.submit);assert.equal(eas.build.preview.env.EXPO_PUBLIC_API_URL,'https://example.invalid');
if(staged) {
  const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(r.status,0,'Falló consulta local de Git');return r.stdout;};
  const names=git(['diff','--cached','--name-only','-z']).split('\0').filter(Boolean).sort();
  const expected=files.map(f=>'docs/actividad4-ci-cd/'+f).sort();assert.deepEqual(names,expected,'El índice debe contener exactamente la lista autorizada');
  for(const path of expected){const disk=readFileSync(resolve(root,path));const index=spawnSync('git',['show',':'+path],{cwd:root,maxBuffer:8*1024*1024});assert.equal(index.status,0);assert.ok(disk.equals(index.stdout),`Índice distinto al archivo auditado: ${path}`);}
  git(['diff','--cached','--check']);
  console.log(`Índice comprobado: ${names.length} archivos, sin archivos extra ni diferencias de bytes.`);
} else {
  writeFileSync(resolve(base,'evidencias/auditoria-publicacion.json'),JSON.stringify({checkedUTC:new Date().toISOString(),scope:'Selección pública de Actividad 4; resultados locales, no ejecución de Actions',files:files.length,patternsChecked:Object.keys(patterns),findings:0,localLinksValid:true,loadTargetFixedLoopback:true,loadLimits:{requests:77,concurrency:2,deadlineMs:15000},inactiveExamples:true,excluded:'PDFs, capturas, rúbrica, originales privados, bundles, node_modules, .env y archivos ajenos a esta actividad',records},null,2)+'\n');
  console.log(`Auditoría correcta: ${files.length} archivos, sin hallazgos en la selección; enlaces locales válidos y carga fijada a loopback.`);
}
