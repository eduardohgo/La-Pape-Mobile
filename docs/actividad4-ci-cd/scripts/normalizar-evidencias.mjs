// Normaliza únicamente rutas del equipo. Conserva los originales fuera de la selección pública.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const base=fileURLToPath(new URL('../',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/[\\/]$/,'');
const targets=['backend.xml','frontend.xml','integracion.xml','herramientas-ci.xml','aceptacion-regresion.xml','ejecuciones.json'].map(n=>'evidencias/'+n);
const sha=b=>createHash('sha256').update(b).digest('hex');
const recordFile=resolve(base,'evidencias/normalizacion-publica.json');
const prior=existsSync(recordFile)?JSON.parse(readFileSync(recordFile,'utf8').replace(/^\uFEFF/,'')):{};
const previous=prior.files??[];
const records=new Map(previous.map(r=>[r.path,r]));
for(const rel of targets) {
  const path=resolve(base,rel);if(!existsSync(path))continue;
  const original=readFileSync(path);let text=original.toString('utf8').replace(/^\uFEFF/,'');
  if(rel.endsWith('.xml')) {
    for(const prefix of [root+'\\',root+'/',root.replaceAll('\\','/')+'/'])text=text.split(prefix).join('');
    text=text.replace(/file="([^"]+)"/g,(_m,p)=>`file="${p.replaceAll('\\','/')}"`);
  } else {
    const value=JSON.parse(text);
    const needsEdit=value.results.some(r=>r.executable!=='node'||r.args.some(a=>a.includes(root)||a.includes(root.replaceAll('\\','/'))));
    if(!needsEdit)continue;
    for(const row of value.results) {
      row.executable='node';
      row.args=row.args.map(a=>a.split(root).join('${WORKTREE}').split(root.replaceAll('\\','/')).join('${WORKTREE}'));
    }
    value.publicNormalization='Se normalizaron únicamente el ejecutable y las rutas absolutas del worktree; fechas, duraciones, argumentos restantes y resultados se conservan. Ver normalizacion-publica.json.';
    text=JSON.stringify(value,null,2)+'\n';
  }
  if(original.equals(Buffer.from(text)))continue;
  const backup=resolve(base,'local-publicacion/originales',sha(original),rel);mkdirSync(dirname(backup),{recursive:true});
  if(!existsSync(backup))writeFileSync(backup,original);
  writeFileSync(path,text);
  records.set(rel,{path:rel,originalSHA256:sha(original),publicSHA256:sha(Buffer.from(text)),edit:'Rutas locales normalizadas. Resultados y mediciones sin cambios.'});
}
writeFileSync(recordFile,JSON.stringify({...prior,purpose:'Eliminar identificadores del equipo de la versión pública sin modificar resultados. Los originales se conservan solo localmente y no se publican.',files:[...records.values()]},null,2)+'\n');
console.log('Normalización completada. No se modificaron resultados, tiempos ni casos de prueba.');
