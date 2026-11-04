package io.github.mohnstollen.aufgaben;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Unsichtbare Zwischenstation für Klicks in der Widget-Liste: abhaken oder App öffnen */
public class WidgetActionActivity extends Activity {

    static final String EXTRA_ACTION = "action";
    static final String EXTRA_ID = "id";
    static final String ACTION_DONE = "done";
    static final String ACTION_OPEN = "open";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        String id = intent.getStringExtra(EXTRA_ID);
        if (ACTION_DONE.equals(intent.getStringExtra(EXTRA_ACTION)) && id != null) {
            WidgetData.markDone(this, id);
        } else {
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        finish();
    }
}
