package nl.screenflow.player;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
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
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** TEST player: authenticated config polling, private media cache and scheduled fullscreen playback. */
public class MainActivity extends Activity {
  private static final long HEARTBEAT_MS=30_000L, RETRY_MIN_MS=10_000L;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final ExecutorService network=Executors.newSingleThreadExecutor(); private final AtomicBoolean syncRunning=new AtomicBoolean(false); private ConnectivityManager connectivity; private ConnectivityManager.NetworkCallback networkCallback;
  private PlayerIdentityStore identity; private PlayerApiClient api; private MediaCache cache; private PlayerStateStore state;
  private TextView status,detail,networkStatus; private long configRevision=0,retryDelay=RETRY_MIN_MS;
  private boolean activeScreen=false, syncSucceeded=false; private String currentPlaylistId=null, playbackFingerprint="";
  private final Runnable cycle=new Runnable(){@Override public void run(){sync();}};
  private final Runnable advance=new Runnable(){@Override public void run(){advancePlayback();}};
  private final Runnable planningTick=new Runnable(){@Override public void run(){evaluateLocalPlanning();handler.postDelayed(this,15000L);}};
  private final List<Playable> queue=new ArrayList<>(); private int queueIndex=0; private FrameLayout playbackSurface;

  private static final class Playable {
    final File file; final String mime; final int duration;
    Playable(File file,String mime,int duration){this.file=file;this.mime=mime;this.duration=duration;}
  }

  @Override protected void onCreate(Bundle state){
    super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);enterImmersiveMode();
    identity=new PlayerIdentityStore(this);api=new PlayerApiClient(identity);cache=new MediaCache(this);state=new PlayerStateStore(this);
    showPairingScreen("Player voorbereiden…");if(identity.hasCredentials())restoreOfflineSnapshot();connectivity=(ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);networkCallback=new ConnectivityManager.NetworkCallback(){@Override public void onAvailable(Network n){handler.post(()->{retryDelay=RETRY_MIN_MS;sync();});}};connectivity.registerDefaultNetworkCallback(networkCallback);handler.post(cycle);handler.postDelayed(planningTick,15000L);
  }

  private void sync(){if(!syncRunning.compareAndSet(false,true))return;network.execute(()->{try{
    JSONObject response;
    if(!identity.hasCredentials()){
      response=api.bootstrap();identity.saveCredentials(response.getString("player_id"),response.getString("player_secret"));
      identity.savePairing(response.optString("pairing_code",""),response.optString("pairing_code_expires_at",""));showPending(response);
    }else{
      response=api.heartbeat(configRevision,syncSucceeded,currentPlaylistId);
      if("active".equals(response.optString("status"))&&response.optBoolean("paired")){
        identity.clearPairing();JSONObject config=api.config();configRevision=config.optLong("config_revision",configRevision);
        applyConfig(config);syncSucceeded=true;showActiveState();
      }else{syncSucceeded=false;currentPlaylistId=null;showPending(response);}
    }
    retryDelay=RETRY_MIN_MS;schedule(HEARTBEAT_MS);
  }catch(PlayerApiClient.ApiException e){if(e.status==401){identity.clearCredentials();state.clear();showPairingScreen("Playeridentiteit moet opnieuw worden gekoppeld.");}else{restoreOfflineSnapshot();showNetworkError("Verbinding tijdelijk niet beschikbaar.");}scheduleRetry();}
    catch(Exception e){syncSucceeded=false;restoreOfflineSnapshot();showNetworkError("Geen verbinding. Afspelen uit cache blijft actief.");scheduleRetry();} finally {syncRunning.set(false);}
  });}

  private void applyConfig(JSONObject config) throws Exception {
    JSONObject manifest=config.optJSONObject("manifest");
    if(manifest==null){stopPlayback("Geen configuratie ontvangen.");return;}
    cacheManifestMedia(manifest); state.save(configRevision, manifest);
    JSONObject schedule=activeSchedule(manifest.optJSONArray("schedules"));
    if(schedule==null){stopPlayback("Geen actieve planning op dit moment.");return;}
    String playlistId=schedule.optString("playlist_id","");
    if(playlistId.isEmpty()){stopPlayback("Planning bevat geen afspeellijst.");return;}

    JSONArray items=manifest.optJSONArray("playlist_items"); JSONArray media=manifest.optJSONArray("media");
    Map<String,JSONObject> mediaById=new HashMap<>();
    if(media!=null)for(int i=0;i<media.length();i++){JSONObject value=media.optJSONObject(i);if(value!=null)mediaById.put(value.optString("media_id"),value);}
    List<Playable> next=new ArrayList<>();
    if(items!=null)for(int i=0;i<items.length();i++){
      JSONObject item=items.optJSONObject(i);if(item==null||!playlistId.equals(item.optString("playlist_id")))continue;
      JSONObject source=mediaById.get(item.optString("media_id"));if(source==null)continue;
      String mime=source.optString("mime_type","");if(!mime.startsWith("image/")&&!mime.startsWith("video/"))continue;
      File local=source.has("signed_url")?cache.ensure(source):cache.local(source.optString("media_id"),mime); if(local!=null)next.add(new Playable(local,mime,Math.max(1,item.optInt("duration_seconds",10))));
    }
    if(next.isEmpty()){stopPlayback("De actieve afspeellijst bevat geen ondersteunde media.");return;}
    String fingerprint=playlistId+"|"+fingerprint(next);
    currentPlaylistId=playlistId;
    if(fingerprint.equals(playbackFingerprint)&&!queue.isEmpty())return;
    playbackFingerprint=fingerprint;queue.clear();queue.addAll(next);queueIndex=0;handler.post(()->{showActiveState();handler.post(this::startPlayback);});
  }

  private void cacheManifestMedia(JSONObject manifest) throws Exception { JSONArray media=manifest.optJSONArray("media"); java.util.Set<String> allowed=new java.util.HashSet<>(); if(media!=null)for(int i=0;i<media.length();i++){JSONObject item=media.optJSONObject(i);if(item!=null){String id=item.optString("media_id","");if(!id.isEmpty())allowed.add(id);if(item.has("signed_url"))cache.ensure(item);}} cache.pruneTo(allowed); }
  private void restoreOfflineSnapshot(){ try{JSONObject snapshot=state.load();if(snapshot==null)return;configRevision=Math.max(configRevision,snapshot.optLong("config_revision",0));JSONObject config=new JSONObject();config.put("manifest",snapshot);applyConfig(config);syncSucceeded=false;}catch(Exception ignored){} }
  private void evaluateLocalPlanning(){try{JSONObject snapshot=state.load();if(snapshot==null)return;JSONObject config=new JSONObject();config.put("manifest",snapshot);applyConfig(config);}catch(Exception ignored){}}

  private JSONObject activeSchedule(JSONArray schedules){
    if(schedules==null)return null;
    List<JSONObject> matches=new ArrayList<>();
    for(int i=0;i<schedules.length();i++){
      JSONObject schedule=schedules.optJSONObject(i);if(schedule==null||!schedule.optBoolean("active",false))continue;
      try{
        ZoneId zone=ZoneId.of(schedule.optString("timezone","Europe/Amsterdam"));
        LocalDateTime now=LocalDateTime.now(zone);int day=now.getDayOfWeek().getValue()%7;
        JSONArray configuredDays=schedule.optJSONArray("days_of_week");List<Integer> days=new ArrayList<>();
        if(configuredDays!=null)for(int n=0;n<configuredDays.length();n++)days.add(configuredDays.optInt(n,-1));
        LocalTime start=LocalTime.parse(schedule.optString("start_time","00:00:00"));
        LocalTime end=LocalTime.parse(schedule.optString("end_time","23:59:59"));
        if(ScheduleLogic.isActive(days,day,start,end,now.toLocalTime()))matches.add(schedule);
      }catch(Exception ignored){}
    }
    if(matches.isEmpty())return null;
    matches.sort(Comparator.comparing(s->s.optString("start_time","00:00:00")));
    return matches.get(0);
  }

  private String fingerprint(List<Playable> values){StringBuilder out=new StringBuilder();for(Playable value:values)out.append(value.file.getName()).append(':').append(value.file.length()).append(':').append(value.duration).append(';');return out.toString();}

  private void startPlayback(){if(queue.isEmpty())return;activeScreen=true;handler.removeCallbacks(advance);renderCurrent();}
  private void advancePlayback(){if(queue.isEmpty())return;queueIndex=(queueIndex+1)%queue.size();renderCurrent();}
  private void renderCurrent(){
    if(playbackSurface==null){showActiveState();if(playbackSurface==null)return;}
    playbackSurface.removeAllViews();Playable playable=queue.get(queueIndex);
    if(playable.mime.startsWith("image/")){
      ImageView image=new ImageView(this);image.setBackgroundColor(Color.BLACK);image.setScaleType(ImageView.ScaleType.FIT_CENTER);image.setImageURI(Uri.fromFile(playable.file));
      playbackSurface.addView(image,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));
      handler.postDelayed(advance,playable.duration*1000L);
    }else{
      VideoView video=new VideoView(this);video.setBackgroundColor(Color.BLACK);video.setVideoURI(Uri.fromFile(playable.file));
      video.setOnPreparedListener(player->{player.setLooping(false);video.start();});
      video.setOnCompletionListener(player->advancePlayback());
      video.setOnErrorListener((player,what,extra)->{handler.postDelayed(advance,1000);return true;});
      playbackSurface.addView(video,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));
    }
  }

  private void stopPlayback(String message){queue.clear();currentPlaylistId=null;playbackFingerprint="";handler.post(()->showActiveState(message));}
  private void schedule(long delay){handler.removeCallbacks(cycle);handler.postDelayed(cycle,delay);}
  private void scheduleRetry(){schedule(retryDelay);retryDelay=Math.min(retryDelay*2,5*60_000L);}

  private void showPairingScreen(String initial){handler.post(()->{activeScreen=false;handler.removeCallbacks(advance);LinearLayout box=base();TextView brand=label("NARROWVISION",22,Color.rgb(242,255,98));brand.setLetterSpacing(.14f);TextView title=label("Deze player is nog niet gekoppeld.",28,Color.WHITE);status=label(initial,18,Color.rgb(18,20,22));badge(status);detail=label("Apparaat: "+android.os.Build.MANUFACTURER+" "+android.os.Build.MODEL+"\nAndroid "+android.os.Build.VERSION.RELEASE,14,Color.rgb(170,174,180));networkStatus=label("Netwerk: verbinding maken",13,Color.rgb(170,174,180));box.addView(brand);box.addView(space(20));box.addView(title);box.addView(space(20));box.addView(status);box.addView(space(20));box.addView(detail);box.addView(space(10));box.addView(networkStatus);setContentView(box);});}
  private void showPending(JSONObject response){handler.post(()->{if(activeScreen||status==null)showPairingScreen("Pairingcode ophalen…");String code=response.optString("pairing_code",identity.pairingCode()==null?"":identity.pairingCode());String expiry=response.optString("pairing_code_expires_at",identity.pairingExpiresAt()==null?"":identity.pairingExpiresAt());status.setText(code.isEmpty()?"Wachten op koppeling…":formatCode(code));status.setTextSize(code.isEmpty()?18:34);detail.setText("Voer deze code in NarrowVision Admin in.\n"+(expiry.isEmpty()?"Deze player wacht veilig op koppeling.":"Geldig tot: "+expiry));networkStatus.setText("Netwerk: verbonden · controle iedere 30 seconden");});}
  private void showActiveState(){showActiveState(null);}
  private void showActiveState(String message){handler.post(()->{if(!activeScreen){activeScreen=true;FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.BLACK);playbackSurface=new FrameLayout(this);root.addView(playbackSurface,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));TextView overlay=label("NARROWVISION PLAYER",12,Color.rgb(242,255,98));overlay.setPadding(dp(16),dp(12),dp(16),dp(12));FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT,FrameLayout.LayoutParams.WRAP_CONTENT,Gravity.TOP|Gravity.END);root.addView(overlay,lp);setContentView(root);}if(message!=null){playbackSurface.removeAllViews();TextView empty=label(message,19,Color.LTGRAY);playbackSurface.addView(empty,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));}});}
  private void showNetworkError(String message){handler.post(()->{if(networkStatus!=null)networkStatus.setText("Netwerk: "+message);});}
  private LinearLayout base(){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setGravity(Gravity.CENTER);box.setPadding(dp(42),dp(42),dp(42),dp(42));box.setBackgroundColor(Color.rgb(16,17,20));return box;}
  private TextView label(String text,int size,int color){TextView v=new TextView(this);v.setText(text);v.setTextSize(size);v.setTextColor(color);v.setGravity(Gravity.CENTER);return v;} private View space(int size){View v=new View(this);v.setLayoutParams(new LinearLayout.LayoutParams(1,dp(size)));return v;}
  private void badge(TextView v){v.setPadding(dp(24),dp(14),dp(24),dp(14));GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(242,255,98));bg.setCornerRadius(dp(16));v.setBackground(bg);} private String formatCode(String code){String clean=code.replaceAll("[^A-Za-z0-9]","");StringBuilder out=new StringBuilder();for(int i=0;i<clean.length();i++){if(i>0&&i%4==0)out.append('-');out.append(clean.charAt(i));}return out.toString();}
  private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);} private void enterImmersiveMode(){getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE);}
  @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(focus)enterImmersiveMode();}@Override public void onResume(){super.onResume();enterImmersiveMode();}@Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);if(connectivity!=null&&networkCallback!=null)connectivity.unregisterNetworkCallback(networkCallback);network.shutdownNow();super.onDestroy();}
}
