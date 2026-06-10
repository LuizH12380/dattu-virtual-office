/**
 * Sobe o escritório virtual E um túnel público (localtunnel via npx) para
 * acessar do CELULAR. Uso: `npm run web:publico`
 *
 * IMPORTANTE (limitações honestas):
 *  - O PC precisa ficar LIGADO com este comando rodando — o cérebro (claude -p)
 *    roda aqui. Se fechar, o link no celular para de funcionar.
 *  - O link muda a cada execução.
 *  - localtunnel pode pedir uma "senha" na 1ª visita = o IP público do PC,
 *    que este script imprime no terminal.
 */
const { spawn } = require('child_process');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3050;
const ROOT = path.resolve(__dirname, '..');

function log(msg) { process.stdout.write(`\n[tunnel] ${msg}\n`); }

// 1. Sobe o servidor do escritório
log('Iniciando o escritório virtual...');
const server = spawn('npx', ['ts-node', 'src/server.ts'], {
  cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
});

// 2. Depois de alguns segundos, abre o túnel
setTimeout(() => {
  log('Abrindo túnel público (localtunnel)...');
  const lt = spawn('npx', ['localtunnel', '--port', String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32',
  });

  lt.stdout.on('data', (d) => {
    const out = d.toString();
    process.stdout.write(out);
    if (out.includes('your url is')) {
      log('☝️  Abra esse link no CELULAR.');
      // Mostra o IP público (serve de senha na 1ª visita do localtunnel)
      https.get('https://api.ipify.org', (res) => {
        let ip = '';
        res.on('data', (c) => { ip += c; });
        res.on('end', () => log(`Se pedir senha/"endpoint IP", use: ${ip}`));
      }).on('error', () => {});
    }
  });

  lt.on('close', () => { log('Túnel fechado.'); server.kill(); process.exit(0); });
}, 6000);

process.on('SIGINT', () => { server.kill(); process.exit(0); });
