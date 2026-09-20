package nl.screenflow.player;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.VideoView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** TEST player: authenticated config polling, private media cache and scheduled fullscreen playback. */
public class MainActivity extends Activity {
  private static final long HEARTBEAT_MS=30_000L, RETRY_MIN_MS=10_000L;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final ExecutorService network=Executors.newSingleThreadExecutor();
  private final ExecutorService imageDecoder=Executors.newSingleThreadExecutor();
  private final SyncGate syncGate=new SyncGate();
  private ConnectivityManager connectivity; private ConnectivityManager.NetworkCallback networkCallback; private boolean networkValidated;
  private PlayerIdentityStore identity; private PlayerApiClient api; private MediaCache cache; private PlayerStateStore state;
  private PairingView pairingView; private long configRevision=0,retryDelay=RETRY_MIN_MS;
  private boolean activeScreen=false, syncSucceeded=false; private String currentPlaylistId=null, playbackFingerprint="";
  /** Once the server reports unpaired/revoked, no timer or cached snapshot may resume old playback. */
  private volatile boolean playbackAuthorized=false;
  private volatile boolean destroyed=false;
  private final Runnable cycle=new Runnable(){@Override public void run(){sync();}};
  private final Runnable advance=new Runnable(){@Override public void run(){advancePlayback();}};
  private final Runnable planningTick=new Runnable(){@Override public void run(){evaluateLocalPlanning();handler.postDelayed(this,15000L);}};
  private final List<Playable> queue=new ArrayList<>(); private int queueIndex=0, imageFailures=0, imageGeneration=0;
  private FrameLayout playbackSurface;
  private VideoView activeVideo;
  private Future<?> pendingImage;
  private ImageView displayedImage, retiredImage;
  private Bitmap displayedBitmap, retiredBitmap;

  private static final class Playable {
    final File file; final String mime; final int duration;
    Playable(File file,String mime,int duration){this.file=file;this.mime=mime;this.duration=duration;}
  }

  @Override protected void onCreate(Bundle savedInstanceState){
    super.onCreate(savedInstanceState);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);enterImmersiveMode();
    identity=new PlayerIdentityStore(this);api=new PlayerApiClient(identity);cache=new MediaCache(this);state=new PlayerStateStore(this);
    playbackAuthorized=identity.hasCredentials()&&!identity.isRecoveryRequired();
    showPairingScreen("Player voorbereiden…");if(playbackAuthorized)restoreOfflineSnapshot();
    connectivity=(ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);networkValidated=isNetworkValidated();
    networkCallback=new ConnectivityManager.NetworkCallback(){
      @Override public void onCapabilitiesChanged(Network n,NetworkCapabilities capabilities){boolean validated=capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);handler.post(()->updateNetworkState(validated));}
      @Override public void onLost(Network n){handler.post(()->updateNetworkState(false));}
    };
    connectivity.registerDefaultNetworkCallback(networkCallback);handler.post(cycle);handler.postDelayed(planningTick,15000L);
  }

  private boolean isNetworkValidated(){Network active=connectivity.getActiveNetwork();if(active==null)return false;NetworkCapabilities capabilities=connectivity.getNetworkCapabilities(active);return capabilities!=null&&capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);}
  private void updateNetworkState(boolean validated){boolean recovered=!networkValidated&&validated;networkValidated=validated;if(recovered){retryDelay=RETRY_MIN_MS;handler.removeCallbacks(cycle);sync();}}
  private void sync(){if(!destroyed)syncGate.request(network,this::performSync);}
  private void recoveryScreen(){
    playbackAuthorized=false;
    identity.clearRejectedIdentity();
    stopPlaybackImmediately();
    clearTenantContent();
    showPairingScreen("Identiteit herstellen via beheerder. Geen nieuwe koppelcode aangemaakt.");
  }
  private void performSync(){try{
    if(identity.isRecoveryRequired()||(!identity.hasCredentials()&&identity.hasPriorRegistration())){
      recoveryScreen();return;
    }
    JSONObject response;
    if(!identity.hasCredentials()){
      // Only a true first install may bootstrap; persist the UID before contacting the server.
      playbackAuthorized=false;clearTenantContent();
      response=api.bootstrap();identity.saveCredentials(response.getString("player_id"),response.getString("player_secret"));
      identity.savePairing(response.optString("pairing_code",""),response.optString("pairing_code_expires_at",""));showPending(response);
    }else{
      response=api.heartbeat(configRevision,syncSucceeded,currentPlaylistId);
      if("active".equals(response.optString("status"))&&response.optBoolean("paired")){
        identity.clearPairing();JSONObject config=api.config();configRevision=config.optLong("config_revision",configRevision);
        playbackAuthorized=true;applyConfig(config);syncSucceeded=true;showActiveState();
      }else{
        playbackAuthorized=false;stopPlaybackImmediately();clearTenantContent();
        if("blocked".equals(response.optString("status"))&&response.optBoolean("unpair_requested",false)){
          // Only the player, AFTER deletion, may acknowledge the request.
          response=api.heartbeat(0,false,null,true);
          if(!"pending".equals(response.optString("status"))||response.optBoolean("paired"))
            throw new IllegalStateException("Ontkoppeling is nog niet bevestigd");
        }
        if("blocked".equals(response.optString("status"))){
          identity.clearPairing();showPairingScreen("Player is beveiligd geblokkeerd. Neem contact op met uw beheerder.");
        }else{
          identity.savePairing(response.optString("pairing_code",""),response.optString("pairing_code_expires_at",""));
          showPending(response);
        }
      }
    }
    retryDelay=RETRY_MIN_MS;schedule(HEARTBEAT_MS);
  }catch(PlayerApiClient.ApiException e){if(e.status==401||e.status==409){
        // Mark recovery BEFORE any wipe; even a crash or wipe failure must not bootstrap.
        try{recoveryScreen();}
        catch(Exception wipeError){playbackAuthorized=false;showPairingScreen("Player geblokkeerd: cache wissen mislukt. Beheerder nodig.");scheduleRetry();}
      }else{restoreOfflineSnapshot();showNetworkError("Verbinding tijdelijk niet beschikbaar.");scheduleRetry();}}
    catch(Exception e){syncSucceeded=false;restoreOfflineSnapshot();showNetworkError("Geen verbinding. Afspelen uit cache blijft alleen actief bij een bestaande koppeling.");scheduleRetry();}
  }

  /** Called on the serialized network executor: invalidate playback before touching private files. */
  private void clearTenantContent(){
    playbackAuthorized=false;syncSucceeded=false;currentPlaylistId=null;configRevision=0;
    state.clear();
    if(state.load()!=null)throw new IllegalStateException("Oude planning kan niet worden verwijderd");
    cache.clearAll();
  }
  private void stopPlaybackImmediately(){
    playbackAuthorized=false;
    CountDownLatch stopped=new CountDownLatch(1);
    AtomicReference<Throwable> stopFailure=new AtomicReference<>();
    handler.post(()->{
      try{
        handler.removeCallbacks(advance);queue.clear();queueIndex=0;playbackFingerprint="";currentPlaylistId=null;
        clearDisplayedImage();
        if(activeVideo!=null){activeVideo.stopPlayback();activeVideo=null;}
        if(playbackSurface!=null){playbackSurface.removeAllViews();playbackSurface=null;}
        activeScreen=false;
        showPairingScreen("Scherm is ontkoppeld. Oude content wordt verwijderd…");
      }catch(Throwable failure){stopFailure.set(failure);}
      finally{stopped.countDown();}
    });
    try{if(!stopped.await(5,TimeUnit.SECONDS))throw new IllegalStateException("Afspelen kon niet veilig worden gestopt");}
    catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Stoppen van afspelen onderbroken",e);}
    if(stopFailure.get()!=null)throw new IllegalStateException("Afspelen kon niet veilig worden gestopt",stopFailure.get());
  }

  private void applyConfig(JSONObject config) throws Exception {
    if(!playbackAuthorized)return;
    JSONObject manifest=config.optJSONObject("manifest");
    if(manifest==null){stopPlayback("Geen configuratie ontvangen.");return;}
    cacheManifestMedia(manifest);if(!playbackAuthorized)return;state.save(configRevision,manifest);
    JSONObject schedule=activeSchedule(manifest.optJSONArray("schedules"));
    if(schedule==null){stopPlayback("Geen actieve planning op dit moment.");return;}
    String playlistId=schedule.optString("playlist_id","");
    if(playlistId.isEmpty()){stopPlayback("Planning bevat geen afspeellijst.");return;}
    JSONArray items=manifest.optJSONArray("playlist_items"),media=manifest.optJSONArray("media");
    Map<String,JSONObject> mediaById=new HashMap<>();
    if(media!=null)for(int i=0;i<media.length();i++){JSONObject value=media.optJSONObject(i);if(value!=null)mediaById.put(value.optString("media_id"),value);}
    List<Playable> next=new ArrayList<>();
    if(items!=null)for(int i=0;i<items.length();i++){
      JSONObject item=items.optJSONObject(i);if(item==null||!playlistId.equals(item.optString("playlist_id")))continue;
      JSONObject source=mediaById.get(item.optString("media_id"));if(source==null)continue;
      String mime=source.optString("mime_type","");if(!mime.startsWith("image/")&&!mime.startsWith("video/"))continue;
      File local=source.has("signed_url")?cache.ensure(source):cache.local(source.optString("media_id"),mime);if(local!=null)next.add(new Playable(local,mime,Math.max(1,item.optInt("duration_seconds",10))));
    }
    if(!playbackAuthorized)return;
    if(next.isEmpty()){stopPlayback("De actieve afspeellijst bevat geen ondersteunde media.");return;}
    String fingerprint=playlistId+"|"+fingerprint(next);currentPlaylistId=playlistId;
    if(fingerprint.equals(playbackFingerprint)&&!queue.isEmpty())return;
    playbackFingerprint=fingerprint;queue.clear();queue.addAll(next);queueIndex=0;imageFailures=0;
    handler.post(()->{if(playbackAuthorized){showActiveState();handler.post(this::startPlayback);}});
  }

  private void cacheManifestMedia(JSONObject manifest) throws Exception {JSONArray media=manifest.optJSONArray("media");java.util.Set<String> allowed=new java.util.HashSet<>();if(media!=null)for(int i=0;i<media.length();i++){JSONObject item=media.optJSONObject(i);if(item!=null){String id=item.optString("media_id","");if(!id.isEmpty())allowed.add(id);if(item.has("signed_url"))cache.ensure(item);}}cache.pruneTo(allowed);}
  private void restoreOfflineSnapshot(){if(!playbackAuthorized)return;try{JSONObject snapshot=state.load();if(snapshot==null)return;configRevision=Math.max(configRevision,snapshot.optLong("config_revision",0));JSONObject config=new JSONObject();config.put("manifest",snapshot);applyConfig(config);syncSucceeded=false;}catch(Exception ignored){}}
  private void evaluateLocalPlanning(){if(!playbackAuthorized)return;try{JSONObject snapshot=state.load();if(snapshot==null)return;JSONObject config=new JSONObject();config.put("manifest",snapshot);applyConfig(config);}catch(Exception ignored){}}

  private JSONObject activeSchedule(JSONArray schedules){
    if(schedules==null)return null;List<JSONObject> matches=new ArrayList<>();
    for(int i=0;i<schedules.length();i++){
      JSONObject schedule=schedules.optJSONObject(i);if(schedule==null||!schedule.optBoolean("active",false))continue;
      try{
        ZoneId zone=ZoneId.of(schedule.optString("timezone","Europe/Amsterdam"));LocalDateTime now=LocalDateTime.now(zone);int day=now.getDayOfWeek().getValue()%7;
        JSONArray configuredDays=schedule.optJSONArray("days_of_week");List<Integer> days=new ArrayList<>();if(configuredDays!=null)for(int n=0;n<configuredDays.length();n++)days.add(configuredDays.optInt(n,-1));
        LocalTime start=LocalTime.parse(schedule.optString("start_time","00:00:00"));LocalTime end=LocalTime.parse(schedule.optString("end_time","23:59:59"));
        if(ScheduleLogic.isActive(days,day,start,end,now.toLocalTime()))matches.add(schedule);
      }catch(Exception ignored){}
    }
    if(matches.isEmpty())return null;matches.sort(Comparator.comparing(s->s.optString("start_time","00:00:00")));return matches.get(0);
  }

  private String fingerprint(List<Playable> values){StringBuilder out=new StringBuilder();for(Playable value:values)out.append(value.file.getName()).append(':').append(value.file.length()).append(':').append(value.duration).append(';');return out.toString();}
  private void startPlayback(){if(!playbackAuthorized||queue.isEmpty())return;activeScreen=true;handler.removeCallbacks(advance);renderCurrent();}
  private void advancePlayback(){if(!playbackAuthorized||queue.isEmpty())return;queueIndex=(queueIndex+1)%queue.size();renderCurrent();}

  /** Invalidate asynchronous decode without discarding the image still visible on screen. */
  private void cancelPendingImage(){
    imageGeneration++;
    if(pendingImage!=null){pendingImage.cancel(true);pendingImage=null;}
  }
  private void releaseRetiredImage(){
    ImageView old=retiredImage;Bitmap bitmap=retiredBitmap;retiredImage=null;retiredBitmap=null;
    if(old!=null){old.setImageDrawable(null);if(old.getParent() instanceof FrameLayout)((FrameLayout)old.getParent()).removeView(old);}
    if(bitmap!=null&&!bitmap.isRecycled())bitmap.recycle();
  }
  /** Revocation, video, Activity destruction and empty planning must release both image buffers. */
  private void clearDisplayedImage(){
    cancelPendingImage();releaseRetiredImage();
    if(displayedImage!=null){displayedImage.setImageDrawable(null);if(displayedImage.getParent() instanceof FrameLayout)((FrameLayout)displayedImage.getParent()).removeView(displayedImage);displayedImage=null;}
    if(displayedBitmap!=null){if(!displayedBitmap.isRecycled())displayedBitmap.recycle();displayedBitmap=null;}
  }
  private void imageFailed(){
    imageFailures++;
    if(imageFailures>=queue.size()){
      handler.removeCallbacks(advance);
      // Keep the last valid frame rather than replacing it with a black/error frame.
      if(displayedImage==null)showActiveState("Geen afbeeldingen konden worden weergegeven. Controleer de mediabestanden.");
    }else handler.postDelayed(advance,1000L);
  }
  private void renderCurrent(){
    if(!playbackAuthorized||queue.isEmpty())return;
    if(playbackSurface==null){showActiveState();if(playbackSurface==null)return;}
    handler.removeCallbacks(advance);
    cancelPendingImage();
    Playable playable=queue.get(queueIndex);
    if(playable.mime.startsWith("image/")){
      final FrameLayout surface=playbackSurface;
      final int generation=imageGeneration, position=queueIndex;
      // Never clear the displayed image here: decoding may take multiple frames.
      if(activeVideo!=null){activeVideo.stopPlayback();activeVideo=null;surface.removeAllViews();}
      final int targetWidth=getResources().getDisplayMetrics().widthPixels;
      final int targetHeight=getResources().getDisplayMetrics().heightPixels;
      pendingImage=imageDecoder.submit(()->{
        Bitmap result=null;
        try{result=SampledImages.decode(playable.file,targetWidth,targetHeight);}
        catch(java.io.IOException|RuntimeException|OutOfMemoryError decodeFailure){/* Skip invalid or oversized media safely. */}
        final Bitmap decoded=result;
        boolean posted=handler.post(()->{
          if(destroyed||!playbackAuthorized||generation!=imageGeneration||surface!=playbackSurface
              ||position!=queueIndex){if(decoded!=null)decoded.recycle();return;}
          pendingImage=null;
          if(decoded==null){imageFailed();return;}
          ImageView incoming=new ImageView(this);
          incoming.setBackgroundColor(Color.BLACK);incoming.setScaleType(ImageView.ScaleType.FIT_CENTER);
          try{
            incoming.setImageBitmap(decoded); // Populate BEFORE attaching to the visible surface.
            surface.addView(incoming,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));
            // At this point the new image completely covers the old one, never black.
            releaseRetiredImage();
            final ImageView outgoing=displayedImage;
            retiredImage=outgoing;retiredBitmap=displayedBitmap;
            displayedImage=incoming;displayedBitmap=decoded;imageFailures=0;
            // Keep outgoing bitmap through the new frame, then recycle on the UI thread.
            if(outgoing!=null)surface.postOnAnimation(()->{if(retiredImage==outgoing)releaseRetiredImage();});
            handler.postDelayed(advance,playable.duration*1000L);
          }catch(RuntimeException|OutOfMemoryError displayFailure){
            if(incoming.getParent() instanceof FrameLayout)((FrameLayout)incoming.getParent()).removeView(incoming);
            incoming.setImageDrawable(null);decoded.recycle();imageFailed();
          }
        });
        if(!posted&&decoded!=null)decoded.recycle();
      });
    }else{
      clearDisplayedImage();
      if(activeVideo!=null){activeVideo.stopPlayback();activeVideo=null;}
      playbackSurface.removeAllViews();
      imageFailures=0;
      VideoView video=new VideoView(this);video.setBackgroundColor(Color.BLACK);video.setVideoURI(Uri.fromFile(playable.file));
      activeVideo=video;
      video.setOnPreparedListener(player->{if(playbackAuthorized&&activeVideo==video)video.start();});
      video.setOnCompletionListener(player->{if(playbackAuthorized&&activeVideo==video)advancePlayback();});
      video.setOnErrorListener((player,what,extra)->{if(playbackAuthorized&&activeVideo==video)handler.postDelayed(advance,1000);return true;});
      playbackSurface.addView(video,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));
    }
  }
  private void stopPlayback(String message){queue.clear();currentPlaylistId=null;playbackFingerprint="";handler.post(()->{clearDisplayedImage();if(activeVideo!=null){activeVideo.stopPlayback();activeVideo=null;}if(playbackAuthorized)showActiveState(message);});}
  private void schedule(long delay){handler.removeCallbacks(cycle);handler.postDelayed(cycle,delay);}
  private void scheduleRetry(){schedule(retryDelay);retryDelay=Math.min(retryDelay*2,5*60_000L);}

  private void showPairingScreen(String initial){handler.post(()->{activeScreen=false;handler.removeCallbacks(advance);clearDisplayedImage();if(pairingView==null)pairingView=new PairingView(this);pairingView.reset(initial);pairingView.network(networkValidated?"Netwerk: verbonden":"Netwerk: verbinding maken…",networkValidated);setContentView(pairingView);});}
  private void showPending(JSONObject response){handler.post(()->{if(playbackAuthorized)return;activeScreen=false;handler.removeCallbacks(advance);clearDisplayedImage();if(pairingView==null)pairingView=new PairingView(this);String code=response.optString("pairing_code",identity.pairingCode()==null?"":identity.pairingCode());String expiry=response.optString("pairing_code_expires_at",identity.pairingExpiresAt()==null?"":identity.pairingExpiresAt());pairingView.pending(code,expiry);pairingView.network(networkValidated?"Netwerk: verbonden":"Netwerk: verbinding maken…",networkValidated);setContentView(pairingView);});}
  private void showActiveState(){showActiveState(null);}
  private void showActiveState(String message){handler.post(()->{if(!playbackAuthorized)return;if(!activeScreen){activeScreen=true;FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.BLACK);playbackSurface=new FrameLayout(this);root.addView(playbackSurface,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));TextView overlay=label("NARROWVISION PLAYER",12,Color.rgb(242,255,98));overlay.setPadding(dp(16),dp(12),dp(16),dp(12));FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT,FrameLayout.LayoutParams.WRAP_CONTENT,Gravity.TOP|Gravity.END);root.addView(overlay,lp);setContentView(root);}if(message!=null){clearDisplayedImage();playbackSurface.removeAllViews();TextView empty=label(message,19,Color.LTGRAY);playbackSurface.addView(empty,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));}});}
  private void showNetworkError(String message){handler.post(()->{if(pairingView!=null&&!activeScreen)pairingView.network("Netwerk: "+message,false);});}
  private TextView label(String text,int size,int color){TextView v=new TextView(this);v.setText(text);v.setTextSize(size);v.setTextColor(color);v.setGravity(Gravity.CENTER);return v;}private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}private void enterImmersiveMode(){getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE);}
  @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(focus)enterImmersiveMode();}@Override protected void onResume(){super.onResume();enterImmersiveMode();}@Override protected void onDestroy(){destroyed=true;playbackAuthorized=false;clearDisplayedImage();if(activeVideo!=null){activeVideo.stopPlayback();activeVideo=null;}handler.removeCallbacksAndMessages(null);if(connectivity!=null&&networkCallback!=null)connectivity.unregisterNetworkCallback(networkCallback);network.shutdownNow();imageDecoder.shutdownNow();super.onDestroy();}
}
