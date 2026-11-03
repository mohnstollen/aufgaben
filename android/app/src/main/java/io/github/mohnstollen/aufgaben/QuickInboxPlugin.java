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

    static synchronized JSONArray takeAll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray items = read(prefs);
        prefs.edit().remove(KEY).commit();
        return items;
    }

    private static JSONArray read(SharedPreferences prefs) {
        try {
            return new JSONArray(prefs.getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject result = new JSObject();
        try {
            result.put("items", new JSArray(takeAll(getContext()).toString()));
        } catch (JSONException e) {
            result.put("items", new JSArray());
        }
        call.resolve(result);
    }
}
