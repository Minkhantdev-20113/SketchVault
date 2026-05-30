import { CONFIG, isSupabaseConfigured } from "./config.js";

const RESOURCE_BUCKET = "resource-files";
const ICON_BUCKET = "resource-icons";
const PREVIEW_BUCKET = "resource-previews";
const SUPABASE_CDNS = [
  "https://esm.sh/@supabase/supabase-js@2?bundle",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
];

let clientPromise;

// ═══════════════════════════════════════════════════════════
//  MOBILE & NETWORK DETECTION
// ═══════════════════════════════════════════════════════════

const isMobile = () => /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = () => /Android/.test(navigator.userAgent);
const isOnline = () => navigator.onLine;

function getNetworkInfo() {
  const info = {
    isMobile: isMobile(),
    online: isOnline(),
    type: 'unknown',
    effectiveType: 'unknown',
    downlink: null,
    rtt: null,
    saveData: false,
  };

  if ('connection' in navigator) {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      info.type = conn.type || 'unknown';
      info.effectiveType = conn.effectiveType || 'unknown';
      info.downlink = conn.downlink;
      info.rtt = conn.rtt;
      info.saveData = conn.saveData || false;
    }
  }

  return info;
}

function getNetworkStrategy() {
  const networkInfo = getNetworkInfo();

  if (!networkInfo.online) {
    return {
      type: 'offline',
      speedBytesPerMs: 0,
      timeoutMultiplier: 1,
      maxRetries: 0,
      retryDelayMs: 1000,
      canUpload: false,
    };
  }

  if (!networkInfo.isMobile) {
    return {
      type: 'desktop',
      speedBytesPerMs: 250 * 1024,
      timeoutMultiplier: 1,
      maxRetries: 2,
      retryDelayMs: 1000,
      canUpload: true,
    };
  }

  const strategies = {
    'slow-2g': { speedBytesPerMs: 5 * 1024, timeoutMultiplier: 4, maxRetries: 5, retryDelayMs: 3000, canUpload: true },
    '2g': { speedBytesPerMs: 15 * 1024, timeoutMultiplier: 3, maxRetries: 4, retryDelayMs: 2000, canUpload: true },
    '3g': { speedBytesPerMs: 50 * 1024, timeoutMultiplier: 2, maxRetries: 3, retryDelayMs: 1500, canUpload: true },
    '4g': { speedBytesPerMs: 150 * 1024, timeoutMultiplier: 1.5, maxRetries: 2, retryDelayMs: 1000, canUpload: true },
    '5g': { speedBytesPerMs: 300 * 1024, timeoutMultiplier: 1, maxRetries: 2, retryDelayMs: 1000, canUpload: true },
  };

  const strategy = strategies[networkInfo.effectiveType] || {
    type: 'mobile-unknown',
    speedBytesPerMs: 30 * 1024,
    timeoutMultiplier: 2.5,
    maxRetries: 3,
    retryDelayMs: 2000,
    canUpload: true,
  };

  if (networkInfo.saveData) {
    strategy.timeoutMultiplier *= 1.5;
    strategy.maxRetries += 2;
    strategy.retryDelayMs *= 2;
  }

  return strategy;
}

// ═══════════════════════════════════════════════════════════
//  NETWORK MONITOR
// ═══════════════════════════════════════════════════════════

class NetworkMonitor {
  constructor() {
    this.listeners = new Set();
    this.currentInfo = getNetworkInfo();
    this._setupListeners();
  }

  _setupListeners() {
    window.addEventListener('online', () => this._handleChange());
    window.addEventListener('offline', () => this._handleChange());
    
    if ('connection' in navigator) {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn) {
        conn.addEventListener('change', () => this._handleChange());
      }
    }
  }

  _handleChange() {
    this.currentInfo = getNetworkInfo();
    this.listeners.forEach(cb => cb(this.currentInfo));
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getInfo() {
    return this.currentInfo;
  }
}

const networkMonitor = new NetworkMonitor();

// ═══════════════════════════════════════════════════════════
//  UPLOAD QUEUE WITH CONCURRENCY CONTROL
// ═══════════════════════════════════════════════════════════

class UploadQueue {
  constructor() {
    this.queue = [];
    this.active = 0;
    this.maxConcurrent = isMobile() ? 1 : 3;
    this.isPaused = false;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this.process();
  }

  async add(task, options = {}) {
    const { priority = 0 } = options;
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject, priority });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.process();
    });
  }

  async process() {
    if (this.isPaused) return;

    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.active++;

      try {
        const result = await task();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        this.active--;
        this.process();
      }
    }
  }

  get pending() {
    return this.queue.length;
  }

  get uploading() {
    return this.active;
  }
}

const uploadQueue = new UploadQueue();

networkMonitor.onChange((info) => {
  if (!info.online) {
    uploadQueue.pause();
    console.warn('📵 Network offline - uploads paused');
    window.dispatchEvent(new CustomEvent('uploads-paused', { 
      detail: { reason: 'offline' } 
    }));
  } else {
    uploadQueue.resume();
    console.log('🌐 Network restored - resuming uploads');
    window.dispatchEvent(new CustomEvent('uploads-resumed', { 
      detail: { networkType: info.effectiveType } 
    }));
  }
});

// ═══════════════════════════════════════════════════════════
//  AUTO-RETRY WITH EXPONENTIAL BACKOFF
// ═══════════════════════════════════════════════════════════

async function withRetry(operation, options = {}) {
  const strategy = getNetworkStrategy();
  const {
    maxRetries = strategy.maxRetries,
    retryDelayMs = strategy.retryDelayMs,
    onRetry = null,
    shouldRetry = null,
    context = '',
  } = options;

  let totalAttempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    totalAttempts = attempt + 1;

    try {
      if (!isOnline()) {
        throw new Error('Network is offline. Waiting for connection...');
      }

      const result = await operation();
      return { success: true, result, attempts: totalAttempts };
    } catch (error) {
      if (shouldRetry && !shouldRetry(error)) {
        throw error;
      }

      if (error.message?.includes('permission') || 
          error.message?.includes('unauthorized') ||
          error.message?.includes('not found') ||
          error.status === 401 ||
          error.status === 403 ||
          error.status === 404) {
        throw error;
      }

      if (attempt >= maxRetries) {
        throw new Error(
          `${context ? context + ': ' : ''}Failed after ${totalAttempts} attempts. ${error.message}`
        );
      }

      const jitter = Math.random() * 0.3 + 0.85;
      const delay = Math.min(
        retryDelayMs * Math.pow(2, attempt) * jitter,
        30000 
      );

      console.warn(
        `🔄 Retry ${attempt + 1}/${maxRetries} for ${context || 'operation'} ` +
        `after ${Math.round(delay)}ms. Error: ${error.message}`
      );

      window.dispatchEvent(new CustomEvent('upload-retry', {
        detail: {
          attempt: attempt + 1,
          maxRetries,
          delay,
          error: error.message,
          context,
        }
      }));

      if (onRetry) {
        onRetry({ attempt: attempt + 1, maxRetries, delay, error: error.message });
      }

      await new Promise(resolve => setTimeout(resolve, delay));

      if (!isOnline()) {
        console.log('⏳ Waiting for network connection...');
        await new Promise((resolve) => {
          const unsubscribe = networkMonitor.onChange((info) => {
            if (info.online) {
              unsubscribe();
              resolve();
            }
          });
          setTimeout(() => {
            unsubscribe();
            resolve();
          }, 300000);
        });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  PROGRESS TRACKER
// ═══════════════════════════════════════════════════════════

class ProgressTracker {
  constructor() {
    this.tasks = new Map();
  }

  createTask(id, total) {
    const task = {
      id,
      total,
      loaded: 0,
      percentage: 0,
      status: 'pending',
      startTime: Date.now(),
      speed: 0,
      eta: null,
    };
    this.tasks.set(id, task);
    return task;
  }

  updateTask(id, loaded, status = 'uploading') {
    const task = this.tasks.get(id);
    if (!task) return;

    task.loaded = loaded;
    task.percentage = task.total > 0 ? Math.min(99, Math.round((loaded / task.total) * 100)) : 0;
    task.status = status;

    const elapsed = (Date.now() - task.startTime) / 1000;
    if (elapsed > 0) {
      task.speed = loaded / elapsed;
      if (task.speed > 0 && loaded < task.total) {
        task.eta = (task.total - loaded) / task.speed;
      }
    }
    return task;
  }

  completeTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.percentage = 100;
      task.status = 'completed';
      task.eta = 0;
    }
    return task;
  }

  failTask(id, error) {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'failed';
      task.error = error;
    }
    return task;
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  removeTask(id) {
    this.tasks.delete(id);
  }
}

const progressTracker = new ProgressTracker();

// ═══════════════════════════════════════════════════════════
//  FILE READING
// ═══════════════════════════════════════════════════════════

function readFileWithReader(file, progressCallback) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let isResolved = false;
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try {
        reader.abort();
      } catch (e) {}
    };

    const safeResolve = (data) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve(data);
      }
    };

    const safeReject = (error) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(error);
      }
    };

    const timeoutDuration = isMobile() ? 120000 : 60000;
    timeoutId = setTimeout(() => {
      safeReject(new Error(
        "Reading the selected file timed out. " +
        (isMobile() ? "On mobile, try selecting a smaller file or use WiFi." : "")
      ));
    }, timeoutDuration);

    reader.onprogress = (event) => {
      if (event.lengthComputable && progressCallback) {
        progressCallback({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        });
      }
    };

    reader.onload = () => {
      if (reader.result) {
        safeResolve(reader.result);
      } else {
        safeReject(new Error("FileReader completed but no data was read"));
      }
    };

    reader.onerror = () => {
      let errorMessage = "Could not read the selected file.";
      if (isAndroid()) {
        errorMessage += " On Android, select from 'Files' or 'Gallery' (not 'Recent').";
      } else if (isIOS()) {
        errorMessage += " On iOS, ensure the app has file access permission.";
      }
      safeReject(reader.error || new Error(errorMessage));
    };

    reader.onabort = () => {
      safeReject(new Error("File reading was aborted"));
    };

    try {
      reader.readAsArrayBuffer(file);
    } catch (error) {
      safeReject(new Error(`Failed to start reading file: ${error.message}`));
    }
  });
}

async function readFileBuffer(file) {
  const errors = [];

  if (typeof FileReader !== "undefined") {
    try {
      return await readFileWithReader(file);
    } catch (error) {
      errors.push(`FileReader: ${error.message || error}`);
    }
  }

  if (typeof file.arrayBuffer === "function") {
    try {
      const buffer = await file.arrayBuffer();
      if (buffer && buffer.byteLength > 0) {
        return buffer;
      }
      throw new Error("Empty buffer received");
    } catch (error) {
      errors.push(`arrayBuffer: ${error.message || error}`);
    }
  }

  let errorMessage = `Could not read the selected file${errors.length ? `: ${errors.join("; ")}` : "."}`;
  if (isMobile()) {
    errorMessage += " Please ensure the file is accessible and try again.";
  }

  throw new Error(errorMessage);
}

async function uploadableFile(file, fileName) {
  if (file.size === 0) {
    throw new Error(
      "The selected file is empty or Android did not grant readable access. " +
      "Choose the file again from Files (not Recent)."
    );
  }

  if (isMobile() && file.size > 50 * 1024 * 1024) {
    console.warn(
      `⚠️ Large file (${(file.size / 1024 / 1024).toFixed(1)}MB) on mobile. ` +
      `Network: ${getNetworkInfo().effectiveType}. Consider using WiFi.`
    );
  }

  const buffer = await readFileBuffer(file);
  const contentType = contentTypeFor(file, fileName);

  if (!buffer || typeof buffer.byteLength !== "number") {
    throw new Error("Could not read the selected file.");
  }

  return { body: buffer, contentType };
}

// ═══════════════════════════════════════════════════════════
//  DIRECT UPLOAD WITH AUTO-RETRY
// ═══════════════════════════════════════════════════════════

async function directStorageUpload(client, bucket, path, uploadFile, onProgress) {
  const strategy = getNetworkStrategy();

  if (!strategy.canUpload) {
    throw new Error("Cannot upload while offline. Please check your internet connection.");
  }

  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error("Please sign in again before uploading.");

  const fileSize = uploadFile.body?.byteLength || uploadFile.body?.size || 0;

  return withRetry(
    () => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let isResolved = false;
        let progressTimer = null;
        let lastProgressTime = Date.now();
        let lastProgressLoaded = 0;

        const safeResolve = () => {
          if (!isResolved) {
            isResolved = true;
            if (progressTimer) clearInterval(progressTimer);
            resolve();
          }
        };

        const safeReject = (err) => {
          if (!isResolved) {
            isResolved = true;
            if (progressTimer) clearInterval(progressTimer);
            reject(err);
          }
        };

        const timeout = Math.min(600000, Math.max(30000, 
          Math.ceil(fileSize / strategy.speedBytesPerMs) * strategy.timeoutMultiplier
        ));

        xhr.open("POST", storageObjectUrl(bucket, path));
        xhr.timeout = timeout;
        xhr.setRequestHeader("apikey", CONFIG.supabaseAnonKey);
        xhr.setRequestHeader("Authorization", `Bearer ${data.session.access_token}`);
        xhr.setRequestHeader("Cache-Control", "31536000");
        xhr.setRequestHeader("Content-Type", uploadFile.contentType);
        xhr.setRequestHeader("x-upsert", "false");

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const now = Date.now();
            const timeDiff = (now - lastProgressTime) / 1000;

            if (timeDiff > 0 && event.loaded > lastProgressLoaded) {
              const speed = (event.loaded - lastProgressLoaded) / timeDiff;
              lastProgressTime = now;
              lastProgressLoaded = event.loaded;

              if (typeof onProgress === 'function') {
                onProgress({
                  loaded: event.loaded,
                  total: event.total,
                  percentage: Math.round((event.loaded / event.total) * 100),
                  speed,
                  eta: speed > 0 ? (event.total - event.loaded) / speed : null,
                });
              }
            }
          }
        };

        if (isMobile()) {
          progressTimer = setInterval(() => {
            const stallTime = Date.now() - lastProgressTime;
            if (stallTime > 30000 && typeof onProgress === 'function') {
              onProgress({
                loaded: lastProgressLoaded,
                total: fileSize,
                percentage: Math.round((lastProgressLoaded / fileSize) * 100),
                speed: 0,
                stalled: true,
                stallDuration: stallTime,
              });
            }
          }, 5000);
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            safeResolve();
          } else {
            const err = storageErrorFromText(xhr.status, xhr.statusText, xhr.responseText);
            err.status = xhr.status;
            safeReject(err);
          }
        };

        xhr.onerror = (e) => {
          console.log("XHR ERROR");
          console.log(e);
          safeReject(new Error("Storage upload failed: network error. Check your connection."));
        };

        xhr.ontimeout = () => {
          safeReject(new Error(
            `Upload timed out after ${Math.round(timeout / 1000)}s. ` +
            `File: ${(fileSize / 1024 / 1024).toFixed(1)}MB. ` +
            (isMobile() ? "Try WiFi or a smaller file." : "")
          ));
        };

        xhr.onabort = () => {
          safeReject(new Error("Upload was cancelled"));
        };

        try {
             console.log("STEP 2");
             console.log(uploadFile);
          xhr.send(uploadFile.body);
        } catch (err) {
          safeReject(new Error(`Failed to send upload request: ${err.message}`));
        }
      });
    },
    {
      context: `Upload ${path.split('/').pop()}`,
      onRetry: (retryInfo) => {
        console.log(
          `Retrying upload (${retryInfo.attempt}/${retryInfo.maxRetries}) ` +
          `after ${Math.round(retryInfo.delay)}ms`
        );
        if (typeof onProgress === 'function') {
          onProgress({
            retrying: true,
            attempt: retryInfo.attempt,
            maxRetries: retryInfo.maxRetries,
          });
        }
      },
      shouldRetry: (error) => {
        if (error.status && error.status >= 400 && error.status < 500) {
          if (error.status === 408 || error.status === 429) return true;
          return false;
        }
        return true;
      },
    }
  ).then((retryResult) => {
    return retryResult.result;
  });
}

// ═══════════════════════════════════════════════════════════
//  UPLOAD STATE PERSISTENCE (Cleaned from Chunking)
// ═══════════════════════════════════════════════════════════

const uploadState = {
  save(key, data) {
    try {
      const state = {
        ...data,
        timestamp: Date.now(),
        networkInfo: getNetworkInfo(),
      };
      localStorage.setItem(`upload_state_${key}`, JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save upload state:', error);
    }
  },

  load(key) {
    try {
      const data = localStorage.getItem(`upload_state_${key}`);
      if (!data) return null;

      const state = JSON.parse(data);
      if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
        this.clear(key);
        return null;
      }
      return state;
    } catch {
      return null;
    }
  },

  clear(key) {
    try {
      localStorage.removeItem(`upload_state_${key}`);
    } catch {}
  }
};

// ═══════════════════════════════════════════════════════════
//  MAIN UPLOAD FUNCTION
// ═══════════════════════════════════════════════════════════

async function uploadStorageFile(bucket, userId, resourceType, file, options = {}) {
     console.log("STEP 1");
     console.log(file);
  if (!file) return "";

  const client = await getSupabase();
  const fileName = cleanFileName(file);
  const strategy = getNetworkStrategy();

  if (!strategy.canUpload) {
    throw new Error("Cannot upload while offline. Please check your connection and try again.");
  }

  const baseName = storageFileName(fileName, file.type || 'application/octet-stream');
  const path = `${userId}/${resourceType}/${randomId()}-${baseName}`;
  const taskId = path;

  progressTracker.createTask(taskId, file.size);

  uploadState.save(path, {
    fileName: file.name,
    fileSize: file.size,
    bucket,
    path,
    startedAt: new Date().toISOString(),
  });

  try {
    const uploadFile = await uploadableFile(file, fileName);

    await directStorageUpload(client, bucket, path, uploadFile, (progress) => {
      if (progress.loaded) {
        progressTracker.updateTask(taskId, progress.loaded);
      }
      if (options.onProgress) options.onProgress(progress);

      window.dispatchEvent(new CustomEvent('upload-progress', {
        detail: { path, file: file.name, ...progress }
      }));
    });

    progressTracker.completeTask(taskId);
    uploadState.clear(path);

    window.dispatchEvent(new CustomEvent('upload-complete', {
      detail: { path, file: file.name, size: file.size }
    }));

    return path;
  } catch (error) {
    progressTracker.failTask(taskId, error.message);
    uploadState.clear(path);

    window.dispatchEvent(new CustomEvent('upload-failed', {
      detail: { path, file: file.name, error: error.message }
    }));

    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
//  SAVE RESOURCE WITH QUEUE + RETRY + PROGRESS
// ═══════════════════════════════════════════════════════════

export async function saveResource(resourceType, values, files, existing = null) {
  const client = await getSupabase();
  const user = await currentUser(client);

  const networkInfo = getNetworkInfo();
  if (!networkInfo.online) {
    throw new Error("You are offline. Please check your internet connection and try again.");
  }

  const payload = {
    resource_type: resourceType,
    file_name: values.fileName.trim(),
    description: values.description?.trim() || CONFIG.defaultDescription,
    category: values.category || "Utilities",
    sort_key: values.sortKey || "newest",
    updated_at: new Date().toISOString()
  };

  const cleanup = [];

  try {
    if (files.mainFile) {
      payload.file_path = await uploadQueue.add(
        () => uploadStorageFile(RESOURCE_BUCKET, user.id, resourceType, files.mainFile, {
          onProgress: (progress) => {
            window.dispatchEvent(new CustomEvent('upload-progress', {
              detail: { file: 'main', fileName: files.mainFile.name, ...progress }
            }));
          }
        }),
        { priority: 10 }
      );
      payload.file_size = files.mainFile.size;
      cleanup.push([RESOURCE_BUCKET, payload.file_path]);
    }

    if (files.iconFile) {
      payload.icon_path = await uploadQueue.add(
        () => uploadStorageFile(ICON_BUCKET, user.id, resourceType, files.iconFile, {
          onProgress: (progress) => {
            window.dispatchEvent(new CustomEvent('upload-progress', {
              detail: { file: 'icon', fileName: files.iconFile.name, ...progress }
            }));
          }
        }),
        { priority: 5 }
      );
      cleanup.push([ICON_BUCKET, payload.icon_path]);
    }

    if (files.previewOne) {
      payload.preview_one_path = await uploadQueue.add(
        () => uploadStorageFile(PREVIEW_BUCKET, user.id, resourceType, files.previewOne, {
          onProgress: (progress) => {
            window.dispatchEvent(new CustomEvent('upload-progress', {
              detail: { file: 'preview1', fileName: files.previewOne.name, ...progress }
            }));
          }
        }),
        { priority: 3 }
      );
      cleanup.push([PREVIEW_BUCKET, payload.preview_one_path]);
    }

    if (files.previewTwo) {
      payload.preview_two_path = await uploadQueue.add(
        () => uploadStorageFile(PREVIEW_BUCKET, user.id, resourceType, files.previewTwo, {
          onProgress: (progress) => {
            window.dispatchEvent(new CustomEvent('upload-progress', {
              detail: { file: 'preview2', fileName: files.previewTwo.name, ...progress }
            }));
          }
        }),
        { priority: 1 }
      );
      cleanup.push([PREVIEW_BUCKET, payload.preview_two_path]);
    }

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
      await Promise.allSettled([
        payload.file_path && existing.file_path
          ? removeStorageFiles(RESOURCE_BUCKET, [existing.file_path])
          : Promise.resolve(),
        payload.icon_path && existing.icon_path
          ? removeStorageFiles(ICON_BUCKET, [existing.icon_path])
          : Promise.resolve(),
        payload.preview_one_path && existing.preview_one_path
          ? removeStorageFiles(PREVIEW_BUCKET, [existing.preview_one_path])
          : Promise.resolve(),
        payload.preview_two_path && existing.preview_two_path
          ? removeStorageFiles(PREVIEW_BUCKET, [existing.preview_two_path])
          : Promise.resolve(),
      ]);
    }

    return data;
  } catch (error) {
    await Promise.allSettled(
      cleanup.map(([bucket, path]) => removeStorageFiles(bucket, [path]))
    );
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
//  ORIGINAL CLASSES & FUNCTIONS (KEPT AS-IS)
// ═══════════════════════════════════════════════════════════

export class SupabaseSetupError extends Error {
  constructor(message = "Supabase is not configured yet.") {
    super(message);
    this.name = "SupabaseSetupError";
  }
}

export function configured() {
  return isSupabaseConfigured();
}

async function loadSupabaseModule() {
  const errors = [];
  for (const url of SUPABASE_CDNS) {
    try {
      const module = await import(url);
      if (typeof module.createClient === "function") return module;
      throw new Error("createClient export is missing.");
    } catch (error) {
      errors.push(`${new URL(url).hostname}: ${error.message || error}`);
    }
  }
  throw new Error(`library load failed (${errors.join("; ")})`);
}

export async function getSupabase() {
  if (!configured()) {
    throw new SupabaseSetupError(
      "Add your Supabase URL and anon key in src/config.js, then reload the app."
    );
  }

  if (!clientPromise) {
    clientPromise = loadSupabaseModule()
      .then(({ createClient }) =>
        createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        })
      )
      .catch((error) => {
        clientPromise = undefined;
        throw new Error(`Could not load Supabase client: ${error.message}`);
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

const MIME_BY_EXTENSION = {
  aar: "application/octet-stream",
  apk: "application/vnd.android.package-archive",
  bin: "application/octet-stream",
  css: "text/css",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html",
  jar: "application/java-archive",
  java: "text/x-java-source",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  kt: "text/plain",
  pdf: "application/pdf",
  png: "image/png",
  rar: "application/vnd.rar",
  svg: "image/svg+xml",
  swb: "application/octet-stream",
  txt: "text/plain",
  webp: "image/webp",
  xml: "text/xml",
  zip: "application/zip"
};

const EXTENSION_BY_MIME = {
  "application/java-archive": "jar",
  "application/json": "json",
  "application/pdf": "pdf",
  "application/vnd.android.package-archive": "apk",
  "application/vnd.rar": "rar",
  "application/x-rar-compressed": "rar",
  "application/x-zip-compressed": "zip",
  "application/zip": "zip",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "text/css": "css",
  "text/html": "html",
  "text/javascript": "js",
  "text/plain": "txt",
  "text/xml": "xml"
};

function extensionFromName(fileName) {
  const match = String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function cleanFileName(file) {
  const rawName = typeof file?.name === "string" ? file.name.trim().split(/[/\\]/).pop() : "";
  const fallbackExtension = EXTENSION_BY_MIME[String(file?.type || "").toLowerCase()] || "bin";
  return rawName || `upload.${fallbackExtension}`;
}

function contentTypeFor(file, fileName) {
  return (
    file?.type ||
    MIME_BY_EXTENSION[extensionFromName(fileName)] ||
    "application/octet-stream"
  );
}

function storageFileName(fileName, contentType) {
  const fallbackExtension = EXTENSION_BY_MIME[String(contentType || "").toLowerCase()] || "bin";
  const safeName = slug(fileName) || `upload.${fallbackExtension}`;
  if (safeName.startsWith(".")) return `upload${safeName}`;
  return safeName;
}

function storageObjectUrl(bucket, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${CONFIG.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

function storageErrorFromText(status, statusText, text) {
  let message = text;
  try {
    const data = JSON.parse(text);
    message = data.message || data.error || data.msg || text;
  } catch {}
  return new Error(`Storage upload failed (${status}): ${message || statusText}`);
}

async function currentUser(client) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Please sign in first.");
  return data.user;
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
    redirectTo: `${window.location.origin}${window.location.pathname}#/auth`
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

async function removeStorageFiles(bucket, paths) {
  const keep = paths.filter(Boolean);
  if (!keep.length) return;
  const client = await getSupabase();
  await client.storage.from(bucket).remove(keep);
}

export async function deleteResource(item) {
  const client = await getSupabase();
  const { error } = await client.from("resource_items").delete().eq("id", item.id);
  if (error) throw error;
  await Promise.allSettled([
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
        reject(new Error(`Download failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during download."));
    xhr.send();
  });
}

export async function downloadResourceFile(item, onProgress) {
  if (!item.file_path) throw new Error("This item has no downloadable file.");
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