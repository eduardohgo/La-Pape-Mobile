// Sin URL de entrada: el destino siempre es un listener nuevo de loopback.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { createApp } from '../../../backend/src/app.js';
import { loadConfig } from '../../../backend/src/config/variables-entorno.js';
import { stopServer } from '../../../backend/src/server.js';
const output = new URL('../evidencias/carga-local.json', import.meta.url);
const report = { timestampUTC:new Date().toISOString(), node:process.version, platform:process.platform,
  scope:'Solo Express local /health, sin BD; no acredita producción ni capacidad máxima',
  limits:{ totalMax:77, concurrencyMax:2, globalDeadlineMs:15000, requestTimeoutMs:1000 }, phases:[] };
const deadline = performance.now()+15000;
const watchdog = setTimeout(()=>{ console.error('Límite global 15 segundos'); process.exit(1); },15000);
watchdog.unref();
async function phase(name, count, concurrency, env={}) {
  const config = loadConfig({NODE_ENV:'test', ...env});
  assert.equal(config.database,null);
  assert.equal(config.catalogApiEnabled,false);
  const server = createApp(config).listen(0,'127.0.0.1');
  await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const samples=[];
  let index=0;
  const loop=monitorEventLoopDelay({resolution:10}); loop.enable();
  const cpu=process.cpuUsage(), before=process.memoryUsage().rss, start=performance.now();
  async function request(label) {
    assert.ok(performance.now()<deadline,'Plazo global excedido');
    const started=performance.now();
    try {
      const r=await fetch(`${base}/health`, {redirect:'error',signal:AbortSignal.timeout(1000)});
      const body=await r.json();
      const valid=r.status===200 ? body.ok===true && Number.isSafeInteger(body.ts) : r.status===429 && typeof body.error==='string';
      const sample={label,status:r.status,valid,ms:performance.now()-started}; samples.push(sample); return sample;
    } catch(e) { const s={label,status:0,valid:false,ms:performance.now()-started,error:e.name}; samples.push(s); return s; }
  }
  let recovery=null;
  try {
    if(name==='rendimiento') for(let i=0;i<4;i++) await request('warmup');
    await Promise.all(Array.from({length:concurrency},async()=>{ while(index<count) { const n=index++; await request(`request-${n+1}`); } }));
    if(name==='esfuerzo-limitador') { await new Promise(r=>setTimeout(r,1100)); recovery=await request('recovery'); }
  } finally { loop.disable(); await stopServer(server); }
  const measured=samples.filter(s=>s.label.startsWith('request-'));
  const sorted=measured.map(s=>s.ms).sort((a,b)=>a-b);
  const q=p=>sorted[Math.ceil(sorted.length*p)-1];
  const statuses=Object.fromEntries([...new Set(measured.map(s=>s.status))].map(code=>[code,measured.filter(s=>s.status===code).length]));
  const passed=name!=='esfuerzo-limitador' ? measured.length===count && measured.every(s=>s.status===200&&s.valid) && q(.95)<250
    : measured.length===count && measured.every(s=>[200,429].includes(s.status)&&s.valid) && statuses[429]>0 && recovery?.status===200 && recovery.valid;
  const elapsedMs=performance.now()-start;
  report.phases.push({name,requests:count,concurrency,rateLimitMax:config.rateLimitMax,windowMs:config.rateLimitWindowMs,
    elapsedMs,p50Ms:q(.5),p95Ms:q(.95),maxMs:sorted.at(-1), measuredRps:count/elapsedMs*1000,
    statuses,recovery,cpuMicros:process.cpuUsage(cpu),rssBeforeBytes:before,rssAfterBytes:process.memoryUsage().rss,
    eventLoopP95Ms:loop.percentile(95)/1e6,passed,samples});
  assert.ok(passed,`${name}: no cumple criterio`);
}
try {
  await phase('rendimiento',40,2);
  await phase('esfuerzo-limitador',30,2,{ RATE_LIMIT_MAX:'10',RATE_LIMIT_WINDOW_MS:'1000' });
  // Listener nuevo y limitador restablecido; verifica salud después del esfuerzo.
  await phase('regresion-posterior',2,1);
  report.passed=true;
} catch(e) { report.passed=false; report.error=e.message; process.exitCode=1; }
finally { clearTimeout(watchdog); writeFileSync(output,JSON.stringify(report,null,2)); }
console.log(JSON.stringify(report.phases.map(({samples,...p})=>p),null,2));
