// Nachbau der Nextcloud-WebDAV-Schnittstelle: /remote.php/dav/files/<user>/<pfad>
// und der Aufgabenlisten (CalDAV): /remote.php/dav/calendars/<user>/<liste>/<datei>.ics
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
 * @param {object}  [o.lists]             vorhandene Aufgabenlisten/Kalender: { adresse: { name, comps:['VTODO'] } }
 * @param {boolean} [o.putEtag=true]      PUT einer Aufgabe liefert den ETag (per CORS lesbar)
 */
export async function startDav(o = {}) {
  const { exposeEtag = true, allowIfMatch = true, gzip = false, badEtag = false, lock = false,
    loginName = USER, loginCors = true, port = 0, lists = {}, putEtag = true } = o;
  const files = new Map(), dirs = new Set(['']), log = [];
  // Aufgabenlisten: adresse → { name, comps, items: Map(datei → { body, etag }) }
  const cals = new Map(Object.entries(lists).map(([k, v]) => [k, { name: v.name || k, comps: v.comps || ['VTODO'], items: new Map() }]));
  const xml = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const calHome = `/remote.php/dav/calendars/${encodeURIComponent(USER)}/`;
  let n = 0, approved = false, url = '';
  const basic = name => 'Basic ' + Buffer.from(`${name}:${PASS}`).toString('base64');
  const authOk = h => h === basic(USER) || h === basic(loginName);

  const server = createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,PUT,MKCOL,OPTIONS,PROPFIND,REPORT,MKCALENDAR,DELETE',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, OCS-APIRequest, Depth, If-None-Match' + (allowIfMatch ? ', If-Match' : ''),
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

      // ---- CalDAV: Aufgabenlisten ----
      const c = decodeURI(req.url).match(/^\/remote\.php\/dav\/calendars\/([^/]+)\/(?:([^/]+)\/(?:([^/]+))?)?$/);
      if (c) {
        entry.path = 'cal:' + (c[2] || '') + (c[3] ? '/' + decodeURIComponent(c[3]) : '');
        if (c[1] !== USER) return send(404);
        const multi = parts => send(207, { 'Content-Type': 'application/xml; charset=utf-8' },
          `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">${parts.join('')}</d:multistatus>`);
        const resp = (href, props, status = 200) => `<d:response><d:href>${xml(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 ${status} OK</d:status></d:propstat></d:response>`;
        const cal = c[2] ? cals.get(c[2]) : null, calHref = calHome + encodeURIComponent(c[2] || '') + '/';
        if (!c[2]) {
          if (req.method !== 'PROPFIND') return send(405);
          return multi([resp(calHome, '<d:resourcetype><d:collection/></d:resourcetype>'),
            ...[...cals].map(([k, v]) => resp(calHome + encodeURIComponent(k) + '/',
              `<d:displayname>${xml(v.name)}</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>` +
              `<cal:supported-calendar-component-set>${v.comps.map(x => `<cal:comp name="${x}"/>`).join('')}</cal:supported-calendar-component-set>`))]);
        }
        if (!c[3]) {
          if (req.method === 'MKCALENDAR') {
            if (cal) return send(405);
            cals.set(c[2], { name: (body.match(/<d:displayname>([^<]*)</) || [])[1] || c[2], comps: [...body.matchAll(/comp name="(\w+)"/g)].map(x => x[1]), items: new Map() });
            return send(201);
          }
          if (!cal) return send(404);
          if (req.method !== 'REPORT') return send(405);
          if (body.includes('calendar-multiget')) {
            const hrefs = [...body.matchAll(/<d:href>([^<]*)<\/d:href>/g)].map(x => x[1].replace(/&amp;/g, '&'));
            return multi(hrefs.map(h => {
              const it = cal.items.get(decodeURIComponent(h.split('/').pop()));
              return it ? resp(h, `<d:getetag>${xml(it.etag)}</d:getetag><cal:calendar-data>${xml(it.body)}</cal:calendar-data>`)
                : `<d:response><d:href>${xml(h)}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`;
            }));
          }
          return multi([...cal.items].filter(([, it]) => it.body.includes('BEGIN:VTODO'))
            .map(([name, it]) => resp(calHref + encodeURIComponent(name), `<d:getetag>${xml(it.etag)}</d:getetag>`)));
        }
        if (!cal) return send(404);
        const name = decodeURIComponent(c[3]), it = cal.items.get(name), im = req.headers['if-match'];
        if (req.method === 'GET') return it ? send(200, { ETag: it.etag, 'Content-Type': 'text/calendar' }, it.body) : send(404);
        if (req.method === 'PUT') {
          if (req.headers['if-none-match'] === '*' && it) return send(412);
          if (im && (!it || it.etag !== im)) return send(412);
          const etag = `"c${++n}"`;
          cal.items.set(name, { body, etag });
          return send(it ? 204 : 201, putEtag ? { ETag: etag } : {});
        }
        if (req.method === 'DELETE') {
          if (!it) return send(404);
          if (im && it.etag !== im) return send(412);
          cal.items.delete(name); return send(204);
        }
        return send(405);
      }

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
  /** Aufgabenliste aus Sicht der Nextcloud: lesen und – wie die Tasks-App – ändern */
  const list = (key = 'aufgaben') => {
    const cal = cals.get(key);
    const field = (ics, name) => (ics.replace(/\r?\n[ \t]/g, '').match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'm')) || [])[1]?.trim() ?? null;
    const find = summary => [...cal.items].find(([, it]) => field(it.body, 'SUMMARY') === summary);
    const write = (name, body) => cal.items.set(name, { body, etag: `"c${++n}"` });
    return {
      exists: !!cal, name: cal?.name, comps: cal?.comps,
      /** Namen der Aufgaben (mit ✓ für Erledigte), sortiert */
      names: () => [...cal.items.values()].map(it => field(it.body, 'SUMMARY') + (field(it.body, 'STATUS') === 'COMPLETED' ? ' ✓' : '')).sort(),
      ics: summary => find(summary)?.[1].body ?? null,
      field: (summary, name) => { const f = find(summary); return f ? field(f[1].body, name) : null; },
      /** Aufgabe in der Nextcloud anlegen (vollständige .ics-Datei) */
      add: (name, body) => write(name, body),
      /** Zeilen einer Aufgabe ersetzen/ergänzen: { SUMMARY:'Neu', DUE:null (= entfernen), 'DUE;VALUE=DATE':'20261120' } */
      edit: (summary, props) => {
        const [name, it] = find(summary);
        let lines = it.body.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter(Boolean);
        for (const [k, v] of Object.entries({ 'LAST-MODIFIED': new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''), ...props })) {
          const base = k.split(';')[0];
          lines = lines.filter(l => !new RegExp(`^${base}[;:]`).test(l));
          if (v !== null) lines.splice(lines.indexOf('END:VTODO'), 0, `${k}:${v}`);
        }
        write(name, lines.join('\r\n') + '\r\n');
      },
      remove: summary => cal.items.delete(find(summary)[0]),
      clear: () => cal.items.clear(),
    };
  };
  return {
    url, log, files, json, list, cals,
    /** Benutzer klickt im Login Flow auf „Zugriff gewähren“ */
    approve: () => { approved = true; },
    /** Aufgabennamen in der Sync-Datei, sortiert */
    names: (path) => (json(path)?.data.tasks || []).map(t => t.name).sort(),
    // offene Keep-Alive-Verbindungen des Browsers nicht abwarten
    close: () => new Promise(r => { server.close(r); server.closeAllConnections(); }),
  };
}
