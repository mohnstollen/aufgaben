#!/usr/bin/env bash
# Baut die Linux-Pakete nach dist/:  aufgaben_<version>_all.deb  (Debian, Ubuntu, Linux Mint)
#                                    aufgaben-<version>-1.noarch.rpm  (Fedora) – nur wenn rpmbuild vorhanden ist
# Aufruf:  bash linux/build.sh [VERSION]      (Standard: version aus package.json)
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' package.json | head -1)}"
PKGVER="${VERSION//-/\~}"            # 1.1.14-dev.abc → 1.1.14~dev.abc (sortiert vor 1.1.14)
ID=io.github.mohnstollen.aufgaben
SUMMARY="Aufgabenverwaltung mit Nextcloud-Sync (WebDAV, CalDAV)"
BUILD=build/linux
rm -rf "$BUILD"; mkdir -p dist

# Dateibaum, wie er auf dem Zielsystem liegt
stage() {   # $1 = Zielordner, $2 = Paketformat (deb|rpm)
  local r="$1" app="$1/usr/share/aufgaben"
  install -d "$app/www" "$r/usr/bin"
  install -m 644 linux/aufgaben.py linux/bridge.js "$app/"
  install -m 644 index.html manifest.webmanifest "$app/www/"
  cp -r icons vendor "$app/www/"
  printf '%s\n' "$VERSION" > "$app/version"
  printf '%s\n' "$2" > "$app/package-format"
  printf '#!/bin/sh\nexec /usr/bin/python3 /usr/share/aufgaben/aufgaben.py "$@"\n' > "$r/usr/bin/aufgaben"
  chmod 755 "$r/usr/bin/aufgaben"
  install -Dm 644 linux/$ID.desktop "$r/usr/share/applications/$ID.desktop"
  install -Dm 644 linux/$ID.metainfo.xml "$r/usr/share/metainfo/$ID.metainfo.xml"
  install -Dm 644 icons/favicon.png "$r/usr/share/icons/hicolor/64x64/apps/$ID.png"
  install -Dm 644 icons/icon-192.png "$r/usr/share/icons/hicolor/192x192/apps/$ID.png"
  install -Dm 644 icons/icon-512.png "$r/usr/share/icons/hicolor/512x512/apps/$ID.png"
  install -Dm 644 LICENSE "$r/usr/share/doc/aufgaben/copyright"
  find "$r" -type d -exec chmod 755 {} +
  find "$r" -type f ! -path "$r/usr/bin/*" -exec chmod 644 {} +
}

# ----- .deb -----
DEB="$BUILD/deb"
stage "$DEB" deb
install -d "$DEB/DEBIAN"
cat > "$DEB/DEBIAN/control" <<CONTROL
Package: aufgaben
Version: $PKGVER
Architecture: all
Maintainer: mohnstollen <mohnstollen@users.noreply.github.com>
Section: utils
Priority: optional
Depends: python3 (>= 3.8), python3-gi, gir1.2-gtk-3.0, gir1.2-webkit2-4.1 | gir1.2-webkit2-4.0
Installed-Size: $(du -sk "$DEB/usr" | cut -f1)
Homepage: https://github.com/mohnstollen/aufgaben
Description: $SUMMARY
 Aufgaben mit Schnelleingabe, Tags, Prioritäten und Wiederholungen.
 Die Daten liegen lokal und lassen sich mit der eigenen Nextcloud
 abgleichen – als Sync-Datei und mit Nextcloud Tasks.
CONTROL
dpkg-deb --root-owner-group -Zxz --build "$DEB" "dist/aufgaben_${PKGVER}_all.deb" >/dev/null
echo "dist/aufgaben_${PKGVER}_all.deb"

# ----- .rpm -----
if ! command -v rpmbuild >/dev/null; then
  echo "rpmbuild nicht gefunden – das Fedora-Paket wird übersprungen." >&2
  exit 0
fi
RPM="$PWD/$BUILD/rpm"
stage "$RPM/root" rpm
cat > "$RPM/aufgaben.spec" <<SPEC
Name:           aufgaben
Version:        $PKGVER
Release:        1
Summary:        $SUMMARY
License:        GPL-2.0-only
URL:            https://github.com/mohnstollen/aufgaben
BuildArch:      noarch
Requires:       python3, python3-gobject, gtk3, webkit2gtk4.1
# fertigen Dateibaum unverändert übernehmen (kein Byte-Compile, keine Shebang-Anpassung)
%global __os_install_post %{nil}
%global _binary_payload w6.xzdio
%global _build_id_links none

%description
Aufgaben mit Schnelleingabe, Tags, Prioritäten und Wiederholungen.
Die Daten liegen lokal und lassen sich mit der eigenen Nextcloud
abgleichen – als Sync-Datei und mit Nextcloud Tasks.

%install
cp -a "$RPM/root/." %{buildroot}/

%files
%attr(755,root,root) /usr/bin/aufgaben
/usr/share/aufgaben
/usr/share/applications/$ID.desktop
/usr/share/metainfo/$ID.metainfo.xml
/usr/share/icons/hicolor/*/apps/$ID.png
%license /usr/share/doc/aufgaben/copyright
SPEC
rpmbuild -bb --quiet --define "_topdir $RPM/top" --define "_rpmdir $RPM/out" "$RPM/aufgaben.spec"
cp "$RPM"/out/noarch/aufgaben-*.noarch.rpm dist/
ls dist/aufgaben-"$PKGVER"-1.noarch.rpm
