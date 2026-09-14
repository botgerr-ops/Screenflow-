package nl.screenflow.player;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import java.text.DateFormat;
import java.util.Date;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Player 0.5 management-plane client. Offline playback/cache intentionally remains a later phase. */
public class MainActivity extends Activity {
  private static final long HEARTBEAT_MS=30_000L, RETRY_MIN_MS=10_000L;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private final ExecutorService network=Executors.newSingleThreadExecutor();
  private PlayerIdentityStore identity; private PlayerApiClient api;
  private TextView status,detail,networkStatus; private long configRevision=0,retryDelay=RETRY_MIN_MS; private boolean activeScreen=false;
  private final Runnable cycle=new Runnable(){@Override public void run(){sync();}};
  @Override protected void onCreate(Bundle state){super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);enterImmersiveMode();identity=new PlayerIdentityStore(this);api=new PlayerApiClient(identity);showPairingScreen("Player voorbereiden…");handler.post(cycle);}
  private void sync(){network.execute(()->{try{
    JSONObject response;
    if(!identity.hasCredentials()){response=api.bootstrap();identity.saveCredentials(response.getString("player_id"),response.getString("player_secret"));identity.savePairing(response.optString("pairing_code",""),response.optString("pairing_code_expires_at",""));showPending(response);}
    else {response=api.heartbeat(configRevision);if("active".equals(response.optString("status"))&&response.optBoolean("paired")){identity.clearPairing();JSONObject config=api.config();configRevision=config.optLong("config_revision",configRevision);showActive(config);}else showPending(response);}
    retryDelay=RETRY_MIN_MS;schedule(HEARTBEAT_MS);
  }catch(PlayerApiClient.ApiException e){if(e.status==401)showPairingScreen("Playeridentiteit moet opnieuw worden gekoppeld.");else showNetworkError("Verbinding tijdelijk niet beschikbaar.");scheduleRetry();}catch(Exception e){showNetworkError("Geen verbinding. Nieuwe poging volgt automatisch.");scheduleRetry();}});}
  private void schedule(long delay){handler.removeCallbacks(cycle);handler.postDelayed(cycle,delay);} private void scheduleRetry(){schedule(retryDelay);retryDelay=Math.min(retryDelay*2,5*60_000L);}
  private void showPairingScreen(String initial){handler.post(()->{activeScreen=false;LinearLayout box=base();TextView brand=label("NARROWVISION",22,Color.rgb(242,255,98));brand.setLetterSpacing(.14f);TextView title=label("Deze player is nog niet gekoppeld.",28,Color.WHITE);status=label(initial,18,Color.rgb(18,20,22));badge(status);detail=label("Apparaat: "+android.os.Build.MANUFACTURER+" "+android.os.Build.MODEL+"\nAndroid "+android.os.Build.VERSION.RELEASE,14,Color.rgb(170,174,180));networkStatus=label("Netwerk: verbinding maken",13,Color.rgb(170,174,180));box.addView(brand);box.addView(space(20));box.addView(title);box.addView(space(20));box.addView(status);box.addView(space(20));box.addView(detail);box.addView(space(10));box.addView(networkStatus);setContentView(box);});}
  private void showPending(JSONObject response){handler.post(()->{if(activeScreen||status==null)showPairingScreen("Pairingcode ophalen…");String code=response.optString("pairing_code",identity.pairingCode()==null?"":identity.pairingCode());String expiry=response.optString("pairing_code_expires_at",identity.pairingExpiresAt()==null?"":identity.pairingExpiresAt());status.setText(code.isEmpty()?"Wachten op koppeling…":formatCode(code));status.setTextSize(code.isEmpty()?18:34);detail.setText("Voer deze code in NarrowVision Admin in.\n"+(expiry.isEmpty()?"Deze player wacht veilig op koppeling.":"Geldig tot: "+expiry));networkStatus.setText("Netwerk: verbonden · controle iedere 30 seconden");});}
  private void showActive(JSONObject config){handler.post(()->{if(!activeScreen){activeScreen=true;LinearLayout box=base();TextView brand=label("NARROWVISION PLAYER",22,Color.rgb(242,255,98));brand.setLetterSpacing(.14f);TextView title=label("Player gekoppeld",30,Color.WHITE);status=label("ONLINE",16,Color.rgb(18,20,22));badge(status);detail=label("Configuratie laden…",15,Color.rgb(170,174,180));networkStatus=label("",13,Color.rgb(170,174,180));box.addView(brand);box.addView(space(20));box.addView(title);box.addView(space(18));box.addView(status);box.addView(space(18));box.addView(detail);box.addView(space(10));box.addView(networkStatus);setContentView(box);}JSONObject manifest=config.optJSONObject("manifest");int playlists=manifest==null||manifest.optJSONArray("playlists")==null?0:manifest.optJSONArray("playlists").length();int media=manifest==null||manifest.optJSONArray("media")==null?0:manifest.optJSONArray("media").length();detail.setText("Configuratie revisie "+configRevision+"\n"+playlists+" afspeellijst(en) · "+media+" mediabestand(en)\nPlayback-cache volgt in de volgende fase.");networkStatus.setText("Laatste synchronisatie: "+DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date()));});}
  private void showNetworkError(String message){handler.post(()->{if(networkStatus!=null)networkStatus.setText("Netwerk: "+message);});}
  private LinearLayout base(){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setGravity(Gravity.CENTER);box.setPadding(dp(42),dp(42),dp(42),dp(42));box.setBackgroundColor(Color.rgb(16,17,20));return box;}
  private TextView label(String text,int size,int color){TextView v=new TextView(this);v.setText(text);v.setTextSize(size);v.setTextColor(color);v.setGravity(Gravity.CENTER);return v;} private View space(int size){View v=new View(this);v.setLayoutParams(new LinearLayout.LayoutParams(1,dp(size)));return v;}
  private void badge(TextView v){v.setPadding(dp(24),dp(14),dp(24),dp(14));GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(242,255,98));bg.setCornerRadius(dp(16));v.setBackground(bg);} private String formatCode(String code){String clean=code.replaceAll("[^A-Za-z0-9]","");StringBuilder out=new StringBuilder();for(int i=0;i<clean.length();i++){if(i>0&&i%4==0)out.append('-');out.append(clean.charAt(i));}return out.toString();}
  private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);} private void enterImmersiveMode(){getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE);}
  @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(focus)enterImmersiveMode();}@Override protected void onResume(){super.onResume();enterImmersiveMode();}@Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);network.shutdownNow();super.onDestroy();}
}
