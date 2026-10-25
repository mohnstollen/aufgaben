package io.github.mohnstollen.aufgaben;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Minimaler WebDAV-Client für den Nextcloud-Sync.
 * Läuft nativ und unterliegt damit nicht der CORS-Prüfung der WebView. Anders als
 * Capacitors eingebautes HTTP (HttpURLConnection) unterstützt OkHttp auch MKCOL.
 */
@CapacitorPlugin(name = "WebDav")
public class WebDavPlugin extends Plugin {

    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build();

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        String method = call.getString("method", "GET").toUpperCase(Locale.ROOT);
        String body = call.getString("body");
        JSObject headers = call.getObject("headers", new JSObject());
        if (url == null) {
            call.reject("Keine URL angegeben");
            return;
        }

        Request.Builder builder;
        try {
            builder = new Request.Builder().url(url);
        } catch (IllegalArgumentException e) {
            call.reject("Ungültige Adresse: " + url, "BAD_URL");
            return;
        }
        String contentType = null;
        Iterator<String> keys = headers.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = headers.getString(key);
            if (value == null) continue;
            if (key.equalsIgnoreCase("Content-Type")) contentType = value;
            else builder.header(key, value);
        }

        RequestBody requestBody = null;
        if (body != null) {
            requestBody = RequestBody.create(body, contentType != null ? MediaType.parse(contentType) : null);
        } else if (method.equals("POST") || method.equals("PUT") || method.equals("PATCH")) {
            requestBody = RequestBody.create(new byte[0], null);
        }
        builder.method(method, requestBody);

        client.newCall(builder.build()).enqueue(new Callback() {
            @Override
            public void onFailure(Call c, IOException e) {
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString(), "NETWORK", e);
            }

            @Override
            public void onResponse(Call c, Response response) {
                try (ResponseBody rb = response.body()) {
                    JSObject res = new JSObject();
                    res.put("status", response.code());
                    JSObject h = new JSObject();
                    for (Map.Entry<String, List<String>> e : response.headers().toMultimap().entrySet()) {
                        h.put(e.getKey().toLowerCase(Locale.ROOT), String.join(", ", e.getValue()));
                    }
                    res.put("headers", h);
                    res.put("body", rb != null ? rb.string() : "");
                    call.resolve(res);
                } catch (IOException e) {
                    call.reject(e.getMessage() != null ? e.getMessage() : e.toString(), "NETWORK", e);
                }
            }
        });
    }
}
