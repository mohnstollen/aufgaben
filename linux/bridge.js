/* Brücke zwischen der Web-App und der Linux-Hülle (linux/aufgaben.py).
   Bildet window.Capacitor mit denselben Plugins nach, die die Android-App bereitstellt –
   index.html braucht dadurch keinen eigenen Linux-Zweig für Sync, Dateien und Anmeldung.
   Wird vor dem ersten Skript der Seite eingefügt. */
(function () {
  'use strict';
  if (window.Capacitor) return;
  const pending = new Map();
  const listeners = {};
  let seq = 0;

  function call(plugin, method, args) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      window.webkit.messageHandlers.aufgaben.postMessage(JSON.stringify({ id, plugin, method, args: args || {} }));
    });
  }
  const plugin = (name, methods) => Object.fromEntries(methods.map(m => [m, args => call(name, m, args)]));

  // Aufrufe aus Python
  window.__aufgabenBridge = {
    done(id, error, result) {
      const p = pending.get(id); if (!p) return;
      pending.delete(id);
      error ? p.reject(new Error(error)) : p.resolve(result);
    },
    fire(event, arg) { (listeners[event] || []).forEach(cb => { try { cb(arg); } catch (e) { console.error(e); } }); },
  };

  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'linux',
    Plugins: {
      WebDav: plugin('WebDav', ['request']),
      Filesystem: plugin('Filesystem', ['writeFile', 'readdir', 'deleteFile']),
      Share: plugin('Share', ['share']),
      Browser: plugin('Browser', ['open', 'close']),
      QuickInbox: plugin('QuickInbox', ['take']),
      App: Object.assign(plugin('App', ['getInfo', 'minimizeApp']), {
        addListener(event, cb) { (listeners[event] = listeners[event] || []).push(cb); return Promise.resolve({ remove() {} }); },
      }),
    },
  };
})();
