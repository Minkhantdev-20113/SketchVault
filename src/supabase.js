import { CONFIG, isSupabaseConfigured } from "./config.js";

const RESOURCE_BUCKET = "resource-files";
const ICON_BUCKET = "resource-icons";
const PREVIEW_BUCKET = "resource-previews";
const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const LOG_PREFIX = "[SketchVault Upload]";
const SESSION_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

let clientPromise;

export class SupabaseSetupError extends Error {
  constructor(message = "Supabase ကို မပြင်ဆင်ရသေးပါ။") {
    super(message);
    this.name = "SupabaseSetupError";
  }
}

export function configured() {
  return isSupabaseConfigured();
}

function logUpload(stage, details) {
  console.log(`${LOG_PREFIX} ${stage}`, details ?? "");
}

function logUploadError(stage, error) {
  console.error(`${LOG_PREFIX} ${stage}`, error);
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} — အချိန်ကုန်သွားပါသည် (${Math.round(ms / 1000)}s)`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function getSupabase() {
  if (!configured()) {
    throw new SupabaseSetupError(
      "src/config.js ထဲတွင် Supabase URL နှင့် anon key ထည့်ပြီး app ကို ပြန်ဖွင့်ပါ။"
    );
  }

  if (!clientPromise) {
    clientPromise = import(SUPABASE_CDN)
      .then(({ createClient }) =>
        createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.localStorage
          }
        })
      )
      .catch((error) => {
        clientPromise = undefined;
        throw new Error(`Supabase client မဖွင့်နိုင်ပါ: ${error.message}`);
      });
  }

  return clientPromise;
}

export function readableError(error) {
  if (!error) return "တစ်ခုခု မှားယွင်းသွားပါသည်။";
  if (error instanceof SupabaseSetupError) return error.message;
  if (error.message) return error.message;
  return String(error);
}

function slug(value) {
  return String(value || "file")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 110);
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Mobile browsers တွင် getUser() ကြာမြင့်ပြီး upload ကို ရပ်တန့်စေနိုင်သည် —
 * local session ကို ဦးစွာသုံးပြီး refresh လုပ်သည်။
 */
async function resolveAuthUser(client, onProgress) {
  logUpload("session:start");
  onProgress?.({ message: "စက်ရှင်စစ်ဆေးနေသည်...", percent: 5 });

  const { data: sessionData, error: sessionError } = await withTimeout(
    client.auth.getSession(),
    SESSION_TIMEOUT_MS,
    "စက်ရှင်ရယူရန်"
  );

  if (sessionError) {
    logUploadError("session:error", sessionError);
    throw sessionError;
  }

  const session = sessionData.session;
  if (session?.user) {
    logUpload("session:ok", { userId: session.user.id });
    onProgress?.({ message: "အသုံးပြုသူ အတည်ပြုပြီး", percent: 10 });

    const expiresAt = session.expires_at;
    const needsRefresh = expiresAt && expiresAt * 1000 < Date.now() + 90_000;
    if (needsRefresh) {
      logUpload("session:refresh");
      onProgress?.({ message: "စက်ရှင်ပြန်လသက်သွင်းနေသည်...", percent: 8 });
      const { data: refreshed, error: refreshError } = await withTimeout(
        client.auth.refreshSession(),
        SESSION_TIMEOUT_MS,
        "စက်ရှင်ပြန်လသက်သွင်းရန်"
      );
      if (refreshError) {
        logUploadError("session:refresh-error", refreshError);
        throw refreshError;
      }
      if (refreshed.session?.user) return refreshed.session.user;
    }
    return session.user;
  }

  logUpload("user:fallback-getUser");
  onProgress?.({ message: "အကောင့်အချက်အလက် စစ်ဆေးနေသည်...", percent: 12 });
  const { data: userData, error: userError } = await withTimeout(
    client.auth.getUser(),
    SESSION_TIMEOUT_MS,
    "အသုံးပြုသူ အတည်ပြုရန်"
  );
  if (userError) {
    logUploadError("user:error", userError);
    throw userError;
  }
  if (!userData.user) throw new Error("အရင်ဆုံး အကောင့်ဝင်ပါ။");
  logUpload("user:ok", { userId: userData.user.id });
  return userData.user;
}

async function currentUser(client, onProgress) {
  return resolveAuthUser(client, onProgress);
}

function xhrStorageUpload({ url, token, apiKey, file, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", apiKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Cache-Control", "31536000");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    const abort = () => {
      xhr.abort();
      reject(new Error("တင်ခြင်းကို ပယ်ဖျက်လိုက်ပါသည်။"));
    };
    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      let message = `Storage တင်ခြင်း မအောင်မြင်ပါ (HTTP ${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText || "{}");
        if (body.message || body.error) message = body.message || body.error;
      } catch {
        /* ignore */
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("ကွန်ရက်ချို့ယွင်းချက် — ဖိုင်တင်ခြင်း မအောင်မြင်ပါ။"));
    xhr.ontimeout = () => reject(new Error("တင်ခြင်း အချိန်ကုန်သွားပါသည်။"));
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    logUpload("xhr:send", { url, size: file.size, type: file.type });
    xhr.send(file);
  });
}

async function uploadStorageFile(bucket, userId, resourceType, file, onProgress, signal) {
  if (!file) return "";

  logUpload("file:init", { bucket, name: file.name, size: file.size, type: file.type });
  onProgress?.({ message: `ဖိုင်ပြင်ဆင်နေသည်: ${file.name}`, percent: 15 });

  if (!file.size) throw new Error("ဖိုင်အရွယ်အစား သုညဖြစ်နေသည် — အခြားဖိုင်ရွေးပါ။");

  const client = await getSupabase();
  const user = await resolveAuthUser(client, onProgress);
  if (user.id !== userId) userId = user.id;

  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("လက်မှတ်မရှိပါ — ထပ်ဝင်ပြီး စမ်းကြည့်ပါ။");

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${userId}/${resourceType}/${randomId()}-${slug(file.name || `upload.${extension}`)}`;
  const url = `${CONFIG.supabaseUrl}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`;

  onProgress?.({ message: "Supabase သိုလှောင်ရုံသို့ တင်နေသည်...", percent: 20 });

  await withTimeout(
    xhrStorageUpload({
      url,
      token,
      apiKey: CONFIG.supabaseAnonKey,
      file,
      signal,
      onProgress: (pct) =>
        onProgress?.({
          message: `တင်နေသည်: ${pct}%`,
          percent: 20 + Math.round(pct * 0.6)
        })
    }),
    UPLOAD_TIMEOUT_MS,
    "ဖိုင်တင်ခြင်း"
  );

  logUpload("storage:success", { bucket, path });
  onProgress?.({ message: "သိုလှောင်ရုံ တင်ခြင်း ပြီးပါပြီ", percent: 82 });
  return path;
}

async function removeStorageFiles(bucket, paths) {
  const keep = paths.filter(Boolean);
  if (!keep.length) return;
  const client = await getSupabase();
  await client.storage.from(bucket).remove(keep);
}

export async function getCurrentContext() {
  if (!configured()) {
    return { session: null, user: null, profile: null };
  }

  const client = await getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session?.user) {
    return { session: null, user: null, profile: null };
  }

  const profile = await ensureProfile(data.session.user);
  return { session: data.session, user: data.session.user, profile };
}

export async function ensureProfile(user) {
  const client = await getSupabase();
  const username =
    user.user_metadata?.username ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Member";

  const { data, error } = await client
    .from("profiles")
    .upsert(
      {
        id: user.id,
        username,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  const client = await getSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await ensureProfile(data.user);
  return data;
}

export async function signUpWithEmail(username, email, password) {
  const client = await getSupabase();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });
  if (error) throw error;
  if (data.user) await ensureProfile({ ...data.user, user_metadata: { ...data.user.user_metadata, username } });
  return data;
}

export async function signInWithProvider(provider) {
  const client = await getSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}#/dashboard`
    }
  });
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const client = await getSupabase();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.location.pathname}#/auth?mode=recovery`
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const client = await getSupabase();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  const client = await getSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function onAuthStateChange(callback) {
  if (!configured()) return () => {};
  const client = await getSupabase();
  const { data } = client.auth.onAuthStateChange(async (_event, session) => {
    const profile = session?.user ? await ensureProfile(session.user) : null;
    callback({ session, user: session?.user || null, profile });
  });
  return () => data.subscription.unsubscribe();
}

async function favoriteIds(kind, ids) {
  if (!ids.length) return new Set();
  const client = await getSupabase();
  const { data, error } = await client
    .from("favorites")
    .select("item_id")
    .eq("item_kind", kind)
    .in("item_id", ids);
  if (error) throw error;
  return new Set((data || []).map((item) => item.item_id));
}

async function signedUrl(bucket, path, expiresIn = 60 * 60) {
  if (!path) return "";
  const client = await getSupabase();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return "";
  return data?.signedUrl || "";
}

async function enrichResource(item, favorites) {
  const iconUrl = item.icon_path ? await signedUrl(ICON_BUCKET, item.icon_path) : "";
  const previewOneUrl = item.preview_one_path ? await signedUrl(PREVIEW_BUCKET, item.preview_one_path) : "";
  const previewTwoUrl = item.preview_two_path ? await signedUrl(PREVIEW_BUCKET, item.preview_two_path) : "";
  const filePreviewUrl = item.resource_type === "icon" ? await signedUrl(RESOURCE_BUCKET, item.file_path) : "";
  return {
    ...item,
    is_favorite: favorites.has(item.id),
    icon_url: iconUrl || filePreviewUrl,
    preview_one_url: previewOneUrl,
    preview_two_url: previewTwoUrl
  };
}

export async function listResources(resourceType) {
  const client = await getSupabase();
  const { data, error } = await client
    .from("resource_items")
    .select("*")
    .eq("resource_type", resourceType)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const favorites = await favoriteIds("resource", (data || []).map((item) => item.id));
  return Promise.all((data || []).map((item) => enrichResource(item, favorites)));
}

export async function listJavaCodes() {
  const client = await getSupabase();
  const { data, error } = await client
    .from("java_codes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const favorites = await favoriteIds("java", (data || []).map((item) => item.id));
  return (data || []).map((item) => ({ ...item, is_favorite: favorites.has(item.id) }));
}

export async function loadDashboardData() {
  const client = await getSupabase();
  const [resources, java] = await Promise.all([
    client.from("resource_items").select("*").order("created_at", { ascending: false }),
    client.from("java_codes").select("*").order("created_at", { ascending: false })
  ]);

  if (resources.error) throw resources.error;
  if (java.error) throw java.error;

  const allResources = resources.data || [];
  const javaCodes = java.data || [];
  const all = [
    ...allResources.map((item) => ({ ...item, display_name: item.file_name, kind: item.resource_type })),
    ...javaCodes.map((item) => ({ ...item, display_name: item.code_name, kind: "java" }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    resources: allResources,
    javaCodes,
    recent: all.slice(0, 8)
  };
}

export async function saveResource(resourceType, values, files, existing = null, options = {}) {
  const { onProgress, signal } = options;
  logUpload("saveResource:start", { resourceType, existing: Boolean(existing) });
  onProgress?.({ message: "တင်ခြင်း စတင်နေသည်...", percent: 0 });

  const client = await getSupabase();
  const user = await currentUser(client, onProgress);
  const payload = {
    resource_type: resourceType,
    file_name: values.fileName.trim(),
    description:
      resourceType === "icon" ? values.description?.trim() || "" : values.description?.trim() || CONFIG.defaultDescription,
    category: values.category || "Utilities",
    sort_key: values.sortKey || "newest",
    updated_at: new Date().toISOString()
  };

  const cleanup = [];
  try {
    if (files.mainFile) {
      payload.file_path = await uploadStorageFile(
        RESOURCE_BUCKET,
        user.id,
        resourceType,
        files.mainFile,
        onProgress,
        signal
      );
      payload.file_size = files.mainFile.size;
      cleanup.push([RESOURCE_BUCKET, payload.file_path]);
    }
    if (files.iconFile) {
      payload.icon_path = await uploadStorageFile(
        ICON_BUCKET,
        user.id,
        resourceType,
        files.iconFile,
        onProgress,
        signal
      );
      cleanup.push([ICON_BUCKET, payload.icon_path]);
    }
    if (files.previewOne) {
      payload.preview_one_path = await uploadStorageFile(
        PREVIEW_BUCKET,
        user.id,
        resourceType,
        files.previewOne,
        onProgress,
        signal
      );
      cleanup.push([PREVIEW_BUCKET, payload.preview_one_path]);
    }
    if (files.previewTwo) {
      payload.preview_two_path = await uploadStorageFile(
        PREVIEW_BUCKET,
        user.id,
        resourceType,
        files.previewTwo,
        onProgress,
        signal
      );
      cleanup.push([PREVIEW_BUCKET, payload.preview_two_path]);
    }

    onProgress?.({ message: "ဒေတာဘေ့စ်သို့ သိမ်းဆည်းနေသည်...", percent: 88 });

    const query = existing
      ? client.from("resource_items").update(payload).eq("id", existing.id).select("*").single()
      : client
          .from("resource_items")
          .insert({ ...payload, owner_id: user.id, download_count: 0 })
          .select("*")
          .single();

    const { data, error } = await query;
    if (error) throw error;

    if (existing) {
      await Promise.all([
        payload.file_path ? removeStorageFiles(RESOURCE_BUCKET, [existing.file_path]) : Promise.resolve(),
        payload.icon_path ? removeStorageFiles(ICON_BUCKET, [existing.icon_path]) : Promise.resolve(),
        payload.preview_one_path
          ? removeStorageFiles(PREVIEW_BUCKET, [existing.preview_one_path])
          : Promise.resolve(),
        payload.preview_two_path
          ? removeStorageFiles(PREVIEW_BUCKET, [existing.preview_two_path])
          : Promise.resolve()
      ]);
    }

    onProgress?.({ message: "တင်ခြင်း ပြီးပါပြီ!", percent: 100 });
    logUpload("saveResource:done", { id: data?.id });
    return data;
  } catch (error) {
    logUploadError("saveResource:failed", error);
    await Promise.all(cleanup.map(([bucket, path]) => removeStorageFiles(bucket, [path])));
    throw error;
  }
}

export async function deleteResource(item) {
  const client = await getSupabase();
  const { error } = await client.from("resource_items").delete().eq("id", item.id);
  if (error) throw error;
  await Promise.all([
    removeStorageFiles(RESOURCE_BUCKET, [item.file_path]),
    removeStorageFiles(ICON_BUCKET, [item.icon_path]),
    removeStorageFiles(PREVIEW_BUCKET, [item.preview_one_path, item.preview_two_path])
  ]);
}

export async function saveJavaCode(values, existing = null) {
  const client = await getSupabase();
  const user = await currentUser(client);
  const payload = {
    code_name: values.codeName.trim(),
    description: values.description?.trim() || "",
    source_code: values.sourceCode.trim(),
    category: values.category || "Utilities",
    sort_key: values.sortKey || "newest",
    updated_at: new Date().toISOString()
  };

  const query = existing
    ? client.from("java_codes").update(payload).eq("id", existing.id).select("*").single()
    : client.from("java_codes").insert({ ...payload, owner_id: user.id }).select("*").single();

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function deleteJavaCode(item) {
  const client = await getSupabase();
  const { error } = await client.from("java_codes").delete().eq("id", item.id);
  if (error) throw error;
}

export async function toggleFavorite(kind, itemId, isFavorite) {
  const client = await getSupabase();
  const user = await currentUser(client);
  if (isFavorite) {
    const { error } = await client
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("item_kind", kind)
      .eq("item_id", itemId);
    if (error) throw error;
    return false;
  }

  const { error } = await client.from("favorites").insert({
    user_id: user.id,
    item_kind: kind,
    item_id: itemId
  });
  if (error) throw error;
  return true;
}

function xhrBlob(url, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "blob";
    xhr.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(xhr.response);
      } else {
        reject(new Error(`ဒေါင်းလုဒ် မအောင်မြင်ပါ (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("ဒေါင်းလုဒ် အတွက် ကွန်ရက်ချို့ယွင်းချက်။"));
    xhr.send();
  });
}

export async function downloadResourceFile(item, onProgress) {
  if (!item.file_path) throw new Error("ဒေါင်းလုဒ်လုပ်ရန် ဖိုင်မရှိပါ။");
  const client = await getSupabase();
  const { data, error } = await client.storage.from(RESOURCE_BUCKET).createSignedUrl(item.file_path, 60);
  if (error) throw error;

  const blob = await xhrBlob(data.signedUrl, onProgress);
  await client.rpc("increment_resource_download", { item_id: item.id });
  return blob;
}

export function canManage(user, profile, item) {
  if (!user || !item) return false;
  return item.owner_id === user.id || profile?.role === "admin";
}
