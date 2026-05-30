import { CONFIG, isSupabaseConfigured } from "./config.js";

const RESOURCE_BUCKET = "resource-files";
const ICON_BUCKET = "resource-icons";
const PREVIEW_BUCKET = "resource-previews";
const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const LOG_PREFIX = "[SketchVault Upload]";
const REFRESH_TIMEOUT_MS = 25000;
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
    timer = setTimeout(() => reject(new Error(`${label} timed out (${Math.round(ms / 1000)}s).`)), ms);
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
  if (!error) return "Something went wrong.";
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

function getAuthStorageKey() {
  const ref = CONFIG.supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1];
  return ref ? `sb-${ref}-auth-token` : null;
}

/** Network မခေါ်ဘဲ localStorage ထဲက session — upload အတွက် အဓိက။ */
export function readPersistedSession() {
  const key = getAuthStorageKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.access_token && parsed?.user ? parsed : parsed?.currentSession?.access_token ? parsed.currentSession : null;
    if (!session?.access_token || !session?.user) return null;
    if (session.expires_at && session.expires_at * 1000 < Date.now() - 5000) {
      return null;
    }
    return session;
  } catch (error) {
    logUploadError("session:localStorage-parse", error);
    return null;
  }
}

function sessionExpiresSoon(session, bufferMs = 120_000) {
  const exp = session?.expires_at;
  if (!exp) return false;
  return exp * 1000 < Date.now() + bufferMs;
}

function buildAuthContext(injectedSession, injectedUser) {
  const session =
    injectedSession?.access_token ? injectedSession : readPersistedSession();
  const user = injectedUser || session?.user;
  if (!session?.access_token || !user?.id) return null;
  return {
    session,
    user,
    accessToken: session.access_token,
    userId: user.id
  };
}

async function syncClientSession(client, session) {
  if (!session?.access_token) return;
  try {
    const { error } = await withTimeout(
      client.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token || ""
      }),
      8000,
      "Session sync"
    );
    if (error) logUploadError("session:setSession", error);
  } catch (error) {
    logUploadError("session:setSession-skip", error);
  }
}

function prepareUploadAuthFast(options = {}) {
  const { session, user, onProgress } = options;
  const auth = buildAuthContext(session, user);
  if (!auth) throw new Error("Please sign in again. Your session was not found.");
  onProgress?.({ message: "Session ready", percent: 10 });
  logUpload("session:fast", { userId: auth.userId });
  return auth;
}

async function resolveUploadAuth(client, options = {}) {
  const { session, user } = options;
  if (session?.access_token && user?.id && !sessionExpiresSoon(session)) {
    return prepareUploadAuthFast(options);
  }
  return prepareUploadAuth(client, options);
}

async function prepareUploadAuth(client, options = {}) {
  const { session, user, onProgress } = options;
  onProgress?.({ message: "Checking session...", percent: 5 });

  let auth = buildAuthContext(session, user);
  if (!auth) {
    throw new Error("Please sign in again. Your session was not found.");
  }

  logUpload("session:ready", { source: session?.access_token ? "app-state" : "localStorage", userId: auth.userId });

  if (sessionExpiresSoon(auth.session)) {
    onProgress?.({ message: "Refreshing session...", percent: 8 });
    try {
      await syncClientSession(client, auth.session);
      const { data, error } = await withTimeout(
        client.auth.refreshSession(),
        REFRESH_TIMEOUT_MS,
        "Session refresh"
      );
      if (error) throw error;
      if (data.session?.access_token) {
        auth = {
          session: data.session,
          user: data.session.user,
          accessToken: data.session.access_token,
          userId: data.session.user.id
        };
        logUpload("session:refreshed");
      }
    } catch (error) {
      logUploadError("session:refresh-failed", error);
      throw new Error("Session expired. Please sign out and sign in again.");
    }
  }

  onProgress?.({ message: "Session ready", percent: 10 });
  return auth;
}

async function restRequest(path, { method = "GET", token, body, signal, timeout = 30_000, prefer = "return=representation" }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`${CONFIG.supabaseUrl}${path}`, {
      method,
      headers: {
        apikey: CONFIG.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: prefer
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!response.ok) {
      const message = json?.message || json?.error || json?.hint || text || `Request failed (${response.status})`;
      throw new Error(message);
    }

    return json;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out or was cancelled.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function restRow(result) {
  if (result == null) return result;
  return Array.isArray(result) ? result[0] : result;
}

async function currentUser(client) {
  const auth = buildAuthContext();
  if (auth?.user) return auth.user;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session?.user) throw new Error("Please sign in first.");
  return data.session.user;
}

function preferFetchStorageUpload() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

async function fetchStorageUpload({ url, token, apiKey, file, signal }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: apiKey,
      "x-upsert": "false",
      "Content-Type": file.type || "application/octet-stream"
    },
    body: file,
    signal
  });
  if (!response.ok) {
    let message = `Storage upload failed (HTTP ${response.status})`;
    try {
      const body = await response.json();
      if (body.message || body.error) message = body.message || body.error;
    } catch {
      const text = await response.text();
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }
}

function xhrStorageUpload({ url, token, apiKey, file, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", apiKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    const abort = () => {
      xhr.abort();
      reject(new Error("Upload cancelled."));
    };
    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (typeof onProgress !== "function") return;
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      } else if (event.loaded > 0) {
        onProgress(Math.min(95, 20 + Math.round(event.loaded / 1024 / 50)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      let message = `Storage upload failed (HTTP ${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText || "{}");
        if (body.message || body.error) message = body.message || body.error;
      } catch {
        /* ignore */
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.ontimeout = () => reject(new Error("Upload timed out."));
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    logUpload("xhr:send", { url, size: file.size, type: file.type });
    xhr.send(file);
  });
}

async function uploadStorageFile(bucket, userId, resourceType, file, auth, onProgress, signal) {
  if (!file) return "";

  logUpload("file:init", { bucket, name: file.name, size: file.size, type: file.type });
  onProgress?.({ message: `Preparing: ${file.name}`, percent: 15 });

  if (!file.size) throw new Error("File is empty. Choose another file.");

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${userId}/${resourceType}/${randomId()}-${slug(file.name || `upload.${extension}`)}`;

  onProgress?.({ message: "Uploading to storage...", percent: 20 });

  const url = `${CONFIG.supabaseUrl}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`;
  const useFetch = preferFetchStorageUpload();
  logUpload(useFetch ? "storage:fetch" : "storage:xhr", { url, size: file.size });

  let tickTimer;
  const mapPct = (pct) =>
    onProgress?.({
      message: useFetch ? "Uploading to storage..." : `Uploading: ${pct}%`,
      percent: 20 + Math.round(pct * 0.55)
    });

  if (useFetch) {
    let fake = 22;
    tickTimer = setInterval(() => {
      fake = Math.min(76, fake + 3);
      mapPct(Math.round(((fake - 22) / 54) * 100));
    }, 700);
  }

  try {
    await withTimeout(
      useFetch
        ? fetchStorageUpload({
            url,
            token: auth.accessToken,
            apiKey: CONFIG.supabaseAnonKey,
            file,
            signal
          })
        : xhrStorageUpload({
            url,
            token: auth.accessToken,
            apiKey: CONFIG.supabaseAnonKey,
            file,
            signal,
            onProgress: mapPct
          }),
      UPLOAD_TIMEOUT_MS,
      "Storage upload"
    );
  } finally {
    clearInterval(tickTimer);
  }

  logUpload("storage:success", { bucket, path });
  onProgress?.({ message: "Storage upload complete", percent: 82 });
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

  const persisted = readPersistedSession();
  if (persisted?.user && persisted.access_token) {
    let profile = null;
    try {
      profile = await ensureProfile(persisted.user, persisted.access_token);
    } catch (error) {
      console.error("[SketchVault] profile load failed", error);
    }
    return { session: persisted, user: persisted.user, profile };
  }

  try {
    const client = await getSupabase();
    const { data, error } = await withTimeout(client.auth.getSession(), 12_000, "Session load");
    if (error || !data.session?.user) {
      return { session: null, user: null, profile: null };
    }
    let profile = null;
    try {
      profile = await ensureProfile(data.session.user, data.session.access_token);
    } catch (profileError) {
      console.error("[SketchVault] profile load failed", profileError);
    }
    return { session: data.session, user: data.session.user, profile };
  } catch {
    return { session: null, user: null, profile: null };
  }
}

export async function ensureProfile(user, accessToken) {
  const token = accessToken || readPersistedSession()?.access_token;
  if (!token) throw new Error("Missing auth token for profile sync.");

  const username =
    user.user_metadata?.username ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Member";

  try {
    return restRow(
      await restRequest(`/rest/v1/profiles?id=eq.${user.id}`, {
        method: "PATCH",
        token,
        body: { username, updated_at: new Date().toISOString() }
      })
    );
  } catch {
    return restRow(
      await restRequest("/rest/v1/profiles", {
      method: "POST",
      token,
      prefer: "return=representation",
      body: {
        id: user.id,
        username,
        updated_at: new Date().toISOString()
      }
      })
    );
  }
}

export async function signInWithEmail(email, password) {
  const client = await getSupabase();
  const { data, error } = await withTimeout(
    client.auth.signInWithPassword({ email, password }),
    30_000,
    "Sign in"
  );
  if (error) throw error;
  if (!data.session?.user) {
    throw new Error("Sign in failed. Confirm your email first if confirmation is required in Supabase.");
  }

  const profile = await ensureProfile(data.session.user, data.session.access_token);
  return { session: data.session, user: data.user, profile };
}

export async function signUpWithEmail(username, email, password) {
  const client = await getSupabase();
  const { data, error } = await withTimeout(
    client.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    }),
    30_000,
    "Sign up"
  );
  if (error) throw error;

  if (!data.session?.user) {
    return { session: null, user: data.user, profile: null, needsEmailConfirmation: true };
  }

  const user = { ...data.user, user_metadata: { ...data.user.user_metadata, username } };
  const profile = await ensureProfile(user, data.session.access_token);
  return { session: data.session, user: data.user, profile, needsEmailConfirmation: false };
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
    let profile = null;
    if (session?.user && session.access_token) {
      try {
        profile = await ensureProfile(session.user, session.access_token);
      } catch (error) {
        console.error("[SketchVault] profile sync on auth change failed", error);
      }
    }
    callback({ session, user: session?.user || null, profile });
  });
  return () => data.subscription.unsubscribe();
}

function authFromOptions(options = {}) {
  const auth = buildAuthContext(options.session, options.user);
  if (!auth) throw new Error("Please sign in again.");
  return auth;
}

async function favoriteIdsRest(kind, ids, token) {
  if (!ids.length) return new Set();
  const rows = await restRequest(
    `/rest/v1/favorites?item_kind=eq.${encodeURIComponent(kind)}&item_id=in.(${ids.join(",")})&select=item_id`,
    { method: "GET", token, timeout: 20_000 }
  );
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  return new Set(list.map((item) => item.item_id));
}

async function createSignedUrlRest(bucket, path, token, expiresIn = 3600) {
  if (!path || !token) return "";
  try {
    const response = await fetch(
      `${CONFIG.supabaseUrl}/storage/v1/object/sign/${bucket}/${encodeStoragePath(path)}`,
      {
        method: "POST",
        headers: {
          apikey: CONFIG.supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expiresIn })
      }
    );
    if (!response.ok) return "";
    const json = await response.json();
    const raw = json.signedURL || json.signedUrl || "";
    if (!raw) return "";
    if (raw.startsWith("http")) return raw;
    if (raw.startsWith("/")) return `${CONFIG.supabaseUrl}/storage/v1${raw}`;
    return `${CONFIG.supabaseUrl}/storage/v1/object/sign/${bucket}/${encodeStoragePath(path)}?token=${raw}`;
  } catch {
    return "";
  }
}

async function enrichResourceItem(item, favorites, token) {
  const jobs = [];
  if (item.resource_type === "icon" && item.file_path) {
    jobs.push(createSignedUrlRest(RESOURCE_BUCKET, item.file_path, token));
  } else if (item.icon_path) {
    jobs.push(createSignedUrlRest(ICON_BUCKET, item.icon_path, token));
  } else {
    jobs.push(Promise.resolve(""));
  }
  jobs.push(
    item.preview_one_path ? createSignedUrlRest(PREVIEW_BUCKET, item.preview_one_path, token) : Promise.resolve(""),
    item.preview_two_path ? createSignedUrlRest(PREVIEW_BUCKET, item.preview_two_path, token) : Promise.resolve("")
  );

  const [icon_url, preview_one_url, preview_two_url] = await Promise.all(jobs);
  return {
    ...item,
    is_favorite: favorites.has(item.id),
    icon_url,
    preview_one_url,
    preview_two_url
  };
}

export async function listResources(resourceType, options = {}) {
  const auth = authFromOptions(options);
  const rows = await restRequest(
    `/rest/v1/resource_items?resource_type=eq.${encodeURIComponent(resourceType)}&select=*&order=created_at.desc`,
    { method: "GET", token: auth.accessToken, timeout: 45_000 }
  );
  const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const favorites = await favoriteIdsRest("resource", items.map((item) => item.id), auth.accessToken);
  return Promise.all(items.map((item) => enrichResourceItem(item, favorites, auth.accessToken)));
}

export async function listJavaCodes(options = {}) {
  const auth = authFromOptions(options);
  const rows = await restRequest(
    `/rest/v1/java_codes?select=*&order=created_at.desc`,
    { method: "GET", token: auth.accessToken, timeout: 45_000 }
  );
  const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const favorites = await favoriteIdsRest("java", items.map((item) => item.id), auth.accessToken);
  return items.map((item) => ({ ...item, is_favorite: favorites.has(item.id) }));
}

export async function loadDashboardData(options = {}) {
  const auth = authFromOptions(options);
  const [resources, javaCodes] = await Promise.all([
    restRequest("/rest/v1/resource_items?select=*&order=created_at.desc", {
      method: "GET",
      token: auth.accessToken,
      timeout: 45_000
    }),
    restRequest("/rest/v1/java_codes?select=*&order=created_at.desc", {
      method: "GET",
      token: auth.accessToken,
      timeout: 45_000
    })
  ]);

  const allResources = Array.isArray(resources) ? resources : resources ? [resources] : [];
  const javaList = Array.isArray(javaCodes) ? javaCodes : javaCodes ? [javaCodes] : [];
  const all = [
    ...allResources.map((item) => ({ ...item, display_name: item.file_name, kind: item.resource_type })),
    ...javaList.map((item) => ({ ...item, display_name: item.code_name, kind: "java" }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    resources: allResources,
    javaCodes: javaList,
    recent: all.slice(0, 8)
  };
}

export async function saveResource(resourceType, values, files, existing = null, options = {}) {
  const { onProgress, signal, session, user } = options;
  logUpload("saveResource:start", { resourceType, existing: Boolean(existing) });
  onProgress?.({ message: "Starting upload...", percent: 0 });

  const client = await getSupabase();
  const auth = await resolveUploadAuth(client, { session, user, onProgress });
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
        auth.userId,
        resourceType,
        files.mainFile,
        auth,
        onProgress,
        signal
      );
      payload.file_size = files.mainFile.size;
      cleanup.push([RESOURCE_BUCKET, payload.file_path]);
    }
    if (files.iconFile) {
      payload.icon_path = await uploadStorageFile(
        ICON_BUCKET,
        auth.userId,
        resourceType,
        files.iconFile,
        auth,
        onProgress,
        signal
      );
      cleanup.push([ICON_BUCKET, payload.icon_path]);
    }
    if (files.previewOne) {
      payload.preview_one_path = await uploadStorageFile(
        PREVIEW_BUCKET,
        auth.userId,
        resourceType,
        files.previewOne,
        auth,
        onProgress,
        signal
      );
      cleanup.push([PREVIEW_BUCKET, payload.preview_one_path]);
    }
    if (files.previewTwo) {
      payload.preview_two_path = await uploadStorageFile(
        PREVIEW_BUCKET,
        auth.userId,
        resourceType,
        files.previewTwo,
        auth,
        onProgress,
        signal
      );
      cleanup.push([PREVIEW_BUCKET, payload.preview_two_path]);
    }

    onProgress?.({ message: "Saving record...", percent: 88 });

    const data = existing
      ? await restRequest(`/rest/v1/resource_items?id=eq.${existing.id}`, {
          method: "PATCH",
          token: auth.accessToken,
          body: payload,
          signal
        })
      : await restRequest("/rest/v1/resource_items", {
          method: "POST",
          token: auth.accessToken,
          body: { ...payload, owner_id: auth.userId, download_count: 0 },
          signal
        });

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

    onProgress?.({ message: "Upload complete!", percent: 100 });
    const saved = restRow(data);
    logUpload("saveResource:done", { id: saved?.id });
    return saved;
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

async function saveJavaCodeRow(auth, payload, existing, options) {
  const result = existing
    ? await restRequest(`/rest/v1/java_codes?id=eq.${existing.id}`, {
        method: "PATCH",
        token: auth.accessToken,
        body: payload,
        signal: options.signal
      })
    : await restRequest("/rest/v1/java_codes", {
        method: "POST",
        token: auth.accessToken,
        body: { ...payload, owner_id: auth.userId },
        signal: options.signal
      });
  return restRow(result);
}

export async function saveJavaCode(values, existing = null, options = {}) {
  const client = await getSupabase();
  const auth = await resolveUploadAuth(client, options);
  const payload = {
    code_name: values.codeName.trim(),
    source_code: values.sourceCode.trim(),
    category: values.category || "Utilities",
    sort_key: values.sortKey || "newest",
    updated_at: new Date().toISOString()
  };

  const description = values.description?.trim();
  logUpload("java:save", { existing: Boolean(existing), userId: auth.userId });

  if (description) {
    try {
      return await saveJavaCodeRow(auth, { ...payload, description }, existing, options);
    } catch (error) {
      if (!/description/i.test(String(error.message))) throw error;
      logUpload("java:save-without-description", "column missing — run supabase/migrations/add_java_description.sql");
    }
  }

  return saveJavaCodeRow(auth, payload, existing, options);
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
