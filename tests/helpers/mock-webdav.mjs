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
 */
export async function startDav(o = {}) {
  const { exposeEtag = true, allowIfMatch = true, gzip = false, badEtag = false, lock = false } = o;
  const files = new Map(), dirs = new Set(['']), log = [];
  let n = 0;
  const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

  const server = createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,PUT,MKCOL,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type' + (allowIfMatch ? ', If-Match' : ''),
      ...(exposeEtag ? { 'Access-Control-Expose-Headers': 'ETag, OC-ETag' } : {}),
    };
    if (req.method === 'OPTIONS') { res.writeHead(200, cors); res.end(); return; }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const m = decodeURI(req.url).match(/^\/remote\.php\/dav\/files\/([^/]+)\/(.*)$/);
      const entry = { method: req.method, path: m ? m[2] : req.url, ifMatch: req.headers['if-match'] || null, status: 0 };
      log.push(entry);
      const send = (status, headers = {}, text = '') => { entry.status = status; res.writeHead(status, { ...cors, ...headers }); res.end(text); };
      if (req.headers.authorization !== auth) return send(401);
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
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const json = (path = 'Aufgaben/aufgaben.json') => files.has(path) ? JSON.parse(files.get(path).body) : null;
  return {
    url, log, files, json,
    /** Aufgabennamen in der Sync-Datei, sortiert */
    names: (path) => (json(path)?.data.tasks || []).map(t => t.name).sort(),
    close: () => new Promise(r => server.close(r)),
  };
}
