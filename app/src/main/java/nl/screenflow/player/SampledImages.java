package nl.screenflow.player;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.File;
import java.io.IOException;

/** Only invoked by the image worker, never on Android's UI thread. */
final class SampledImages {
    private SampledImages() {}

    static Bitmap decode(File file, int displayWidth, int displayHeight) throws IOException {
        if (file == null || !file.isFile()) throw new IOException("Image unavailable");
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IOException("Invalid image");
        // Bound decompressed pixels, not the compressed byte count; preserve portrait dimensions.
        final boolean landscape = displayWidth >= displayHeight;
        int width = Math.max(1, Math.min(landscape ? 1920 : 1080, displayWidth));
        int height = Math.max(1, Math.min(landscape ? 1080 : 1920, displayHeight));
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = ImageSampleSize.calculate(bounds.outWidth, bounds.outHeight, width, height);
        options.inPreferredConfig = Bitmap.Config.ARGB_8888; // Preserve transparent PNG assets.
        Bitmap result = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        if (result == null) throw new IOException("Image decode failed");
        return result;
    }
}
