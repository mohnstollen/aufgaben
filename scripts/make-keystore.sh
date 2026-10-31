#!/usr/bin/env bash
# Erzeugt den festen Signaturschlüssel für die Android-App und hinterlegt ihn als GitHub-Secrets.
# Am einfachsten im Browser: Repo → Code → Codespaces → „Create codespace on main“, dann im Terminal:
#   bash scripts/make-keystore.sh
# Voraussetzungen: Java (keytool); für das automatische Setzen der Secrets die GitHub CLI (gh), angemeldet.
set -euo pipefail

KS="${1:-aufgaben-release.jks}"
if [ -e "$KS" ]; then
  echo "$KS existiert bereits. Abbruch, damit kein vorhandener Schlüssel überschrieben wird." >&2
  exit 1
fi
command -v keytool >/dev/null || { echo "keytool nicht gefunden: Bitte Java installieren." >&2; exit 1; }

read -rsp "Neues Passwort für den Schlüssel (mind. 6 Zeichen): " PW; echo
read -rsp "Passwort wiederholen: " PW2; echo
[ "$PW" = "$PW2" ] || { echo "Die Passwörter stimmen nicht überein." >&2; exit 1; }
[ "${#PW}" -ge 6 ] || { echo "Das Passwort ist zu kurz." >&2; exit 1; }

keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias aufgaben \
  -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Aufgaben" \
  -storepass "$PW" -keypass "$PW" >/dev/null
echo "Schlüssel erzeugt: $KS"
keytool -list -v -keystore "$KS" -storepass "$PW" | grep -m1 "SHA256:" || true

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1 \
   && base64 < "$KS" | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64 \
   && printf '%s' "$PW" | gh secret set ANDROID_KEYSTORE_PASSWORD; then
  echo "GitHub-Secrets ANDROID_KEYSTORE_BASE64 und ANDROID_KEYSTORE_PASSWORD sind gesetzt."
else
  base64 < "$KS" | tr -d '\n' > "$KS.b64"
  echo
  echo "Secrets konnten nicht automatisch gesetzt werden. Bitte von Hand anlegen"
  echo "(Repo → Settings → Secrets and variables → Actions → New repository secret):"
  echo "  ANDROID_KEYSTORE_BASE64   = Inhalt der Datei $KS.b64 (gerade erzeugt)"
  echo "  ANDROID_KEYSTORE_PASSWORD = dein Passwort"
fi

echo
echo "WICHTIG: $KS herunterladen und zusammen mit dem Passwort sicher aufbewahren (z. B. im Passwortmanager)."
echo "Ohne sie lassen sich spätere Versionen nicht mehr über die installierte App aktualisieren."
echo "Die Datei NICHT ins Repository einchecken (steht in .gitignore)."
