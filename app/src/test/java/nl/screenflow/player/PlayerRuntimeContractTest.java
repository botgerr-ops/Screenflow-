package nl.screenflow.player;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.Test;

public class PlayerRuntimeContractTest {
  private String source(String path) throws Exception {return new String(Files.readAllBytes(Paths.get(path)),StandardCharsets.UTF_8);}
  @Test public void snapshotIsDurableAndSecretFree() throws Exception {String value=source("app/src/main/java/nl/screenflow/player/PlayerStateStore.java");assertTrue(value.contains("commit()"));assertTrue(value.contains("schedules"));assertTrue(value.contains("playlist_items"));assertFalse(value.contains("signed_url"));assertFalse(value.contains("player_secret"));assertFalse(value.contains("access_token"));}
  @Test public void offlineColdStartAndPlaybackUseSnapshotAndCache() throws Exception {String activity=source("app/src/main/java/nl/screenflow/player/MainActivity.java");assertTrue(activity.contains("if(identity.hasCredentials())restoreOfflineSnapshot()"));assertTrue(activity.contains("cache.local"));assertTrue(activity.contains("evaluateLocalPlanning"));}
  @Test public void onlyExplicitUnauthorizedClearsIdentityAndSnapshot() throws Exception {String activity=source("app/src/main/java/nl/screenflow/player/MainActivity.java");assertTrue(activity.contains("if(e.status==401){identity.clearCredentials();state.clear()"));assertFalse(activity.contains("catch(Exception e){identity.clearCredentials()"));}
  @Test public void validatedRecoveryUsesDeduplicatedImmediateSync() throws Exception {String activity=source("app/src/main/java/nl/screenflow/player/MainActivity.java");assertTrue(activity.contains("NET_CAPABILITY_VALIDATED"));assertTrue(activity.contains("boolean recovered=!networkValidated&&validated"));assertTrue(activity.contains("syncGate.request"));}
  @Test public void telemetryUsesBuildVersion() throws Exception {assertTrue(source("app/src/main/java/nl/screenflow/player/PlayerApiClient.java").contains("BuildConfig.VERSION_NAME"));}
}
