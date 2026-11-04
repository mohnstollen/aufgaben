package io.github.mohnstollen.aufgaben;

import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Kleiner Eingabedialog „Neue Aufgabe“, der über jeder App erscheint – ohne die ganze App zu starten.
 * Aufrufbar über App-Verknüpfung, Schnelleinstellungen-Kachel, Widget und „Teilen“.
 */
public class QuickAddActivity extends AppCompatActivity {

    private EditText input;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_quick_add);
        setFinishOnTouchOutside(true);

        input = findViewById(R.id.quick_input);
        Intent intent = getIntent();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            input.setText(sharedText(intent));
            input.setSelection(input.getText().length());
        }
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                submit();
                return true;
            }
            return false;
        });
        findViewById(R.id.quick_add).setOnClickListener(v -> submit());
        findViewById(R.id.quick_cancel).setOnClickListener(v -> finish());

        input.requestFocus();
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
    }

    /** Geteilter Text, z. B. Betreff und Link aus einer Mail oder dem Browser */
    private static String sharedText(Intent intent) {
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (subject != null && text != null && !text.contains(subject)) return (subject + " " + text).trim();
        if (text != null) return text.trim();
        return subject != null ? subject.trim() : "";
    }

    private void submit() {
        String text = input.getText().toString().replaceAll("\\s+", " ").trim();
        if (!text.isEmpty()) {
            QuickInboxPlugin.add(this, text);
            Toast.makeText(this, R.string.quick_add_saved, Toast.LENGTH_SHORT).show();
        }
        finish();
    }
}
