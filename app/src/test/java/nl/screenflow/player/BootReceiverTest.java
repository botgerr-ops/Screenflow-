package nl.screenflow.player;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import org.junit.Test;

/** Do not relaunch for arbitrary package broadcasts or a null action. */
public final class BootReceiverTest {
    @Test public void restartsWhenThisApplicationWasUpdated() {
        assertTrue(BootReceiver.shouldLaunch(Intent.ACTION_MY_PACKAGE_REPLACED));
    }

    @Test public void preservesExistingBootAutostart() {
        assertTrue(BootReceiver.shouldLaunch(Intent.ACTION_BOOT_COMPLETED));
    }

    @Test public void ignoresUnrelatedEvents() {
        assertFalse(BootReceiver.shouldLaunch(null));
        assertFalse(BootReceiver.shouldLaunch(Intent.ACTION_PACKAGE_REPLACED));
        assertFalse(BootReceiver.shouldLaunch(Intent.ACTION_PACKAGE_ADDED));
    }
}
