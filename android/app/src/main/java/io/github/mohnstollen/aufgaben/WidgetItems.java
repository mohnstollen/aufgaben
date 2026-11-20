package io.github.mohnstollen.aufgaben;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.GregorianCalendar;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Wählt aus den von der App gelieferten Aufgaben die fürs Widget aus und beschriftet sie –
 * bezogen auf das aktuelle Datum, damit „heute“ und „überfällig“ auch ohne Öffnen der App stimmen.
 * Eingabe pro Aufgabe: { id, name, quick, due (JJJJ-MM-TT|null), high, created, cl („erledigt/gesamt“, optional) }.
 */
final class WidgetItems {

    private WidgetItems() {}

    static List<JSONObject> visible(JSONArray raw, String today) {
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; raw != null && i < raw.length(); i++) {
            JSONObject o = raw.optJSONObject(i);
            if (o == null) continue;
            String kind, label;
            if (o.optBoolean("quick")) {
                kind = "quick";
                label = "⚡ Schnell";
            } else if (o.has("kind") && !o.has("due")) {     // Format älterer App-Versionen
                kind = o.optString("kind");
                label = o.optString("label");
            } else {
                String due = o.isNull("due") ? "" : o.optString("due", "");
                if (due.isEmpty()) continue;
                long d = daysBetween(today, due);
                if (d > 0) continue;
                kind = d < 0 ? "overdue" : "today";
                label = d == 0 ? "Heute" : d == -1 ? "Überfällig · gestern" : "Überfällig · seit " + (-d) + " Tagen";
                if (o.optBoolean("high")) label += " · 🔴 Hoch";
            }
            String cl = o.optString("cl", "");                 // Fortschritt einer Checkliste, z. B. „2/5“
            if (!cl.isEmpty()) label += " · ☑ " + cl;
            try {
                JSONObject v = new JSONObject();
                v.put("id", o.optString("id"));
                v.put("name", o.optString("name"));
                v.put("kind", kind);
                v.put("label", label);
                v.put("due", o.isNull("due") ? "" : o.optString("due", ""));
                v.put("high", o.optBoolean("high"));
                v.put("created", o.optLong("created"));
                out.add(v);
            } catch (JSONException ignored) {}
        }
        Collections.sort(out, (a, b) -> {
            int ka = order(a.optString("kind")), kb = order(b.optString("kind"));
            if (ka != kb) return ka - kb;
            if (ka == 0) return Long.compare(a.optLong("created"), b.optLong("created"));   // Schnell: Reihenfolge des Anlegens
            int c = a.optString("due").compareTo(b.optString("due"));
            if (c != 0) return c;
            return Boolean.compare(b.optBoolean("high"), a.optBoolean("high"));            // wichtigere zuerst
        });
        return out;
    }

    private static int order(String kind) {
        return "quick".equals(kind) ? 0 : "overdue".equals(kind) ? 1 : 2;
    }

    static String today(Calendar now) {
        return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d",
            now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
    }

    /** Tage von a bis b (JJJJ-MM-TT), unabhängig von Sommer-/Winterzeit */
    static long daysBetween(String a, String b) {
        return (utcDay(b) - utcDay(a));
    }

    private static long utcDay(String ymd) {
        try {
            String[] p = ymd.split("-");
            GregorianCalendar c = new GregorianCalendar(java.util.TimeZone.getTimeZone("UTC"));
            c.clear();
            c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
            return c.getTimeInMillis() / 86400000L;
        } catch (RuntimeException e) {
            return Long.MAX_VALUE / 4;     // ungültiges Datum → gilt als fern in der Zukunft
        }
    }
}
