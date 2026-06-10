// Project + template persistence. Projects are plain JSON (.chasestudio),
// templates are the same shape minus user media references (.cstemplate).
const { dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');

const RECENT_FILE = () => path.join(app.getPath('userData'), 'recent.json');

function rememberRecent(p) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(RECENT_FILE(), 'utf8')); } catch {}
  list = [p, ...list.filter((x) => x !== p)].slice(0, 8);
  try { fs.writeFileSync(RECENT_FILE(), JSON.stringify(list)); } catch {}
}

function recent() {
  try {
    const list = JSON.parse(fs.readFileSync(RECENT_FILE(), 'utf8'));
    return list.filter((p) => fs.existsSync(p)).map((p) => ({ path: p, name: path.basename(p, '.chasestudio') }));
  } catch { return []; }
}

async function save(win, json, currentPath) {
  let target = currentPath;
  if (!target) {
    const r = await dialog.showSaveDialog(win, {
      title: 'Save project',
      defaultPath: path.join(app.getPath('documents'), (json.meta?.name || 'studio-project') + '.chasestudio'),
      filters: [{ name: 'Chase Studio project', extensions: ['chasestudio'] }]
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  await fs.promises.writeFile(target, JSON.stringify(json, null, 2));
  rememberRecent(target);
  return target;
}

async function open(win) {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open project',
    properties: ['openFile'],
    filters: [{ name: 'Chase Studio project', extensions: ['chasestudio'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return openPath(r.filePaths[0]);
}

async function openPath(p) {
  try {
    const json = JSON.parse(await fs.promises.readFile(p, 'utf8'));
    rememberRecent(p);
    return { path: p, json };
  } catch (e) {
    return { error: 'Could not open project: ' + e.message };
  }
}

async function exportTemplate(win, json) {
  const r = await dialog.showSaveDialog(win, {
    title: 'Export scene template',
    defaultPath: path.join(app.getPath('documents'), (json.meta?.name || 'scene') + '.cstemplate'),
    filters: [{ name: 'Chase Studio template', extensions: ['cstemplate'] }]
  });
  if (r.canceled || !r.filePath) return null;
  await fs.promises.writeFile(r.filePath, JSON.stringify(json, null, 2));
  return r.filePath;
}

async function importTemplate(win) {
  const r = await dialog.showOpenDialog(win, {
    title: 'Import scene template',
    properties: ['openFile'],
    filters: [{ name: 'Chase Studio template', extensions: ['cstemplate'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try {
    return { json: JSON.parse(await fs.promises.readFile(r.filePaths[0], 'utf8')) };
  } catch (e) {
    return { error: 'Could not read template: ' + e.message };
  }
}

module.exports = { save, open, openPath, recent, exportTemplate, importTemplate };
