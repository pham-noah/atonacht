package __PACKAGE__

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout

/**
 * The typing half of the "Quick capture" widget.
 *
 * A home screen widget cannot host a text field — RemoteViews has no editor — so a widget that says "Add a task or note"
 * and swallows taps is a lie. This small translucent activity is what the bar opens: a real input with the keyboard up.
 * The text is handed to the app as the same atonacht://capture link the widget used before, so saving still goes through
 * one code path.
 */
class QuickCaptureActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE or WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        window.setBackgroundDrawableResource(android.R.color.transparent)
        window.setGravity(Gravity.BOTTOM)

        val pad = (16 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(0xFF12141F.toInt())
        }

        val field = EditText(this).apply {
            hint = "Add a task or note"
            setTextColor(0xFFF4F2FA.toInt())
            setHintTextColor(0xFFC3C7DD.toInt())
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            setSingleLine(true)
        }
        root.addView(field, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, pad, 0, 0)
        }
        val cancel = Button(this).apply {
            text = "Cancel"
            setOnClickListener { finish() }
        }
        val add = Button(this).apply {
            text = "Add"
            setOnClickListener {
                val text = field.text.toString().trim()
                if (text.isNotEmpty()) {
                    val link = Intent(Intent.ACTION_VIEW, Uri.parse("atonacht://capture?text=" + Uri.encode(text)))
                        .setPackage(packageName)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(link)
                }
                finish()
            }
        }
        row.addView(cancel, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(add, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        setContentView(root)
        field.requestFocus()
    }
}
