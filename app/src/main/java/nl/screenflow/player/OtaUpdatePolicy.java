package nl.screenflow.player;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.regex.Pattern;

/** Validation boundary for a manager-approved NarrowVision TEST APK update.
 * No installation or download is performed by this class. Never accept an
 * arbitrary URL, a downgrade, a different package name or an absent digest.
 */
public final class OtaUpdatePolicy {
    public static final String APPLICATION_ID = "nl.screenflow.player";
    private static final String HOST = "bqapbwsvfofgnfogwhdx.supabase.co";
    private static final String PREFIX = "/storage/v1/object/sign/nv-player-releases/";
    private static final Pattern RELEASE_PATH = Pattern.compile("[0-9a-fA-F-]{36}/[A-Za-z0-9._-]+\\.apk");
    private static final Pattern SHA256 = Pattern.compile("[0-9a-fA-F]{64}");

    private OtaUpdatePolicy() { }

    public static boolean canInstall(int installedCode, int targetCode, String packageName,
                                     String downloadUrl, String expectedSha256) {
        return installedCode > 0 && targetCode > installedCode
                && APPLICATION_ID.equals(packageName)
                && isAllowedUrl(downloadUrl)
                && expectedSha256 != null && SHA256.matcher(expectedSha256).matches();
    }

    public static boolean isAllowedUrl(String value) {
        if (value == null || value.length() > 4096) return false;
        try {
            URI uri = new URI(value);
            if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())
                    || uri.getPort() != -1 || uri.getUserInfo() != null
                    || uri.getFragment() != null || uri.getRawPath() == null
                    || !uri.getRawPath().startsWith(PREFIX)) return false;
            String remaining = uri.getRawPath().substring(PREFIX.length());
            // Do not permit encoded path separators, traversal, or arbitrary storage objects.
            if (!RELEASE_PATH.matcher(remaining).matches() || remaining.contains("..")) return false;
            String query = uri.getRawQuery();
            if (query == null || query.length() > 2048) return false;
            for (String parameter : query.split("&")) {
                if (parameter.startsWith("token=") && parameter.length() > 6) return true;
            }
            return false;
        } catch (Exception invalid) { return false; }
    }

    public static String sha256(InputStream input) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (count > 0) digest.update(buffer, 0, count);
            }
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }

    public static boolean digestMatches(String actual, String expected) {
        return actual != null && expected != null && SHA256.matcher(expected).matches()
                && MessageDigest.isEqual(actual.toLowerCase(Locale.ROOT).getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                        expected.toLowerCase(Locale.ROOT).getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    }
}
