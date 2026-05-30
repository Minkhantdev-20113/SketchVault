import { CONFIG } from "./config.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";

export const resourcePages = {
  projects: {
    route: "projects",
    type: "project",
    table: "resource",
    title: "Project Files",
    shortTitle: "Projects",
    subtitle: "Upload, preview, favorite, and download Sketchware Pro project bundles.",
    uploadTitle: "Upload Project File",
    accept: ".swb,.zip",
    requiresProjectAssets: true,
    icon: "folder"
  },
  blocks: {
    route: "blocks",
    type: "custom_block",
    table: "resource",
    title: "Custom Blocks Files",
    shortTitle: "Blocks",
    subtitle: "Reusable block collections with category and sorting controls.",
    uploadTitle: "Upload Custom Block File",
    accept: ".json,.txt,.zip,.swb,*",
    requiresProjectAssets: false,
    icon: "blocks"
  },
  libraries: {
    route: "libraries",
    type: "library",
    table: "resource",
    title: "Library Files",
    shortTitle: "Libraries",
    subtitle: "Manage Sketchware libraries with searchable, favorite-ready lists.",
    uploadTitle: "Upload Library File",
    accept: ".jar,.aar,.zip,*",
    requiresProjectAssets: false,
    icon: "library"
  },
  icons: {
    route: "icons",
    type: "icon",
    table: "resource",
    title: "Icon Files",
    shortTitle: "Icons",
    subtitle: "A polished catalog for image assets and icon packs.",
    uploadTitle: "Upload Icon File",
    accept: ".png,.jpg,.jpeg,.webp,.svg,.zip,*",
    requiresProjectAssets: false,
    icon: "image"
  }
};

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function initials(name = "User") {
  return escapeHtml(String(name || "User").trim().charAt(0).toUpperCase() || "U");
}

export function formatDate(value) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function formatRelative(value) {
  if (!value) return "Unknown time";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function fileSize(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function toast(message, type = "info") {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.id = id;
  item.innerHTML = `${icon(type === "success" ? "check" : type === "error" ? "alert" : "info", 18)}<span>${escapeHtml(
    message
  )}</span><button type="button" class="icon-button ghost tiny" aria-label="Dismiss notification" data-toast-close="${id}">${icon(
    "x",
    16
  )}</button>`;
  region.appendChild(item);
  requestAnimationFrame(() => item.classList.add("show"));
  const timer = setTimeout(() => dismissToast(id), type === "error" ? 7000 : 4200);
  item.dataset.timer = String(timer);
}

export function dismissToast(id) {
  const item = document.getElementById(id);
  if (!item) return;
  clearTimeout(Number(item.dataset.timer || 0));
  item.classList.remove("show");
  setTimeout(() => item.remove(), 180);
}

export function skeletonCards(count = 6) {
  return Array.from({ length: count })
    .map(
      () => `<article class="card skeleton-card" aria-hidden="true">
        <div class="skeleton avatar-line"></div>
        <div class="skeleton line wide"></div>
        <div class="skeleton line"></div>
        <div class="skeleton line short"></div>
      </article>`
    )
    .join("");
}

export function emptyState(title, body, action = "") {
  return `<section class="empty-state">
    <div class="empty-icon">${icon("cloud", 28)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
    ${action}
  </section>`;
}

export function dropdown({ name, label, value, options, action = "dropdown-option", compact = false }) {
  const current = options.find((item) => item.value === value || item === value) || options[0];
  const currentLabel = typeof current === "string" ? current : current.label;
  const currentValue = typeof current === "string" ? current : current.value;
  const items = options
    .map((option) => {
      const optionLabel = typeof option === "string" ? option : option.label;
      const optionValue = typeof option === "string" ? option : option.value;
      return `<button type="button" role="option" class="dropdown-item${
        optionValue === currentValue ? " active" : ""
      }" data-action="${action}" data-name="${escapeHtml(name)}" data-value="${escapeHtml(optionValue)}">
        ${escapeHtml(optionLabel)}
      </button>`;
    })
    .join("");
  return `<div class="field custom-field${compact ? " compact" : ""}" data-dropdown="${escapeHtml(name)}">
    <span class="field-label">${escapeHtml(label)}</span>
    <button type="button" class="dropdown-trigger" data-action="dropdown-toggle" aria-haspopup="listbox" aria-expanded="false">
      <span data-dropdown-label="${escapeHtml(name)}">${escapeHtml(currentLabel)}</span>
      ${icon("chevronDown", 16)}
    </button>
    <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(currentValue)}" />
    <div class="dropdown-menu" role="listbox">${items}</div>
  </div>`;
}

export function categoryDropdown(name = "category", value = CONFIG.categories[0], label = "Category", compact = false) {
  return dropdown({ name, label, value, options: CONFIG.categories, compact });
}

export function sortingDropdown(value = "newest", compact = false) {
  return dropdown({ name: "sortKey", label: "Sort", value, options: CONFIG.sortOptions, compact });
}

export function filterItems(items, filters, nameKey = "file_name") {
  let result = [...items];
  const query = (filters.search || "").trim().toLowerCase();
  if (query) {
    result = result.filter((item) => String(item[nameKey] || "").toLowerCase().includes(query));
  }
  if (filters.category && filters.category !== "All") {
    result = result.filter((item) => item.category === filters.category);
  }
  if (filters.favoritesOnly) {
    result = result.filter((item) => item.is_favorite);
  }

  switch (filters.sortKey) {
    case "oldest":
      result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case "name-asc":
      result.sort((a, b) => String(a[nameKey] || "").localeCompare(String(b[nameKey] || "")));
      break;
    case "name-desc":
      result.sort((a, b) => String(b[nameKey] || "").localeCompare(String(a[nameKey] || "")));
      break;
    case "favorites":
      result.sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite));
      break;
    default:
      result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  return result;
}

export function highlightJava(code = "") {
  const source = String(code || "");
  if (globalThis.Prism?.languages?.java) {
    try {
      return Prism.highlight(source, Prism.languages.java, "java");
    } catch {
      /* fallback */
    }
  }
  const escaped = escapeHtml(source);
  const keywords =
    "\\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while)\\b";
  return escaped
    .replace(/(\/\/.*?$)/gm, '<span class="code-comment">$1</span>')
    .replace(/(&quot;.*?&quot;|&#039;.*?&#039;)/g, '<span class="code-string">$1</span>')
    .replace(new RegExp(keywords, "g"), '<span class="code-keyword">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="code-number">$1</span>');
}

export function uploadStatusMarkup(upload) {
  if (!upload?.active && !upload?.error) return "";
  const percent = upload.percent ?? 0;
  const statusClass = upload.error ? "is-error" : upload.percent === 100 ? "is-success" : "";
  return `<div class="upload-status ${statusClass}" data-upload-progress role="status" aria-live="polite">
    <div class="upload-status-head">
      <strong data-upload-message>${escapeHtml(upload.message || t("upload.preparing"))}</strong>
      <span data-upload-percent>${upload.error ? "" : `${percent}%`}</span>
    </div>
    <div class="progress-track" aria-hidden="true"><span data-upload-fill style="width:${percent}%"></span></div>
    ${
      upload.error
        ? `<p class="upload-error">${escapeHtml(upload.error)}</p>
          <div class="upload-status-actions">
            <button class="button secondary compact" type="button" data-action="retry-upload">${t("common.retry")}</button>
            <button class="button ghost compact" type="button" data-action="cancel-upload">${t("common.cancel")}</button>
          </div>`
        : upload.active
          ? `<button class="button ghost compact" type="button" data-action="cancel-upload">${t("common.cancel")}</button>`
          : ""
    }
  </div>`;
}

export function statSparkline(values = []) {
  const points = values.length ? values : [4, 7, 5, 9, 6, 8];
  const max = Math.max(...points, 1);
  const coords = points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return `<svg class="stat-sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${coords}" />
  </svg>`;
}

export function skeletonListRows(count = 5) {
  return Array.from({ length: count })
    .map(
      () => `<article class="list-row skeleton-row" aria-hidden="true">
        <span class="skeleton avatar-line"></span>
        <span class="skeleton line wide"></span>
      </article>`
    )
    .join("");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function extensionIs(file, allowed) {
  if (!file || !allowed?.length) return true;
  const name = file.name.toLowerCase();
  return allowed.some((extension) => name.endsWith(extension));
}
