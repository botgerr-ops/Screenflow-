package nl.screenflow.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class ImageSampleSizeTest {
    @Test public void fullHdNeedsNoSampling() {
        assertEquals(1, ImageSampleSize.calculate(1920, 1080, 1920, 1080));
    }
    @Test public void largeJpegIsBounded() {
        assertEquals(8, ImageSampleSize.calculate(12000, 8000, 1920, 1080));
    }
    @Test public void portraitDisplayIsBounded() {
        assertEquals(4, ImageSampleSize.calculate(4000, 6000, 1080, 1920));
    }
    @Test public void highCompressionDoesNotCircumventDimensionGuard() {
        int sample = ImageSampleSize.calculate(30000, 20000, 1920, 1080);
        assertTrue(30000 / sample <= 1920);
        assertTrue(20000 / sample <= 1080);
    }
    @Test(expected = IllegalArgumentException.class)
    public void rejectInvalidDimensions() { ImageSampleSize.calculate(0, 900, 1920, 1080); }
}
