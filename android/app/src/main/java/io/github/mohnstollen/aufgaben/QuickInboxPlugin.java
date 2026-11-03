package io.github.mohnstollen.aufgaben;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Warteschlange für die Schnelleingabe: QuickAddActivity legt Texte hier ab,
 * die Web-App holt sie beim Start bzw. Zurückkehren mit take() ab.
 */
@CapacitorPlugin(name = "QuickInbox")
public class QuickInboxPlugin extends Plugin {

    private static final String PREFS = "quick_inbox";
    private static final String KEY = "items";
    private static final String KEY_DONE = "done";

    static synchronized void add(Context context, String text) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray items = read(prefs);
        try {
            JSONObject item = new JSONObject();
            item.put("text", text);
            item.put("ts", System.currentTimeMillis());
            items.put(item);
        } catch (JSONException e) {
            return;
        }
        prefs.edit().putString(KEY, items.toString()).commit();
    }

    /** Im Widget abgehakte Aufgabe (ID) für die App vormerken */
    static synchronized void addDone(Context context, String id) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray done = read(prefs, KEY_DONE);
        done.put(id);
        prefs.edit().putString(KEY_DONE, done.toString()).commit();
    }

    /** Liefert { items, done } und leert beide Listen */
    static synchronized JSONObject takeAll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject all = new JSONObject();
        try {
            all.put("items", read(prefs, KEY));
            all.put("done", read(prefs, KEY_DONE));
        } catch (JSONException ignored) {}
        prefs.edit().remove(KEY).remove(KEY_DONE).commit();
        return all;
    }

    private static JSONArray read(SharedPreferences prefs) {
        return read(prefs, KEY);
    }

    private static JSONArray read(SharedPreferences prefs, String key) {
        try {
            return new JSONArray(prefs.getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSONObject all = takeAll(getContext());
        JSObject result = new JSObject();
        try {
            result.put("items", new JSArray(all.optJSONArray("items").toString()));
            result.put("done", new JSArray(all.optJSONArray("done").toString()));
        } catch (JSONException | NullPointerException e) {
            result.put("items", new JSArray());
            result.put("done", new JSArray());
        }
        call.resolve(result);
    }
}
