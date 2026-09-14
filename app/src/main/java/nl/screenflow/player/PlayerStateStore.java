package nl.screenflow.player;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** Private durable playback snapshot. It intentionally excludes signed URLs, tokens and secrets. */
public final class PlayerStateStore {
  private static final String PREFS="narrowvision_player_state";
  private static final String KEY="playback_snapshot_v1";
  private final SharedPreferences prefs;
  public PlayerStateStore(Context context){prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);}
  public synchronized void save(long revision, JSONObject manifest) throws Exception {
    JSONObject copy=new JSONObject();
    copy.put("config_revision",revision);
    copy.put("saved_at",System.currentTimeMillis());
    copy.put("schedules",new JSONArray(manifest.optJSONArray("schedules")==null?"[]":manifest.optJSONArray("schedules").toString()));
    copy.put("playlist_items",new JSONArray(manifest.optJSONArray("playlist_items")==null?"[]":manifest.optJSONArray("playlist_items").toString()));
    copy.put("playlists",new JSONArray(manifest.optJSONArray("playlists")==null?"[]":manifest.optJSONArray("playlists").toString()));
    JSONArray safeMedia=new JSONArray();JSONArray media=manifest.optJSONArray("media");
    if(media!=null)for(int i=0;i<media.length();i++){JSONObject m=media.optJSONObject(i);if(m==null)continue;JSONObject safe=new JSONObject();safe.put("media_id",m.optString("media_id"));safe.put("mime_type",m.optString("mime_type"));safe.put("updated_at",m.optString("updated_at"));safe.put("name",m.optString("name"));safeMedia.put(safe);}
    copy.put("media",safeMedia);
    if(!prefs.edit().putString(KEY,copy.toString()).commit())throw new IllegalStateException("Snapshot opslaan mislukt");
  }
  public synchronized JSONObject load(){try{String raw=prefs.getString(KEY,null);return raw==null?null:new JSONObject(raw);}catch(Exception ignored){return null;}}
  public synchronized void clear(){prefs.edit().remove(KEY).commit();}
}