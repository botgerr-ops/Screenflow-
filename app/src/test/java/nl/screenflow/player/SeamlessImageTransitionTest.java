package nl.screenflow.player;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.junit.Test;

/** Source-level regressions complement device testing: JVM tests cannot draw Android frames. */
public final class SeamlessImageTransitionTest {
    private static String source() throws Exception {
        Path file=Paths.get("app/src/main/java/nl/screenflow/player/MainActivity.java");
        if(!Files.exists(file))file=Paths.get("..").resolve(file);
        return new String(Files.readAllBytes(file),StandardCharsets.UTF_8);
    }

    @Test public void incomingImageIsPopulatedBeforeBeingAttached() throws Exception {
        String src=source();
        String image=src.substring(src.indexOf("if(playable.mime.startsWith(\"image/\"))"),src.indexOf("}else{\n      clearDisplayedImage();"));
        assertTrue(image.contains("cancelPendingImage()") || src.contains("handler.removeCallbacks(advance);\n    cancelPendingImage();"));
        assertFalse(image.contains("clearDisplayedImage();"));
        assertTrue(image.indexOf("incoming.setImageBitmap(decoded)") < image.indexOf("surface.addView(incoming"));
        assertTrue(image.contains("final ImageView outgoing=displayedImage"));
        assertTrue(image.contains("retiredImage=outgoing;retiredBitmap=displayedBitmap"));
        assertTrue(image.contains("surface.postOnAnimation("));
        assertFalse(image.contains("image.setBackgroundColor(Color.BLACK);\n      surface.addView(image"));
    }

    @Test public void oldFramesRemainUntilNewFramesCommitAndAreEventuallyRecycled() throws Exception {
        String src=source();
        assertTrue(src.contains("private void releaseRetiredImage()"));
        assertTrue(src.contains("if(bitmap!=null&&!bitmap.isRecycled())bitmap.recycle()"));
        assertTrue(src.contains("if(retiredImage==outgoing)releaseRetiredImage()"));
        assertTrue(src.contains("cancelPendingImage();releaseRetiredImage();"));
        assertTrue(src.contains("if(displayedImage==null)showActiveState("));
    }

    @Test public void revokedDeviceNeverDisplaysStaleDecode() throws Exception {
        String src=source();
        assertTrue(src.contains("destroyed||!playbackAuthorized||generation!=imageGeneration||surface!=playbackSurface"));
        assertTrue(src.contains("position!=queueIndex){if(decoded!=null)decoded.recycle();return;}"));
        assertTrue(src.contains("playbackAuthorized=false;"));
        assertTrue(src.contains("stopPlaybackImmediately()"));
    }
}
