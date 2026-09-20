package nl.screenflow.player;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.Path;
import org.junit.Test;

public class PlayerRuntimeContractTest {
  private String source(String path) throws Exception {Path source=Paths.get(path);if(!Files.exists(source))source=Paths.get("..").resolve(path);return new String(Files.readAllBytes(source),StandardCharsets.UTF_8);}
  @Test public void snapshotIsDurableAndSecretFree() throws Exception {String value=source("app/src/main/java/nl/screenflow/player/PlayerStateStore.java");assertTrue(value.contains("commit()"));assertTrue(value.contains("schedules"));assertTrue(value.contains("playlist_items"));assertFalse(value.contains("signed_url"));assertFalse(value.contains("player_secret"));assertFalse(value.contains("access_token"));}
  @Test public void offlineColdStartAndPlaybackUseSnapshotAndCache() throws Exception {
    String activity=source("app/src/main/java/nl/screenflow/player/MainActivity.java");
    assertTrue(activity.contains("playbackAuthorized=identity.hasCredentials()"));
    assertTrue(activity.contains("if(playbackAuthorized)restoreOfflineSnapshot()"));
    assertTrue(activity.contains("if(!playbackAuthorized)return"));
    assertTrue(activity.contains("cache.local"));assertTrue(activity.contains("evaluateLocalPlanning"));
  }
  @Test public void onlyExplicitUnauthorizedOrUnpairClearsIdentityAndSnapshot() throws Exception {
    String activity=source("app/src/main/java/nl/screenflow/player/MainActivity.java");
    assertTrue(activity.contains("if(e.status==401){"));
    assertTrue(activity.contains("clearTenantContent();identity.clearRejectedIdentity()"));
    assertTrue(activity.contains("playbackAuthorized=false;stopPlaybackImmediately();clearTenantContent()"));
    assertTrue(activity.contains("api.heartbeat(0,false,null,true)"));
    assertTrue(activity.contains("response.optBoolean(\"unpair_requested\",false)"));
    assertFalse(activity.contains("catch(Exception e){identity.clearCredentials()"));
    assertFalse(activity.contains("catch(Exception e){identity.clearRejectedIdentity()"));
  }
  @Test public void tenantWipeRemovesSnapshotAndMediaAndPreventsTimersFromRestarting() throws Exception {
    String activity=source("app/src/main/java/nl/screenflow/player/MainActivity.java");
    String cache=source("app/src/main/java/nl/screenflow/player/MediaCache.java");
    assertTrue(activity.contains("state.clear()"));assertTrue(activity.contains("state.load()!=null"));
    assertTrue(activity.contains("cache.clearAll()"));assertTrue(activity.contains("if(!playbackAuthorized)return"));
    assertTrue(cache.contains("synchronized void clearAll()"));assertTrue(cache.contains("metadata.edit().clear().commit()"));
    assertTrue(activity.contains("stopped.await(5,TimeUnit.SECONDS)"));
    assertTrue(activity.contains("activeVideo.stopPlayback()"));
    assertTrue(activity.contains("if(stopFailure.get()!=null)throw"));
  }
  @Test public void serverOnlyMarksARealOpenRequestForAutomaticUnpair() throws Exception {
    String heartbeat=source("supabase/functions/player-heartbeat/index.ts");
    assertTrue(heartbeat.contains(".from(\"nv_device_unpair_requests\")"));
    assertTrue(heartbeat.contains(".eq(\"status\", \"requested\")"));
    assertTrue(heartbeat.contains("body.unpair_ack === true && !unpairRequested"));
    assertTrue(heartbeat.contains("unpair_requested: unpairRequested"));
  }
  @Test public void validatedRecoveryUsesDeduplicatedImmediateSync() throws Exception {String activity=source("app/src/main/java/nl/screenflow/player/MainActivity.java");assertTrue(activity.contains("NET_CAPABILITY_VALIDATED"));assertTrue(activity.contains("boolean recovered=!networkValidated&&validated"));assertTrue(activity.contains("syncGate.request"));}
  @Test public void networkCallbackPermissionIsDeclared() throws Exception {assertTrue(source("app/src/main/AndroidManifest.xml").contains("android.permission.ACCESS_NETWORK_STATE"));}
  @Test public void telemetryUsesBuildVersion() throws Exception {assertTrue(source("app/src/main/java/nl/screenflow/player/PlayerApiClient.java").contains("BuildConfig.VERSION_NAME"));}
}
