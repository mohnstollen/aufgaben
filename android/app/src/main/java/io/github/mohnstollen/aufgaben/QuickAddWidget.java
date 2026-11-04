package io.github.mohnstollen.aufgaben;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

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
            Intent service = new Intent(context, WidgetListService.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
            views.setRemoteAdapter(R.id.widget_list, service);
            views.setEmptyView(R.id.widget_list, R.id.widget_empty);
            views.setPendingIntentTemplate(R.id.widget_list, rowClick);
            manager.updateAppWidget(id, views);
        }
    }
}
