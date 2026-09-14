use base64::Engine as _;

const SUPABASE_URL: &str = "https://eckmifmgrurxgriimgpp.supabase.co";
const SUPABASE_KEY: &str = "sb_publishable_g0ktlqb7mJcLzkCysi7GCw_55uB5lmQ";

#[tauri::command]
async fn supabase_request(
  method: String,
  path: String,
  body: Option<serde_json::Value>,
  token: Option<String>,
  prefer: Option<String>,
) -> Result<serde_json::Value, String> {
  if !(path.starts_with("/auth/v1/") || path.starts_with("/rest/v1/") || path.starts_with("/functions/v1/") || path.starts_with("/storage/v1/")) {
    return Err("Ongeldige API-route".into());
  }
  let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
  let client = reqwest::Client::new();
  let bearer = token.unwrap_or_else(|| SUPABASE_KEY.to_string());
  let mut request = client
    .request(method, format!("{}{}", SUPABASE_URL, path))
    .header("apikey", SUPABASE_KEY)
    .bearer_auth(bearer)
    .header("Content-Type", "application/json");
  if let Some(value) = prefer { request = request.header("Prefer", value); }
  if let Some(value) = body { request = request.json(&value); }
  let response = request.send().await.map_err(|e| format!("Verbinding mislukt: {}", e))?;
  let status = response.status();
  let text = response.text().await.map_err(|e| e.to_string())?;
  if !status.is_success() {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
      let message = value.get("msg").or_else(|| value.get("message")).or_else(|| value.get("error_description")).and_then(|v| v.as_str()).unwrap_or(&text);
      return Err(format!("{}: {}", status.as_u16(), message));
    }
    return Err(format!("{}: {}", status.as_u16(), text));
  }
  if text.trim().is_empty() { Ok(serde_json::Value::Null) }
  else { serde_json::from_str(&text).map_err(|e| format!("Ongeldig serverantwoord: {}", e)) }
}

#[tauri::command]
async fn supabase_upload(
  path: String,
  data_base64: String,
  content_type: String,
  token: Option<String>,
) -> Result<serde_json::Value, String> {
  if !path.starts_with("/storage/v1/object/screenflow-media/")
    || path.contains("..")
    || !(content_type.starts_with("image/") || content_type.starts_with("video/"))
  {
    return Err("Ongeldige media-upload".into());
  }

  let bytes = base64::engine::general_purpose::STANDARD
    .decode(data_base64)
    .map_err(|_| "Het mediabestand kon niet worden gelezen".to_string())?;
  if bytes.len() > 104_857_600 {
    return Err("Het bestand is groter dan 100 MB".into());
  }

  let bearer = token.ok_or_else(|| "Niet ingelogd".to_string())?;
  let response = reqwest::Client::new()
    .post(format!("{}{}", SUPABASE_URL, path))
    .header("apikey", SUPABASE_KEY)
    .bearer_auth(bearer)
    .header("Content-Type", content_type)
    .header("x-upsert", "false")
    .body(bytes)
    .send()
    .await
    .map_err(|e| format!("Uploadverbinding mislukt: {}", e))?;

  let status = response.status();
  let text = response.text().await.map_err(|e| e.to_string())?;
  if !status.is_success() {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
      let message = value.get("message").or_else(|| value.get("error")).and_then(|v| v.as_str()).unwrap_or(&text);
      return Err(format!("{}: {}", status.as_u16(), message));
    }
    return Err(format!("{}: {}", status.as_u16(), text));
  }

  if text.trim().is_empty() { Ok(serde_json::Value::Null) }
  else { serde_json::from_str(&text).map_err(|e| format!("Ongeldig uploadantwoord: {}", e)) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![supabase_request, supabase_upload])
    .run(tauri::generate_context!())
    .expect("NarrowVision Admin kon niet worden gestart");
}
