package __PACKAGE__

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** Receives text shared from other apps and hands it to Atonacht's quick capture as atonacht://capture?text=... */
class ShareReceiverActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = intent?.getStringExtra(Intent.EXTRA_TEXT) ?: intent?.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
        val open = Intent(Intent.ACTION_VIEW, Uri.parse("atonacht://capture?text=" + Uri.encode(text.take(500))))
            .setPackage(packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(open)
        finish()
    }
}
