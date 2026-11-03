package io.github.mohnstollen.aufgaben;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Die Web-App übergibt hier die Aufgaben, die das Widget anzeigen soll. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        WidgetData.save(getContext(), call.getString("data", "{}"));
        call.resolve();
    }
}
