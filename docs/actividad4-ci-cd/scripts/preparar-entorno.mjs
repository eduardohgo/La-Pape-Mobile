// Preparación reproducible sin .env, credenciales, cambios de permisos ni servicios externos.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const mode=process.argv[2] ?? '--comprobar';
assert.ok(['--comprobar','--instalar'].includes(mode),'Usar --comprobar o --instalar');
const [major,minor]=process.versions.node.split('.').map(Number);
assert.ok(major>22 || (major===22&&minor>=13),'Node >=22.13; recomiendo Node 22 para paridad con CI');
for(const dir of ['backend','frontend']) {
  assert.ok(existsSync(join(root,dir,'package-lock.json')),`Falta lock ${dir}`);
  const pkg=JSON.parse(readFileSync(join(root,dir,'package.json'),'utf8'));
  assert.ok(pkg.scripts,`Faltan scripts ${dir}`);
}
console.log(`Configuración comprobada con ${process.version}. No se leen archivos .env.`);
if(mode==='--instalar') {
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SystemRoot|windir|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|ComSpec|PATHEXT|ProgramFiles|PUBLIC)$/i.test(k)));
  Object.assign(env,{CI:'1',EXPO_NO_TELEMETRY:'1',EXPO_NO_DOTENV:'1'});
  for(const dir of ['backend','frontend']) {
    const result=process.platform==='win32'
      ? spawnSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm ci --no-audit --no-fund'],{cwd:join(root,dir),env,stdio:'inherit',timeout:240000})
      : spawnSync('npm',['ci','--no-audit','--no-fund'],{cwd:join(root,dir),env,stdio:'inherit',timeout:240000});
    assert.equal(result.status,0,`Falló instalación de ${dir}`);
  }
}
