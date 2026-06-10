const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chase', {
  // projects
  saveProject: (json, currentPath) => ipcRenderer.invoke('project:save', json, currentPath),
  saveProjectAs: (json) => ipcRenderer.invoke('project:saveAs', json),
  openProject: () => ipcRenderer.invoke('project:open'),
  openProjectPath: (p) => ipcRenderer.invoke('project:openPath', p),
  recentProjects: () => ipcRenderer.invoke('project:recent'),
  exportTemplate: (json) => ipcRenderer.invoke('template:export', json),
  importTemplate: () => ipcRenderer.invoke('template:import'),

  // media
  pickMedia: (kind) => ipcRenderer.invoke('media:pick', kind),

  // recording
  recStart: (name) => ipcRenderer.invoke('rec:start', name),
  recChunk: (buf) => ipcRenderer.send('rec:chunk', buf),
  recStop: () => ipcRenderer.invoke('rec:stop'),
  recFinalizeMp4: (p, h264) => ipcRenderer.invoke('rec:finalizeMp4', p, h264),
  recReveal: (p) => ipcRenderer.invoke('rec:reveal', p),

  // streaming
  streamStart: (opts) => ipcRenderer.invoke('stream:start', opts),
  streamChunk: (buf) => ipcRenderer.send('stream:chunk', buf),
  streamStop: () => ipcRenderer.invoke('stream:stop'),
  onStreamStatus: (cb) => ipcRenderer.on('stream:status', (e, data) => cb(data)),

  appInfo: () => ipcRenderer.invoke('app:info')
});
