package nl.screenflow.player;

/** Pure policy, kept separate from Android bitmap APIs for deterministic JVM tests. */
final class ImageSampleSize {
    private ImageSampleSize() {}

    static int calculate(int width, int height, int targetWidth, int targetHeight) {
        if (width <= 0 || height <= 0 || targetWidth <= 0 || targetHeight <= 0) {
            throw new IllegalArgumentException("Invalid image dimensions");
        }
        // Preserve aspect ratio, including portrait displays. Android supports power-of-two sampling.
        int sample = 1;
        while ((long) width > (long) targetWidth * sample
                || (long) height > (long) targetHeight * sample) {
            if (sample >= 1 << 29) throw new IllegalArgumentException("Image dimensions too large");
            sample <<= 1;
        }
        return sample;
    }
}
