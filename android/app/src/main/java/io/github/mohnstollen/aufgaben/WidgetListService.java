package io.github.mohnstollen.aufgaben;

import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** Liefert die Zeilen der Aufgabenliste im Widget (vor Android 12; ab 12 bekommt das Widget sie direkt) */
public class WidgetListService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    /** Eine Zeile: Kreis antippen = erledigt, Text antippen = App öffnen (Ziel: WidgetActionActivity) */
    static RemoteViews row(Context context, JSONObject item) {
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_item);
        String label = item.optString("label", "");
        row.setTextViewText(R.id.item_text, item.optString("name"));
        row.setTextViewText(R.id.item_label, label);
        row.setViewVisibility(R.id.item_label, label.isEmpty() ? View.GONE : View.VISIBLE);
        String kind = item.optString("kind");
        row.setTextColor(R.id.item_label, "overdue".equals(kind) ? 0xFFFF9AA4 : "quick".equals(kind) ? 0xFFFFD27A : 0xFF9DC0FF);
        row.setOnClickFillInIntent(R.id.item_check, new Intent()
            .putExtra(WidgetActionActivity.EXTRA_ACTION, WidgetActionActivity.ACTION_DONE)
            .putExtra(WidgetActionActivity.EXTRA_ID, item.optString("id")));
        row.setOnClickFillInIntent(R.id.item_body, new Intent()
            .putExtra(WidgetActionActivity.EXTRA_ACTION, WidgetActionActivity.ACTION_OPEN));
        return row;
    }

    private static class Factory implements RemoteViewsFactory {
        private final Context context;
        private List<JSONObject> items = new ArrayList<>();

        Factory(Context context) {
            this.context = context;
        }

        @Override public void onCreate() {}
        @Override public void onDestroy() {}

        @Override
        public void onDataSetChanged() {
            items = WidgetData.visible(context);
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            return position < items.size() ? row(context, items.get(position))
                : new RemoteViews(context.getPackageName(), R.layout.widget_item);
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }
    }
}
