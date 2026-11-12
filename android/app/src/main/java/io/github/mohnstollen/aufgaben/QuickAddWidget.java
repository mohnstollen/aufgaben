package io.github.mohnstollen.aufgaben;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;
import java.util.Calendar;
import java.util.List;
import org.json.JSONObject;

/** Homescreen-Widget: Schnellaufgaben, überfällige und heutige Aufgaben – plus „＋“ für die Schnelleingabe */
public class QuickAddWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        updateAll(context, manager, widgetIds);
    }

    @SuppressWarnings("deprecation")
    static void updateAll(Context context, AppWidgetManager manager, int[] widgetIds) {
        int open = WidgetData.openCount(context);
        String title = open > 0 ? context.getString(R.string.widget_title_count, open) : context.getString(R.string.widget_title);
        PendingIntent add = PendingIntent.getActivity(context, 0,
            new Intent(context, QuickAddActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent app = PendingIntent.getActivity(context, 1,
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        // Vorlage für Klicks in der Liste; die Zeilen ergänzen Aktion und ID (deshalb veränderbar)
        PendingIntent rowClick = PendingIntent.getActivity(context, 2,
            new Intent(context, WidgetActionActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0));

        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_add);
            views.setTextViewText(R.id.widget_title, title);
            views.setOnClickPendingIntent(R.id.widget_title, app);
            views.setOnClickPendingIntent(R.id.widget_add, add);
            if (Build.VERSION.SDK_INT >= 31) {
                // Einträge direkt mitgeben: kein Dienst nötig, den das System (z. B. HyperOS) blockieren könnte
                RemoteViews.RemoteCollectionItems.Builder list = new RemoteViews.RemoteCollectionItems.Builder()
                    .setHasStableIds(true).setViewTypeCount(1);
                List<JSONObject> items = WidgetData.visible(context);
                for (JSONObject item : items) list.addItem(item.optString("id").hashCode(), WidgetListService.row(context, item));
                views.setRemoteAdapter(R.id.widget_list, list.build());
            } else {
                Intent service = new Intent(context, WidgetListService.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
                service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
                views.setRemoteAdapter(R.id.widget_list, service);
            }
            views.setEmptyView(R.id.widget_list, R.id.widget_empty);
            views.setPendingIntentTemplate(R.id.widget_list, rowClick);
            manager.updateAppWidget(id, views);
        }
        scheduleMidnightRefresh(context, widgetIds);
    }

    /** Kurz nach Mitternacht neu aufbauen, damit „heute“/„überfällig“ ohne Öffnen der App stimmen */
    private static void scheduleMidnightRefresh(Context context, int[] widgetIds) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null || widgetIds.length == 0) return;
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_MONTH, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 1);
        next.set(Calendar.SECOND, 0);
        Intent update = new Intent(context, QuickAddWidget.class)
            .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS,
                AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, QuickAddWidget.class)));
        PendingIntent pending = PendingIntent.getBroadcast(context, 3, update,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        alarms.set(AlarmManager.RTC, next.getTimeInMillis(), pending);   // ungenau genügt, weckt das Gerät nicht
    }
}
