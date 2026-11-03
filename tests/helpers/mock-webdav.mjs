// Nachbau der Nextcloud-WebDAV-Schnittstelle: /remote.php/dav/files/<user>/<pfad>
// Optionen bilden Eigenheiten echter Server nach (Komprimierung, CORS, Sperren).
import { createServer } from 'node:http';

export const USER = 'jörg';
export const PASS = 'app-pass';

/**
 * @param {object} o
 * @param {boolean} [o.exposeEtag=true]   ETag per CORS lesbar
 * @param {boolean} [o.allowIfMatch=true] If-Match im CORS-Preflight erlaubt
 * @param {boolean} [o.gzip=false]        wie nginx mit gzip: GET liefert schwachen ETag W/"…" (OC-ETag bleibt stark)
 * @param {boolean} [o.badEtag=false]     ETag passt nie zu If-Match (und kein OC-ETag)
 * @param {boolean} [o.lock=false]        vorhandene .json-Dateien sind gesperrt (423)
 * @param {string}  [o.loginName=USER]    Login-Name aus dem Login Flow (z. B. E-Mail statt Benutzer-ID)
 * @param {boolean} [o.loginCors=true]    Login-Flow-Endpunkte senden CORS-Header
 * @param {number}  [o.port=0]            fester Port (0 = beliebig)
 */
export async function startDav(o = {}) {
  const { exposeEtag = true, allowIfMatch = true, gzip = false, badEtag = false, lock = false,
    loginName = USER, loginCors = true, port = 0 } = o;
  const files = new Map(), dirs = new Set(['']), log = [];
  let n = 0, approved = false, url = '';
  const basic = name => 'Basic ' + Buffer.from(`${name}:${PASS}`).toString('base64');
  const authOk = h => h === basic(USER) || h === basic(loginName);

  const server = createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,PUT,MKCOL,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, OCS-APIRequest' + (allowIfMatch ? ', If-Match' : ''),
      ...(exposeEtag ? { 'Access-Control-Expose-Headers': 'ETag, OC-ETag' } : {}),
    };
    const isLogin = req.url.startsWith('/index.php/login/v2');
    if (isLogin && !loginCors) for (const k of Object.keys(cors)) delete cors[k];
    if (req.method === 'OPTIONS') { res.writeHead(200, cors); res.end(); return; }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const m = decodeURI(req.url).match(/^\/remote\.php\/dav\/files\/([^/]+)\/(.*)$/);
      const entry = { method: req.method, path: m ? m[2] : req.url, ifMatch: req.headers['if-match'] || null, status: 0 };
      log.push(entry);
      const send = (status, headers = {}, text = '') => { entry.status = status; res.writeHead(status, { ...cors, ...headers }); res.end(text); };
      const json = (status, obj) => send(status, { 'Content-Type': 'application/json' }, JSON.stringify(obj));

      // Login Flow v2 (https://docs.nextcloud.com/server/stable/developer_manual/client_apis/LoginFlow)
      if (req.url === '/index.php/login/v2' && req.method === 'POST')
        return json(200, { poll: { token: 'tok123', endpoint: url + '/index.php/login/v2/poll' }, login: url + '/index.php/login/v2/flow/tok123' });
      if (req.url === '/index.php/login/v2/poll' && req.method === 'POST')
        return body === 'token=tok123' && approved ? json(200, { server: url, loginName, appPassword: PASS }) : send(404);
      if (isLogin) return send(200, { 'Content-Type': 'text/html' }, '<p>Nextcloud-Anmeldung (Nachbau)</p>');
      // Benutzer-ID für den WebDAV-Pfad
      if (req.url.startsWith('/ocs/v2.php/cloud/user')) {
        if (!authOk(req.headers.authorization) || req.headers['ocs-apirequest'] !== 'true') return send(401);
        return json(200, { ocs: { meta: { status: 'ok' }, data: { id: USER } } });
      }

      if (!authOk(req.headers.authorization)) return send(401);
      if (!m || m[1] !== USER) return send(404);
      const p = m[2].replace(/\/$/, ''), parent = p.split('/').slice(0, -1).join('/'), f = files.get(p);

      if (req.method === 'GET') {
        if (!f) return send(404);
        const weak = gzip && /gzip/.test(req.headers['accept-encoding'] || '');
        const etag = badEtag ? '"kaputt"' : weak ? 'W/' + f.etag : f.etag;
        return send(200, { ETag: etag, ...(badEtag ? {} : { 'OC-ETag': f.etag }), 'Content-Type': 'application/json' }, f.body);
      }
      if (req.method === 'MKCOL') {
        if (dirs.has(p)) return send(405);
        if (!dirs.has(parent)) return send(409);
        dirs.add(p); return send(201);
      }
      if (req.method === 'PUT') {
        if (lock && f && p.endsWith('.json')) return send(423);
        if (!dirs.has(parent)) return send(409);
        const im = req.headers['if-match'];
        if (im && (!f || f.etag !== im)) return send(412);
        const etag = `"${++n}"`;
        files.set(p, { body, etag });
        return send(f ? 204 : 201, { ETag: etag });
      }
      send(405);
    });
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
  const json = (path = 'Aufgaben/aufgaben.json') => files.has(path) ? JSON.parse(files.get(path).body) : null;
  return {
    url, log, files, json,
    /** Benutzer klickt im Login Flow auf „Zugriff gewähren“ */
    approve: () => { approved = true; },
    /** Aufgabennamen in der Sync-Datei, sortiert */
    names: (path) => (json(path)?.data.tasks || []).map(t => t.name).sort(),
    close: () => new Promise(r => server.close(r)),
  };
}
