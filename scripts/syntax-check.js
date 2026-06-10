// Parses every source file (CJS main-process files directly, ESM renderer
// files via temporary .mjs copies) so broken syntax never reaches a commit.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const cjs = ['src/main/main.js', 'src/main/preload.js', 'src/main/streamer.js', 'src/main/projects.js'];
const esmDirs = ['src/renderer/js'];

let failed = 0;

function check(file, asEsm) {
  let target = path.join(root, file);
  let tmp = null;
  if (asEsm) {
    tmp = path.join(os.tmpdir(), 'chase-check-' + file.replace(/[\\/]/g, '_') + '.mjs');
    fs.copyFileSync(target, tmp);
    target = tmp;
  }
  try {
    execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
    console.log('  ok  ' + file);
  } catch (e) {
    failed++;
    console.error('FAIL  ' + file + '\n' + e.stderr.toString());
  } finally {
    if (tmp) fs.unlinkSync(tmp);
  }
}

for (const f of cjs) check(f, false);
for (const dir of esmDirs) {
  const walk = (d) => {
    for (const entry of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = d + '/' + entry.name;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) check(rel, true);
    }
  };
  walk(dir);
}

console.log(failed ? `\n${failed} file(s) failed` : '\nAll source files parse cleanly.');
process.exit(failed ? 1 : 0);
