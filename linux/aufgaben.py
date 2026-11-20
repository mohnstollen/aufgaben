#!/usr/bin/python3
"""Aufgaben – Linux-Anwendung (GTK 3 + WebKitGTK).

Zeigt dieselbe index.html wie PWA und Android-App in einem eigenen Fenster und stellt ihr
über linux/bridge.js die Plugins bereit, die unter Android Capacitor liefert:
WebDAV/CalDAV ohne CORS, Dateien unter Dokumente/Aufgaben, Speichern-Dialog, Browser-Anmeldung.

Aufruf:  aufgaben [--neu [TEXT]] [--version]
"""
import gzip
import json
import mimetypes
import os
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import unquote, urlparse

import gi

gi.require_version('Gdk', '3.0')
gi.require_version('Gtk', '3.0')
try:
    gi.require_version('WebKit2', '4.1')
except ValueError:                      # ältere Distributionen (libsoup 2)
    gi.require_version('WebKit2', '4.0')
from gi.repository import Gdk, GdkPixbuf, Gio, GLib, Gtk, WebKit2  # noqa: E402

APP_ID = 'io.github.mohnstollen.aufgaben'
SCHEME = 'aufgaben'
START_URL = SCHEME + '://app/index.html'
HERE = os.path.dirname(os.path.abspath(__file__))
INSTALLED = os.path.isdir(os.path.join(HERE, 'www'))
WWW = os.path.join(HERE, 'www') if INSTALLED else os.path.dirname(HERE)
DATA_DIR = os.path.join(GLib.get_user_data_dir(), 'aufgaben')
CACHE_DIR = os.path.join(GLib.get_user_cache_dir(), 'aufgaben')
CONFIG_DIR = os.path.join(GLib.get_user_config_dir(), 'aufgaben')
WINDOW_STATE = os.path.join(CONFIG_DIR, 'window.json')
BACKUP_DIR_NAME = 'Aufgaben'
MAX_RESPONSE = 64 * 1024 * 1024
RESUME_INTERVAL = 60            # Sekunden: so oft löst ein Fensterwechsel höchstens einen Sync aus


def read_text(path, default=''):
    try:
        with open(path, encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return default


def app_version():
    if INSTALLED:
        return read_text(os.path.join(HERE, 'version'), '0')
    try:
        return json.loads(read_text(os.path.join(WWW, 'package.json')))['version']
    except (ValueError, KeyError):
        return '0'


class BridgeError(Exception):
    pass


def http_request(args):
    """WebDAV-/CalDAV-Anfrage – Gegenstück zu WebDavPlugin.java der Android-App."""
    url = args.get('url') or ''
    if urlparse(url).scheme not in ('http', 'https'):
        raise BridgeError('Ungültige Adresse: ' + url)
    method = (args.get('method') or 'GET').upper()
    body = args.get('body')
    data = body.encode('utf-8') if body is not None else (b'' if method in ('POST', 'PUT', 'PATCH') else None)
    headers = {str(k): str(v) for k, v in (args.get('headers') or {}).items() if v is not None}
    if not any(k.lower() == 'user-agent' for k in headers):
        headers['User-Agent'] = 'Aufgaben-App (Linux)'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as e:     # 4xx/5xx sind für die App normale Antworten
        resp = e
    except urllib.error.URLError as e:
        raise BridgeError(str(e.reason)) from e
    except (OSError, ValueError) as e:
        raise BridgeError(str(e)) from e
    with resp:
        try:
            raw = resp.read(MAX_RESPONSE + 1)
        except OSError as e:
            raise BridgeError(str(e)) from e
        if len(raw) > MAX_RESPONSE:
            raise BridgeError('Antwort des Servers ist zu groß')
        merged = {}
        for k, v in resp.headers.items():
            k = k.lower()
            merged[k] = merged[k] + ', ' + v if k in merged else v
        if merged.get('content-encoding', '').lower() == 'gzip':
            try:
                raw = gzip.decompress(raw)
            except (OSError, EOFError):
                pass
        return {'status': resp.status, 'headers': merged, 'body': raw.decode('utf-8', 'replace')}


def base_dir(directory):
    if directory == 'DOCUMENTS':
        return GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS) or os.path.expanduser('~/Dokumente')
    if directory == 'CACHE':
        return os.path.join(CACHE_DIR, 'export')
    raise BridgeError('Unbekanntes Verzeichnis: %s' % directory)


def safe_path(args):
    """Pfad der Web-App auf das erlaubte Basisverzeichnis beschränken."""
    base = os.path.realpath(base_dir(args.get('directory')))
    path = os.path.realpath(os.path.join(base, str(args.get('path') or '')))
    if path != base and not path.startswith(base + os.sep):
        raise BridgeError('Pfad außerhalb des erlaubten Ordners')
    return path


def fs_write(args):
    path = safe_path(args)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(args.get('data') or '')
    os.replace(tmp, path)
    return {'uri': GLib.filename_to_uri(path, None)}


def fs_readdir(args):
    path = safe_path(args)
    try:
        return {'files': [{'name': n} for n in sorted(os.listdir(path))]}
    except FileNotFoundError:
        return {'files': []}


def fs_delete(args):
    os.remove(safe_path(args))
    return {}


class Window(Gtk.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app, title='Aufgaben')
        self.app = app
        self.loaded = False
        self.last_resume = time.monotonic()
        self.state = self.load_state()
        self.set_default_size(self.state.get('width', 560), self.state.get('height', 860))
        if self.state.get('maximized'):
            self.maximize()
        self.set_icon_name(APP_ID)
        if not INSTALLED:
            try:
                self.set_icon(GdkPixbuf.Pixbuf.new_from_file(os.path.join(WWW, 'icons', 'icon-192.png')))
            except GLib.Error:
                pass

        for d in (DATA_DIR, CACHE_DIR, CONFIG_DIR):
            os.makedirs(d, mode=0o700, exist_ok=True)
        manager = WebKit2.WebsiteDataManager(base_data_directory=DATA_DIR, base_cache_directory=CACHE_DIR)
        context = WebKit2.WebContext.new_with_website_data_manager(manager)
        context.register_uri_scheme(SCHEME, self.on_scheme_request)
        context.get_security_manager().register_uri_scheme_as_secure(SCHEME)

        ucm = WebKit2.UserContentManager()
        ucm.add_script(WebKit2.UserScript.new(
            read_text(os.path.join(HERE, 'bridge.js')),
            WebKit2.UserContentInjectedFrames.TOP_FRAME, WebKit2.UserScriptInjectionTime.START, None, None))
        ucm.register_script_message_handler('aufgaben')
        ucm.connect('script-message-received::aufgaben', self.on_message)

        self.view = WebKit2.WebView(web_context=context, user_content_manager=ucm)
        settings = self.view.get_settings()
        settings.set_enable_developer_extras(bool(os.environ.get('AUFGABEN_DEBUG')))
        settings.set_enable_write_console_messages_to_stdout(bool(os.environ.get('AUFGABEN_DEBUG')))
        settings.set_javascript_can_access_clipboard(True)
        settings.set_enable_back_forward_navigation_gestures(False)
        # Software-Darstellung: vermeidet leere Fenster mit manchen Grafiktreibern (z. B. Nvidia, VMs)
        if not os.environ.get('AUFGABEN_GPU'):
            settings.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.NEVER)
        self.view.set_background_color(Gdk.RGBA(0.059, 0.078, 0.125, 1))
        self.view.connect('decide-policy', self.on_decide_policy)
        self.view.connect('permission-request', self.on_permission_request)
        self.view.connect('context-menu', self.on_context_menu)
        self.view.connect('load-changed', self.on_load_changed)
        self.view.connect('web-process-terminated', lambda *_: self.view.load_uri(START_URL))
        self.add(self.view)

        self.connect('size-allocate', self.on_size_allocate)
        self.connect('window-state-event', self.on_window_state)
        self.connect('delete-event', self.on_delete)
        self.connect('focus-in-event', self.on_focus_in)
        self.view.load_uri(START_URL + ('?neu' if app.focus_on_start else ''))
        self.show_all()

    # ----- Fenstergröße merken -----
    def load_state(self):
        try:
            s = json.loads(read_text(WINDOW_STATE, '{}'))
            return s if isinstance(s, dict) else {}
        except ValueError:
            return {}

    def on_size_allocate(self, *_):
        if not self.is_maximized():
            self.state['width'], self.state['height'] = self.get_size()

    def on_window_state(self, _w, event):
        self.state['maximized'] = bool(event.new_window_state & Gdk.WindowState.MAXIMIZED)

    def on_delete(self, *_):
        try:
            with open(WINDOW_STATE, 'w', encoding='utf-8') as f:
                json.dump(self.state, f)
        except OSError:
            pass
        return False

    # ----- Seite ausliefern -----
    def on_scheme_request(self, request):
        rel = unquote(request.get_path() or '/').lstrip('/') or 'index.html'
        root = os.path.realpath(WWW)
        path = os.path.realpath(os.path.join(root, rel))
        allowed = ('index.html', 'manifest.webmanifest', 'icons' + os.sep, 'vendor' + os.sep)
        try:
            if not path.startswith(root + os.sep) or not os.path.relpath(path, root).startswith(allowed):
                raise OSError('nicht erlaubt')
            with open(path, 'rb') as f:
                data = f.read()
        except OSError as e:
            request.finish_error(GLib.Error.new_literal(Gio.io_error_quark(), str(e), Gio.IOErrorEnum.NOT_FOUND))
            return
        mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        if path.endswith('.html'):
            mime = 'text/html'
        request.finish(Gio.MemoryInputStream.new_from_bytes(GLib.Bytes.new(data)), len(data), mime)

    def on_decide_policy(self, _view, decision, kind):
        if kind in (WebKit2.PolicyDecisionType.NAVIGATION_ACTION, WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION):
            uri = decision.get_navigation_action().get_request().get_uri() or ''
            if uri.startswith(SCHEME + '://') and kind == WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
                return False
            # alles andere (Nextcloud-Anmeldung, Update-Download, Links in Notizen) öffnet der Standardbrowser
            self.open_external(uri)
            decision.ignore()
            return True
        return False

    def open_external(self, uri):
        if urlparse(uri).scheme in ('http', 'https', 'mailto'):
            try:
                Gtk.show_uri_on_window(self, uri, Gdk.CURRENT_TIME)
            except GLib.Error as e:
                print('Konnte %s nicht öffnen: %s' % (uri, e.message), file=sys.stderr)

    def on_permission_request(self, _view, request):
        # Kamera nur für den QR-Scan der Nextcloud-Anmeldung
        if isinstance(request, WebKit2.UserMediaPermissionRequest):
            request.allow()
        else:
            request.deny()
        return True

    def on_context_menu(self, _view, _menu, _event, hit):
        # Kontextmenü nur in Eingabefeldern (Kopieren/Einfügen), kein „Neu laden“ / „Zurück“
        return not (hit.context_is_editable() or hit.context_is_selection())

    def on_load_changed(self, _view, event):
        if event == WebKit2.LoadEvent.FINISHED:
            self.loaded = True
            test = os.environ.get('AUFGABEN_TEST_JS')       # nur für linux/test.sh
            if test:
                self.run_js('(async()=>{%s})().then(r=>({ok:r}), e=>({error:String(e && e.stack || e)}))'
                            '.then(r=>window.webkit.messageHandlers.aufgaben.postMessage(JSON.stringify({test:r})))'
                            % read_text(test))

    def on_focus_in(self, *_):
        if time.monotonic() - self.last_resume >= RESUME_INTERVAL:
            self.resume()
        return False

    def resume(self):
        """Wie das Zurückkehren in die Android-App: Schnelleingaben übernehmen und synchronisieren."""
        self.last_resume = time.monotonic()
        self.fire('appStateChange', {'isActive': True})

    # ----- Brücke -----
    def run_js(self, script):
        if hasattr(self.view, 'evaluate_javascript'):
            self.view.evaluate_javascript(script, -1, None, None, None, None, None)
        else:
            self.view.run_javascript(script, None, None, None)

    def fire(self, event, arg=None):
        if self.loaded:
            self.run_js('window.__aufgabenBridge && window.__aufgabenBridge.fire(%s, %s)' % (json.dumps(event), json.dumps(arg)))

    def reply(self, call_id, error=None, result=None):
        self.run_js('window.__aufgabenBridge.done(%s, %s, %s)' % (json.dumps(call_id), json.dumps(error), json.dumps(result)))
        return False

    def on_message(self, _ucm, message):
        value = message.get_js_value() if hasattr(message, 'get_js_value') else message
        try:
            msg = json.loads(value.to_string())
            if 'test' in msg and os.environ.get('AUFGABEN_TEST_JS'):
                print('TEST ' + json.dumps(msg['test'], ensure_ascii=False), flush=True)
                self.close()
                return
            call_id, plugin, method, args = msg['id'], msg['plugin'], msg['method'], msg.get('args') or {}
        except (ValueError, KeyError, TypeError):
            return
        blocking = {('WebDav', 'request'): http_request, ('Filesystem', 'writeFile'): fs_write,
                    ('Filesystem', 'readdir'): fs_readdir, ('Filesystem', 'deleteFile'): fs_delete}
        handler = blocking.get((plugin, method))
        if handler:                         # Netz und Dateien nicht im GUI-Thread
            def work():
                try:
                    result, error = handler(args), None
                except BridgeError as e:
                    result, error = None, str(e)
                except Exception as e:      # noqa: BLE001 – jeder Fehler muss als Ablehnung in der App ankommen
                    result, error = None, '%s: %s' % (type(e).__name__, e)
                GLib.idle_add(self.reply, call_id, error, result)
            threading.Thread(target=work, daemon=True).start()
            return
        try:
            result = self.handle_ui(plugin, method, args)
        except BridgeError as e:
            self.reply(call_id, str(e))
        else:
            self.reply(call_id, None, result)

    def handle_ui(self, plugin, method, args):
        if (plugin, method) == ('App', 'getInfo'):
            return {'version': app_version(), 'platform': 'linux',
                    'updateExt': read_text(os.path.join(HERE, 'package-format')) or None}
        if (plugin, method) == ('App', 'minimizeApp'):
            return {}
        if (plugin, method) == ('QuickInbox', 'take'):
            items, self.app.inbox = self.app.inbox, []
            return {'items': items, 'done': []}
        if (plugin, method) == ('Browser', 'open'):
            self.open_external(str(args.get('url') or ''))
            return {}
        if (plugin, method) == ('Browser', 'close'):
            self.present()
            return {}
        if (plugin, method) == ('Share', 'share'):
            return self.save_as(args)
        raise BridgeError('Unbekannter Aufruf %s.%s' % (plugin, method))

    def save_as(self, args):
        """Export: statt des Android-Teilen-Menüs ein Speichern-Dialog."""
        files = args.get('files') or []
        src = GLib.filename_from_uri(files[0])[0] if files else None
        export_root = os.path.realpath(base_dir('CACHE'))
        if not src or not os.path.realpath(src).startswith(export_root + os.sep):
            raise BridgeError('Keine Datei zum Speichern')
        dialog = Gtk.FileChooserNative.new('Datei speichern', self, Gtk.FileChooserAction.SAVE, '_Speichern', '_Abbrechen')
        dialog.set_do_overwrite_confirmation(True)
        dialog.set_current_name(os.path.basename(src))
        folder = self.state.get('exportDir') or GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD)
        if folder and os.path.isdir(folder):
            dialog.set_current_folder(folder)
        response = dialog.run()
        target = dialog.get_filename()
        dialog.destroy()
        if response != Gtk.ResponseType.ACCEPT or not target:
            os.remove(src)
            raise BridgeError('cancelled')
        try:
            shutil.copyfile(src, target)
        except OSError as e:
            raise BridgeError(str(e)) from e
        finally:
            os.remove(src)
        self.state['exportDir'] = os.path.dirname(target)
        return {}


class App(Gtk.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.HANDLES_COMMAND_LINE)
        self.window = None
        self.inbox = []             # per „aufgaben --neu TEXT“ übergebene Aufgaben
        self.focus_on_start = False

    def do_startup(self):
        Gtk.Application.do_startup(self)
        quit_action = Gio.SimpleAction.new('quit', None)
        quit_action.connect('activate', lambda *_: (self.window.close() if self.window else self.quit()))
        self.add_action(quit_action)
        self.set_accels_for_action('app.quit', ['<Primary>q'])

    def do_command_line(self, command_line):
        args = command_line.get_arguments()[1:]
        focus, text = False, ''
        if args and args[0] in ('--neu', '-n'):
            text = ' '.join(args[1:]).strip()
            focus = not text
            if text:
                self.inbox.append({'text': text, 'ts': int(time.time() * 1000)})
        if self.window is None:
            self.focus_on_start = focus
            self.window = Window(self)
        else:
            if text:
                self.window.resume()            # übernimmt die Schnelleingabe sofort
            if focus:
                self.window.fire('quickAdd')
        self.window.present()
        return 0


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ('--version', '-V'):
        print('Aufgaben', app_version())
        return 0
    if len(sys.argv) > 1 and sys.argv[1] in ('--help', '-h'):
        print(__doc__.strip())
        return 0
    GLib.set_prgname(APP_ID)        # WM_CLASS / Wayland-App-ID → richtiges Symbol in Leiste und Dock
    GLib.set_application_name('Aufgaben')
    return App().run(sys.argv)


if __name__ == '__main__':
    sys.exit(main())
