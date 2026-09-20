package nl.screenflow.player;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.junit.Test;

/** JVM source contracts: physical OEM service compatibility needs a separate device test. */
public final class ProDvxOtaContractTest {
    private static String file(String name) throws Exception {
        Path path=Paths.get(name);
        if(!Files.exists(path)) path=Paths.get("..").resolve(path);
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }

    @Test public void vendorNeedsOnDeviceProvisionedTokenAndValidatedRelease() throws Exception {
        String updater=file("app/src/main/java/nl/screenflow/player/OtaUpdater.java");
        assertTrue(updater.contains("ProDvxTokenStore(activity).isConfigured()"));
        assertTrue(updater.indexOf("verifyApk(apk, target)") < updater.indexOf("ProDvxApi.installAndRun("));
        assertTrue(updater.contains("OtaUpdatePolicy.digestMatches("));
        assertTrue(updater.contains("if (vendor)"));
        assertTrue(updater.contains("install(apk, id, size)"));
        assertTrue(updater.contains("if (BuildConfig.VERSION_CODE >= target)"));
    }

    @Test public void vendorEndpointIsLocalAuthenticatedAndRequestsLaunchNotReboot() throws Exception {
        String api=file("app/src/main/java/nl/screenflow/player/ProDvxApi.java");
        String security=file("app/src/main/res/xml/network_security_config.xml");
        String manifest=file("app/src/main/AndroidManifest.xml");
        assertTrue(api.contains("http://127.0.0.1:3535/v1/"));
        assertTrue(api.contains("Authorization\", \"Bearer \" + token"));
        assertTrue(api.contains("runAfterInstall=true"));
        assertTrue(api.contains("stageVerifiedApk(context, privateApk, hash, size, version)"));
        assertTrue(api.contains("OtaUpdatePolicy.sha256(in)"));
        assertFalse(api.contains("rebootDevice"));
        assertTrue(security.contains("127.0.0.1"));
        assertTrue(security.contains("<base-config cleartextTrafficPermitted=\"false\""));
        assertTrue(manifest.contains("android:networkSecurityConfig=\"@xml/network_security_config\""));
    }

    @Test public void localTokenIsEncryptedNeverHardcodedInApkOrCloud() throws Exception {
        String store=file("app/src/main/java/nl/screenflow/player/ProDvxTokenStore.java");
        String setup=file("app/src/main/java/nl/screenflow/player/ProDvxSetup.java");
        String api=file("app/src/main/java/nl/screenflow/player/ProDvxApi.java");
        assertTrue(store.contains("AndroidKeyStore"));
        assertTrue(store.contains("AES/GCM/NoPadding"));
        assertTrue(setup.contains("ProDvxApi.probe(candidate)"));
        assertFalse(api.contains("ProDVXapi"));
        assertFalse(api.contains("?token="));
    }
}
