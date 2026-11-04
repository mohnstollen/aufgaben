package io.github.mohnstollen.aufgaben;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.TileService;

/** Kachel „＋ Aufgabe“ in den Schnelleinstellungen (Statusleiste herunterziehen) */
public class QuickAddTileService extends TileService {

    @Override
    @SuppressWarnings("deprecation")
    public void onClick() {
        Intent intent = new Intent(this, QuickAddActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= 34) {
            PendingIntent pending = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            startActivityAndCollapse(pending);
        } else {
            startActivityAndCollapse(intent);
        }
    }
}
