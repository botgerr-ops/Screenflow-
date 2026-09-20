package nl.screenflow.player;

import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class OtaUpdatePolicyTest {
    private static final String HASH = "a".repeat(64);
    private static final String URL = "https://bqapbwsvfofgnfogwhdx.supabase.co/storage/v1/object/sign/nv-player-releases/123e4567-e89b-42d3-a456-426614174000/app-release.apk?token=signed";

    @Test public void acceptsOnlyNewerSamePackageAndTrustedSignedObject() {
        assertTrue(OtaUpdatePolicy.canInstall(16, 17, "nl.screenflow.player", URL, HASH));
        assertFalse(OtaUpdatePolicy.canInstall(16, 16, "nl.screenflow.player", URL, HASH));
        assertFalse(OtaUpdatePolicy.canInstall(16, 15, "nl.screenflow.player", URL, HASH));
        assertFalse(OtaUpdatePolicy.canInstall(16, 17, "com.other", URL, HASH));
        assertFalse(OtaUpdatePolicy.canInstall(16, 17, "nl.screenflow.player", URL, ""));
    }

    @Test public void rejectsRedirectHostsUnsignedAndTraversalObjects() {
        assertFalse(OtaUpdatePolicy.isAllowedUrl("http://bqapbwsvfofgnfogwhdx.supabase.co" + URL.substring("https://bqapbwsvfofgnfogwhdx.supabase.co".length())));
        assertFalse(OtaUpdatePolicy.isAllowedUrl(URL.replace(".supabase.co/", ".supabase.co.evil.example/")));
        assertFalse(OtaUpdatePolicy.isAllowedUrl(URL.replace("?token=signed", "")));
        assertFalse(OtaUpdatePolicy.isAllowedUrl(URL.replace("app-release.apk", "../app-release.apk")));
        assertFalse(OtaUpdatePolicy.isAllowedUrl(URL.replace("app-release.apk", "app%2Frelease.apk")));
        assertFalse(OtaUpdatePolicy.isAllowedUrl(URL + "#fragment"));
    }

    @Test public void verifiesActualBytesWithSha256() throws Exception {
        String digest = OtaUpdatePolicy.sha256(new ByteArrayInputStream("abc".getBytes(StandardCharsets.UTF_8)));
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", digest);
        assertTrue(OtaUpdatePolicy.digestMatches(digest, digest.toUpperCase(java.util.Locale.ROOT)));
        assertFalse(OtaUpdatePolicy.digestMatches(digest, HASH));
    }
}
