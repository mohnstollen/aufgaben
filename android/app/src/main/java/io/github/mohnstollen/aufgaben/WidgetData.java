package io.github.mohnstollen.aufgaben;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Daten für das Widget. Die Web-App schreibt nach jeder Änderung eine kleine Zusammenfassung
 * ({ open: Anzahl offener Aufgaben, items: [{ id, name, kind, label }] }) hierher.
 */
final class WidgetData {

    private static final String PREFS = "widget";
    private static final String KEY = "data";

    private WidgetData() {}

    static synchronized void save(Context context, String json) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).commit();
        refresh(context);
    }

    static synchronized JSONObject read(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            return new JSONObject(prefs.getString(KEY, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    static JSONArray items(Context context) {
        JSONArray items = read(context).optJSONArray("items");
        return items != null ? items : new JSONArray();
    }

    static int openCount(Context context) {
        return read(context).optInt("open", 0);
    }

    /** Im Widget abgehakt: sofort aus der Anzeige nehmen und für die App vormerken */
    static synchronized void markDone(Context context, String id) {
        JSONObject data = read(context);
        JSONArray kept = new JSONArray();
        JSONArray items = data.optJSONArray("items");
        boolean found = false;
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && id.equals(item.optString("id"))) found = true;
            else kept.put(item);
        }
        try {
            data.put("items", kept);
            if (found) data.put("open", Math.max(0, data.optInt("open", 0) - 1));
        } catch (JSONException ignored) {}
        QuickInboxPlugin.addDone(context, id);
        save(context, data.toString());
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, QuickAddWidget.class));
        if (ids.length == 0) return;
        QuickAddWidget.updateAll(context, manager, ids);
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }
}
