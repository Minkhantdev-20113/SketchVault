import { CONFIG, isSupabaseConfigured } from "./config.js";
import { icon } from "./icons.js";
import {
  canManage,
  configured,
  deleteJavaCode,
  deleteResource,
  downloadResourceFile,
  getCurrentContext,
  listJavaCodes,
  listResources,
  loadDashboardData,
  onAuthStateChange,
  readableError,
  saveJavaCode,
  saveResource,
  sendPasswordReset,
  signInWithEmail,
  signInWithProvider,
  signOut,
  signUpWithEmail,
  toggleFavorite,
  updatePassword
} from "./supabase.js";
import {
  categoryDropdown,
  dismissToast,
  downloadBlob,
  dropdown,
  emptyState,
  escapeHtml,
  fileSize,
  filterItems,
  formatDate,
  formatRelative,
  highlightJava,
  initials,
  resourcePages,
  skeletonCards,
  sortingDropdown,
  toast
} from "./ui.js";

const app = document.getElementById("app");
const protectedRoutes = new Set(["dashboard", "projects", "java", "blocks", "libraries", "icons", "appearance"]);
const navItems = [
  { route: "dashboard", label: "Main Dashboard", icon: "dashboard" },
  { route: "projects", label: "Project Files", icon: "folder" },
  { route: "java", label: "Java Source Code", icon: "code" },
  { route: "blocks", label: "Custom Blocks Files", icon: "blocks" },
  { route: "libraries", label: "Library Files", icon: "library" },
  { route: "icons", label: "Icon Files", icon: "image" },
  { route: "appearance", label: "Appearance", icon: "palette" }
];

const baseFilter = () => ({
  search: "",
  category: "All",
  sortKey: "newest",
  favoritesOnly: false
});

const state = {
  route: parseRoute(),
  authMode: "signin",
  authLoading: true,
  dataLoading: false,
  sidebarCollapsed: localStorage.getItem("sidebar-collapsed") === "true",
  mobileNavOpen: false,
  theme: localStorage.getItem("theme") || "light",
  session: null,
  user: null,
  profile: null,
  data: {
    dashboard: null,
    projects: null,
    java: null,
    blocks: null,
    libraries: null,
    icons: null
  },
  filters: {
    projects: baseFilter(),
    java: baseFilter(),
    blocks: baseFilter(),
    libraries: baseFilter(),
    icons: baseFilter()
  },
  viewMode: {
    projects: "grid",
    icons: "grid"
  },
  modal: null,
  downloads: {}
};

function parseRoute() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (!raw || raw.startsWith("access_token") || raw.startsWith("error")) return "landing";
  return raw.split("?")[0] || "landing";
}

function navigate(route) {
  const target = route === "landing" ? "#/" : `#/${route}`;
  if (window.location.hash === target) {
    handleRouteChange();
  } else {
    window.location.hash = target;
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    state.theme === "dark" ? "#111827" : "#f7f8fb"
  );
}

function username() {
  return state.profile?.username || state.user?.email?.split("@")[0] || "Member";
}

function isSignedIn() {
  return Boolean(state.user);
}

function routeIsProtected(route = state.route) {
  return protectedRoutes.has(route);
}

function normalizeRoute() {
  const route = state.route;
  const known = new Set(["landing", "auth", ...protectedRoutes]);
  if (!known.has(route)) {
    state.route = "landing";
  }

  if (!state.authLoading && routeIsProtected() && !isSignedIn()) {
    state.route = "auth";
    state.authMode = "signin";
    history.replaceState(null, "", "#/auth");
  }

  if (!state.authLoading && state.route === "auth" && isSignedIn()) {
    state.route = "dashboard";
    history.replaceState(null, "", "#/dashboard");
  }
}

function render() {
  normalizeRoute();
  applyTheme();

  if (state.route === "landing") {
    app.innerHTML = renderLanding();
    return;
  }

  if (state.route === "auth") {
    app.innerHTML = renderAuth();
    return;
  }

  const content = renderProtectedPage();
  app.innerHTML = renderShell(content);
}

async function boot() {
  bindEvents();
  render();

  try {
    const context = await getCurrentContext();
    state.session = context.session;
    state.user = context.user;
    state.profile = context.profile;
  } catch (error) {
    if (configured()) toast(readableError(error), "error");
  } finally {
    state.authLoading = false;
    render();
    await loadRouteData();
  }

  try {
    await onAuthStateChange(async (context) => {
      state.session = context.session;
      state.user = context.user;
      state.profile = context.profile;
      state.data.dashboard = null;
      render();
      await loadRouteData(true);
    });
  } catch (error) {
    toast(readableError(error), "error");
  }
}

function bindEvents() {
  window.addEventListener("hashchange", handleRouteChange);
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleDrop);
  bindTouchNavigation();
}

async function handleRouteChange() {
  state.route = parseRoute();
  state.mobileNavOpen = false;
  state.modal = null;
  render();
  await loadRouteData();
}

async function loadRouteData(force = false) {
  if (!configured() || !isSignedIn() || state.route === "auth" || state.route === "landing" || state.route === "appearance") {
    return;
  }

  const route = state.route;
  if (!force && state.data[route]) return;

  state.dataLoading = true;
  render();
  try {
    if (route === "dashboard") {
      state.data.dashboard = await loadDashboardData();
    } else if (route === "java") {
      state.data.java = await listJavaCodes();
    } else if (resourcePages[route]) {
      state.data[route] = await listResources(resourcePages[route].type);
    }
  } catch (error) {
    toast(readableError(error), "error");
  } finally {
    state.dataLoading = false;
    render();
  }
}

async function refreshRoute(route = state.route) {
  state.data[route] = null;
  await loadRouteData(true);
}

async function reloadAfterMutation(primaryRoute) {
  if (primaryRoute) state.data[primaryRoute] = null;
  state.data.dashboard = null;
  await loadRouteData(true);
}

function renderLanding() {
  const startTarget = isSignedIn() ? "dashboard" : "auth";
  return `<main class="landing">
    <header class="landing-nav">
      <a class="brand" href="#/" aria-label="Sketchware Pro Hub home">
        <span class="brand-mark">S</span>
        <span>Sketchware Pro Hub</span>
      </a>
      <nav class="landing-actions" aria-label="Landing actions">
        <a class="button ghost" href="${CONFIG.docsUrl}">${icon("book", 18)}Documentation</a>
        <a class="button ghost" href="${CONFIG.toolsUrl}">${icon("tools", 18)}Other Tools</a>
        <button class="button primary" type="button" data-action="navigate" data-route="${startTarget}">
          ${icon("chevronRight", 18)}Get Started
        </button>
      </nav>
    </header>

    <section class="hero-section">
      <div class="hero-bg" aria-hidden="true"></div>
      <div class="hero-copy">
        <p class="eyebrow">Sketchware Pro resource platform</p>
        <h1>Sketchware Pro Hub</h1>
        <p>
          A polished SaaS workspace for managing Sketchware project files, Java source code, custom blocks,
          libraries, icons, previews, favorites, and secure downloads from one mobile-first dashboard.
        </p>
        <div class="hero-actions">
          <button class="button primary large" type="button" data-action="navigate" data-route="${startTarget}">
            ${icon("chevronRight", 20)}Get Started
          </button>
          <a class="button secondary large" href="${CONFIG.docsUrl}">${icon("book", 20)}Documentation</a>
        </div>
      </div>
      <div class="hero-media" aria-label="Sketchware Pro Hub dashboard preview">
        <img src="assets/hero-dashboard.png" alt="Sketchware Pro Hub dashboard preview" />
      </div>
    </section>

    <section class="download-band" aria-label="Download resources">
      <div>
        <p class="eyebrow">Downloads</p>
        <h2>Sketchware Pro builds and resource packs</h2>
      </div>
      <div class="download-grid">
        <a class="download-button" href="${CONFIG.downloads.sketchwareStable}" target="_blank" rel="noreferrer">
          ${icon("download", 19)}Stable APK
        </a>
        <a class="download-button" href="${CONFIG.downloads.sketchwareBeta}" target="_blank" rel="noreferrer">
          ${icon("download", 19)}Beta APK
        </a>
        <a class="download-button" href="${CONFIG.downloads.sketchwareClassic}" target="_blank" rel="noreferrer">
          ${icon("download", 19)}Classic Build
        </a>
        <a class="download-button featured" href="${CONFIG.downloads.allInOne}" target="_blank" rel="noreferrer">
          ${icon("cloud", 19)}All-in-One Resources
        </a>
      </div>
    </section>

    <section class="feature-band" aria-label="Platform capabilities">
      ${[
        ["Secure Resource OS", "Supabase Auth, RLS, private storage, and owner/admin permissions."],
        ["Mobile Command Center", "Overlay navigation, touch-friendly controls, and adaptive dashboard grids."],
        ["Production Upload Flow", "Drag-and-drop uploads, custom categories, preview images, and retryable downloads."]
      ]
        .map(
          ([title, body]) => `<article class="feature-card">
          <h3>${title}</h3>
          <p>${body}</p>
        </article>`
        )
        .join("")}
    </section>
  </main>`;
}

function renderAuth() {
  const configuredNotice = !isSupabaseConfigured()
    ? `<section class="setup-callout">
        <div>${icon("alert", 22)}</div>
        <div>
          <h3>Supabase setup required</h3>
          <p>Authentication and uploads are disabled until you add real Supabase credentials in <code>src/config.js</code> and run the SQL in <code>supabase/schema.sql</code>.</p>
        </div>
      </section>`
    : "";

  const mode = state.authMode;
  return `<main class="auth-page">
    <a class="brand auth-brand" href="#/">
      <span class="brand-mark">S</span>
      <span>Sketchware Pro Hub</span>
    </a>
    <section class="auth-card">
      <div class="auth-copy">
        <p class="eyebrow">Secure workspace</p>
        <h1>${mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset access" : "Welcome back"}</h1>
        <p>Use email, Google, or GitHub to manage Sketchware resources with private storage and protected edit controls.</p>
      </div>
      ${configuredNotice}
      <div class="auth-tabs" role="tablist" aria-label="Authentication mode">
        ${authTab("signin", "Sign In")}
        ${authTab("signup", "Sign Up")}
        ${authTab("forgot", "Reset")}
      </div>
      ${mode === "signup" ? renderSignUpForm() : mode === "forgot" ? renderForgotForm() : renderSignInForm()}
    </section>
  </main>`;
}

function authTab(mode, label) {
  return `<button type="button" class="auth-tab${state.authMode === mode ? " active" : ""}" data-action="auth-mode" data-mode="${mode}" role="tab" aria-selected="${
    state.authMode === mode
  }">${label}</button>`;
}

function passwordField(name, label, autocomplete, placeholder) {
  return `<label class="field password-field">
    <span class="field-label">${escapeHtml(label)}</span>
    <span class="input-icon">${icon("lock", 18)}</span>
    <input type="password" name="${name}" autocomplete="${autocomplete}" required minlength="6" placeholder="${escapeHtml(placeholder)}" />
    <button class="password-toggle" type="button" data-action="toggle-password" aria-label="Show ${escapeHtml(label)}" aria-pressed="false">
      ${icon("eye", 18)}
    </button>
  </label>`;
}

function renderSignInForm() {
  return `<form class="auth-form" data-form="signin">
    <label class="field">
      <span class="field-label">Email</span>
      <span class="input-icon">${icon("mail", 18)}</span>
      <input type="email" name="email" autocomplete="email" required placeholder="you@example.com" />
    </label>
    ${passwordField("password", "Password", "current-password", "Your password")}
    <button class="button primary full" type="submit">${icon("chevronRight", 18)}Sign In</button>
    ${oauthButtons("Sign in")}
  </form>`;
}

function renderSignUpForm() {
  return `<form class="auth-form" data-form="signup">
    <label class="field">
      <span class="field-label">Username</span>
      <span class="input-icon">${icon("user", 18)}</span>
      <input type="text" name="username" autocomplete="nickname" required minlength="2" maxlength="32" placeholder="Your display name" />
    </label>
    <label class="field">
      <span class="field-label">Email</span>
      <span class="input-icon">${icon("mail", 18)}</span>
      <input type="email" name="email" autocomplete="email" required placeholder="you@example.com" />
    </label>
    ${passwordField("password", "Password", "new-password", "At least 6 characters")}
    ${passwordField("confirmPassword", "Confirm Password", "new-password", "Repeat your password")}
    <button class="button primary full" type="submit">${icon("chevronRight", 18)}Create Account</button>
    ${oauthButtons("Sign up")}
  </form>`;
}

function renderForgotForm() {
  return `<form class="auth-form" data-form="forgot">
    <label class="field">
      <span class="field-label">Email</span>
      <span class="input-icon">${icon("mail", 18)}</span>
      <input type="email" name="email" autocomplete="email" required placeholder="you@example.com" />
    </label>
    <button class="button primary full" type="submit">${icon("mail", 18)}Send Reset Link</button>
  </form>
  <form class="auth-form compact-form" data-form="password-update">
    ${passwordField("password", "New password after opening reset link", "new-password", "New password")}
    ${passwordField("confirmPassword", "Confirm new password", "new-password", "Repeat new password")}
    <button class="button secondary full" type="submit">${icon("check", 18)}Update Password</button>
  </form>`;
}

function oauthButtons(prefix) {
  return `<div class="oauth-grid">
    <button class="button oauth" type="button" data-action="oauth" data-provider="google"><span class="oauth-mark">G</span>${prefix} with Google</button>
    <button class="button oauth" type="button" data-action="oauth" data-provider="github"><span class="oauth-mark">GH</span>${prefix} with GitHub</button>
  </div>`;
}

function renderShell(content) {
  return `<div class="app-shell${state.sidebarCollapsed ? " is-collapsed" : ""}${state.mobileNavOpen ? " nav-open" : ""}">
    <button class="mobile-backdrop" type="button" data-action="close-mobile-nav" aria-label="Close navigation"></button>
    ${renderSidebar()}
    <section class="workspace">
      ${renderTopbar()}
      <main class="page-view">${content}${renderModal()}</main>
    </section>
  </div>`;
}

function renderSidebar() {
  return `<aside class="sidebar" aria-label="Primary navigation">
    <div class="sidebar-head">
      <a class="brand" href="#/dashboard">
        <span class="brand-mark">S</span>
        <span class="brand-text">Sketchware Hub</span>
      </a>
      <button class="icon-button sidebar-close" type="button" data-action="close-mobile-nav" aria-label="Close sidebar">${icon("x", 18)}</button>
    </div>
    <nav class="sidebar-nav">
      ${navItems
        .map(
          (item) => `<button type="button" title="${item.label}" class="nav-item${
            state.route === item.route ? " active" : ""
          }" data-action="navigate" data-route="${item.route}">
            ${icon(item.icon, 20)}
            <span>${item.label}</span>
          </button>`
        )
        .join("")}
    </nav>
    <div class="sidebar-footer">
      <button class="nav-item theme-item" type="button" data-action="toggle-theme" title="Toggle theme">
        ${icon(state.theme === "dark" ? "sun" : "moon", 20)}
        <span>${state.theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
      </button>
      <div class="profile-chip">
        <span class="avatar">${initials(username())}</span>
        <span class="profile-copy">
          <strong>${escapeHtml(username())}</strong>
          <small>${state.profile?.role === "admin" ? "Admin" : "Member"}</small>
        </span>
      </div>
    </div>
  </aside>`;
}

function renderTopbar() {
  const title = navItems.find((item) => item.route === state.route)?.label || "Workspace";
  return `<header class="topbar">
    <div class="topbar-left">
      <button class="icon-button" type="button" data-action="open-mobile-nav" aria-label="Open navigation">${icon("menu", 20)}</button>
      <button class="icon-button collapse-toggle" type="button" data-action="toggle-sidebar" aria-label="Collapse sidebar">
        ${icon(state.sidebarCollapsed ? "chevronRight" : "chevronLeft", 19)}
      </button>
      <div>
        <p class="eyebrow">Sketchware Pro Hub</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
    </div>
    <div class="topbar-actions">
      <button class="icon-button" type="button" data-action="toggle-theme" aria-label="Toggle theme">${icon(
        state.theme === "dark" ? "sun" : "moon",
        19
      )}</button>
      <div class="topbar-user">
        <span class="avatar">${initials(username())}</span>
        <span>${escapeHtml(username())}</span>
      </div>
      <button class="button ghost compact" type="button" data-action="signout">${icon("logout", 18)}Sign Out</button>
    </div>
  </header>`;
}

function renderProtectedPage() {
  if (state.route === "dashboard") return renderDashboard();
  if (state.route === "java") return renderJavaPage();
  if (state.route === "appearance") return renderAppearancePage();
  if (resourcePages[state.route]) return renderResourcePage(resourcePages[state.route]);
  return renderDashboard();
}

function renderDashboard() {
  if ((state.dataLoading || state.data.dashboard === null) && !state.data.dashboard) {
    return `<section class="page-section">${renderPageHeader("Welcome back", "Loading your Sketchware resource workspace.", "dashboard")}${skeletonCards(
      6
    )}</section>`;
  }

  const dashboard = state.data.dashboard || { resources: [], javaCodes: [], recent: [] };
  const projects = dashboard.resources.filter((item) => item.resource_type === "project").length;
  const blocks = dashboard.resources.filter((item) => item.resource_type === "custom_block").length;
  const libraries = dashboard.resources.filter((item) => item.resource_type === "library").length;
  const icons = dashboard.resources.filter((item) => item.resource_type === "icon").length;
  const javaCount = dashboard.javaCodes.length;
  const categories = new Set([
    ...dashboard.resources.map((item) => item.category),
    ...dashboard.javaCodes.map((item) => item.category)
  ].filter(Boolean));

  return `<section class="page-section dashboard-page">
    ${renderPageHeader(`Welcome, ${username()}`, "A real-time control center for your Sketchware Pro resources.", "dashboard")}
    <div class="stats-grid">
      ${statCard("Project Files", projects, "folder")}
      ${statCard("Java Snippets", javaCount, "code")}
      ${statCard("Files Total", dashboard.resources.length, "cloud")}
      ${statCard("Categories", categories.size, "filter")}
    </div>
    <div class="dashboard-layout">
      <section class="panel wide-panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Recent activity</p>
            <h3>Latest uploads</h3>
          </div>
          <button class="button ghost compact" type="button" data-action="navigate" data-route="projects">${icon(
            "external",
            17
          )}Open Files</button>
        </div>
        ${
          dashboard.recent.length
            ? `<div class="activity-list">${dashboard.recent
                .map(
                  (item) => `<article class="activity-item">
                    <span class="activity-icon">${icon(item.kind === "java" ? "code" : resourceIcon(item.kind), 18)}</span>
                    <div>
                      <strong>${escapeHtml(item.display_name)}</strong>
                      <span>${escapeHtml(item.category || "Uncategorized")} • ${formatRelative(item.created_at)}</span>
                    </div>
                  </article>`
                )
                .join("")}</div>`
            : emptyState(
                "No uploads yet",
                "Use the quick access cards to add your first project, Java code, block file, library, or icon.",
                ""
              )
        }
      </section>
      <aside class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Quick access</p>
            <h3>Add resources</h3>
          </div>
        </div>
        <div class="quick-grid">
          ${quickButton("projects", "Project", "folder")}
          ${quickButton("java", "Java Code", "code")}
          ${quickButton("blocks", "Block File", "blocks")}
          ${quickButton("libraries", "Library", "library")}
          ${quickButton("icons", "Icon", "image")}
        </div>
      </aside>
      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">File counts</p>
            <h3>Library mix</h3>
          </div>
        </div>
        <div class="meter-list">
          ${meter("Projects", projects, dashboard.resources.length || 1)}
          ${meter("Blocks", blocks, dashboard.resources.length || 1)}
          ${meter("Libraries", libraries, dashboard.resources.length || 1)}
          ${meter("Icons", icons, dashboard.resources.length || 1)}
        </div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Security</p>
            <h3>Access model</h3>
          </div>
          ${icon("shield", 22)}
        </div>
        <p class="muted">Rows and storage objects are protected by Supabase RLS. Uploaders and admins can edit or delete; signed URLs power downloads.</p>
      </section>
    </div>
  </section>`;
}

function resourceIcon(kind) {
  const route = Object.values(resourcePages).find((page) => page.type === kind);
  return route?.icon || "file";
}

function statCard(label, value, iconName) {
  return `<article class="stat-card">
    <span>${icon(iconName, 21)}</span>
    <div>
      <strong>${Number(value).toLocaleString()}</strong>
      <small>${label}</small>
    </div>
  </article>`;
}

function quickButton(route, label, iconName) {
  const action = route === "java" ? "open-java-upload" : "open-upload";
  return `<button class="quick-button" type="button" data-action="${action}" data-route="${route}">
    ${icon(iconName, 20)}
    <span>${label}</span>
  </button>`;
}

function meter(label, value, total) {
  const percent = Math.round((value / total) * 100);
  return `<div class="meter-row">
    <div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>
    <span class="meter"><span style="width:${percent}%"></span></span>
  </div>`;
}

function renderPageHeader(title, subtitle, iconName) {
  return `<div class="page-header">
    <div class="title-cluster">
      <span class="page-icon">${icon(iconName, 24)}</span>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
    </div>
  </div>`;
}

function renderResourcePage(page) {
  const rawItems = state.data[page.route];
  const items = rawItems || [];
  const filters = state.filters[page.route];
  const filtered = filterItems(items, filters);
  const loading = (state.dataLoading || rawItems === null) && !rawItems;
  const isProject = page.route === "projects";
  const isIconPage = page.route === "icons";
  const viewMode = state.viewMode[page.route] || "list";

  return `<section class="page-section resource-page">
    ${renderSectionToolbar(page, filtered.length, items.length)}
    ${
      loading
        ? `<div class="${(isProject || isIconPage) && viewMode === "grid" ? "resource-grid" : "resource-list"}">${skeletonCards(
            6
          )}</div>`
        : filtered.length
          ? isProject
            ? renderProjectCollection(filtered)
            : isIconPage
              ? renderIconCollection(filtered, page)
              : renderResourceList(filtered, page)
          : emptyState(
              "No matching files",
              "Upload a resource or adjust the search, category, sort, and favorites filters.",
              `<button class="button primary" type="button" data-action="open-upload" data-route="${page.route}">${icon(
                "plus",
                18
              )}Add New</button>`
            )
    }
  </section>`;
}

function renderSectionToolbar(page, shown, total) {
  const filters = state.filters[page.route];
  const category = dropdown({
    name: "category",
    label: "Category",
    value: filters.category,
    options: ["All", ...CONFIG.categories],
    action: "filter-dropdown-option",
    compact: true
  });
  const sorting = dropdown({
    name: "sortKey",
    label: "Sort",
    value: filters.sortKey,
    options: CONFIG.sortOptions,
    action: "filter-dropdown-option",
    compact: true
  });
  const hasViewToggle = page.route === "projects" || page.route === "icons";
  const mode = state.viewMode[page.route] || "list";
  const viewToggle =
    hasViewToggle
      ? `<div class="segmented" aria-label="${escapeHtml(page.shortTitle)} view mode">
        <button type="button" class="${mode === "grid" ? "active" : ""}" data-action="view-mode" data-route="${page.route}" data-mode="grid" aria-label="Grid view">${icon(
          "grid",
          18
        )}</button>
        <button type="button" class="${mode === "list" ? "active" : ""}" data-action="view-mode" data-route="${page.route}" data-mode="list" aria-label="List view">${icon(
          "list",
          18
        )}</button>
      </div>`
      : "";

  return `<div class="resource-head">
    <div class="title-cluster">
      <span class="page-icon">${icon(page.icon, 24)}</span>
      <div>
        <h1>${page.title}</h1>
        <p>${page.subtitle}</p>
      </div>
    </div>
    <span class="result-count">${shown} of ${total}</span>
    <div class="toolbar">
      <label class="search-field">
        ${icon("search", 18)}
        <input type="search" value="${escapeHtml(filters.search)}" placeholder="Search by filename" data-search-route="${page.route}" />
      </label>
      <button class="button ghost compact filter-button" type="button" data-action="toggle-favorites-filter" data-route="${page.route}" aria-pressed="${
        filters.favoritesOnly
      }">
        ${icon(filters.favoritesOnly ? "star-filled" : "star", 18)}Favorites
      </button>
      ${category}
      ${sorting}
      ${viewToggle}
      <button class="button primary compact" type="button" data-action="open-upload" data-route="${page.route}">
        ${icon("plus", 18)}Add New
      </button>
    </div>
  </div>`;
}

function renderProjectCollection(items) {
  if (state.viewMode.projects === "list") {
    return renderResourceList(items, resourcePages.projects, true);
  }

  return `<div class="resource-grid">${items
    .map(
      (item) => `<article class="resource-card interactive" data-action="open-project" data-id="${item.id}" tabindex="0">
        <div class="resource-card-top">
          <span class="file-thumb">${item.icon_url ? `<img src="${item.icon_url}" alt="" />` : icon("folder", 24)}</span>
          ${favoriteButton("resource", item)}
        </div>
        <h3>${escapeHtml(item.file_name)}</h3>
        <p>${escapeHtml(item.description || CONFIG.defaultDescription)}</p>
        <div class="meta-row">
          <span>${escapeHtml(item.category || "Uncategorized")}</span>
          <span>${formatDate(item.created_at)}</span>
        </div>
      </article>`
    )
    .join("")}</div>`;
}

function renderIconCollection(items, page) {
  if (state.viewMode.icons === "list") {
    return `<div class="resource-list icon-list">${items
      .map(
        (item) => `<article class="list-row icon-row">
          <button class="row-main clickable" type="button" data-action="open-resource-detail" data-route="${page.route}" data-id="${item.id}">
            <span class="file-thumb icon-thumb small">${item.icon_url ? `<img src="${item.icon_url}" alt="" />` : icon(page.icon, 22)}</span>
            <span>
              <strong>${escapeHtml(item.file_name)}</strong>
              <small>${escapeHtml(item.category || "Uncategorized")} &bull; ${formatDate(item.created_at)} ${fileSize(item.file_size)}</small>
            </span>
          </button>
          <div class="row-actions">${favoriteButton("resource", item)}</div>
        </article>`
      )
      .join("")}</div>`;
  }

  return `<div class="resource-grid icon-grid">${items
    .map(
      (item) => `<article class="resource-card icon-card interactive" data-action="open-resource-detail" data-route="${page.route}" data-id="${item.id}" tabindex="0">
        <div class="resource-card-top">
          <span class="file-thumb icon-thumb">${item.icon_url ? `<img src="${item.icon_url}" alt="" />` : icon(page.icon, 28)}</span>
          ${favoriteButton("resource", item)}
        </div>
        <h3>${escapeHtml(item.file_name)}</h3>
        <div class="meta-row">
          <span>${escapeHtml(item.category || "Uncategorized")}</span>
          <span>${fileSize(item.file_size) || formatDate(item.created_at)}</span>
        </div>
      </article>`
    )
    .join("")}</div>`;
}

function renderResourceList(items, page, projectMode = false) {
  return `<div class="resource-list">${items
    .map((item) => {
      const manage = canManage(state.user, state.profile, item);
      return `<article class="list-row">
        <button class="row-main ${projectMode ? "clickable" : ""}" type="button" ${
          projectMode ? `data-action="open-project" data-id="${item.id}"` : ""
        }>
          <span class="file-thumb small">${item.icon_url ? `<img src="${item.icon_url}" alt="" />` : icon(page.icon, 22)}</span>
          <span>
            <strong>${escapeHtml(item.file_name)}</strong>
            <small>${escapeHtml(item.category || "Uncategorized")} • ${formatDate(item.created_at)} ${fileSize(item.file_size)}</small>
          </span>
        </button>
        <div class="row-actions">
          ${favoriteButton("resource", item)}
          ${downloadButton(item)}
          ${
            manage
              ? `<button class="icon-button" type="button" data-action="edit-resource" data-route="${page.route}" data-id="${item.id}" aria-label="Edit ${escapeHtml(
                  item.file_name
                )}">${icon("edit", 18)}</button>
                <button class="icon-button danger" type="button" data-action="delete-resource" data-route="${page.route}" data-id="${item.id}" aria-label="Delete ${escapeHtml(
                  item.file_name
                )}">${icon("trash", 18)}</button>`
              : ""
          }
        </div>
      </article>`;
    })
    .join("")}</div>`;
}

function favoriteButton(kind, item) {
  return `<button class="icon-button favorite${item.is_favorite ? " active" : ""}" type="button" data-action="toggle-favorite" data-kind="${kind}" data-id="${
    item.id
  }" aria-pressed="${Boolean(item.is_favorite)}" aria-label="${item.is_favorite ? "Remove from favorites" : "Add to favorites"}">
    ${icon(item.is_favorite ? "star-filled" : "star", 18)}
  </button>`;
}

function downloadButton(item) {
  const progress = state.downloads[item.id];
  const label = progress?.status === "downloading" ? `${progress.percent || 0}%` : progress?.status === "error" ? "Retry" : "Download";
  return `<button class="button ghost compact download-action" type="button" data-action="download-resource" data-id="${item.id}" data-download-id="${
    item.id
  }">
    ${icon(progress?.status === "error" ? "alert" : "download", 17)}<span>${label}</span>
    <span class="download-progress" style="width:${progress?.percent || 0}%"></span>
  </button>`;
}

function renderJavaPage() {
  const rawItems = state.data.java;
  const items = rawItems || [];
  const filters = state.filters.java;
  const filtered = filterItems(items, filters, "code_name");
  const loading = (state.dataLoading || rawItems === null) && !rawItems;
  const category = dropdown({
    name: "category",
    label: "Category",
    value: filters.category,
    options: ["All", ...CONFIG.categories],
    action: "filter-dropdown-option",
    compact: true
  });
  const sorting = dropdown({
    name: "sortKey",
    label: "Sort",
    value: filters.sortKey,
    options: CONFIG.sortOptions,
    action: "filter-dropdown-option",
    compact: true
  });

  return `<section class="page-section resource-page">
    <div class="resource-head">
      <div class="title-cluster">
        <span class="page-icon">${icon("code", 24)}</span>
        <div>
          <h1>Java Source Code</h1>
          <p>Store, highlight, favorite, copy, edit, and delete Java snippets.</p>
        </div>
      </div>
      <span class="result-count">${filtered.length} of ${items.length}</span>
      <div class="toolbar">
        <label class="search-field">${icon("search", 18)}
          <input type="search" value="${escapeHtml(filters.search)}" placeholder="Search by code name" data-search-route="java" />
        </label>
        <button class="button ghost compact filter-button" type="button" data-action="toggle-favorites-filter" data-route="java" aria-pressed="${
          filters.favoritesOnly
        }">${icon(filters.favoritesOnly ? "star-filled" : "star", 18)}Favorites</button>
        ${category}
        ${sorting}
        <button class="button primary compact" type="button" data-action="open-java-upload">${icon("plus", 18)}Add New</button>
      </div>
    </div>
    ${
      loading
        ? `<div class="resource-list">${skeletonCards(5)}</div>`
        : filtered.length
          ? `<div class="resource-list">${filtered
              .map((item) => renderJavaRow(item))
              .join("")}</div>`
          : emptyState(
              "No matching Java code",
              "Upload a snippet or adjust search, category, sort, and favorites filters.",
              `<button class="button primary" type="button" data-action="open-java-upload">${icon("plus", 18)}Add New</button>`
            )
    }
  </section>`;
}

function renderJavaRow(item) {
  return `<article class="list-row">
    <button class="row-main clickable" type="button" data-action="open-java-detail" data-id="${item.id}">
      <span class="file-thumb small">${icon("code", 22)}</span>
      <span>
        <strong>${escapeHtml(item.code_name)}</strong>
        <small>${escapeHtml(item.category || "Uncategorized")} • ${formatDate(item.created_at)}</small>
      </span>
    </button>
    <div class="row-actions">
      ${favoriteButton("java", item)}
      <button class="button ghost compact" type="button" data-action="open-java-detail" data-id="${item.id}">${icon("external", 17)}Details</button>
    </div>
  </article>`;
}

function renderAppearancePage() {
  return `<section class="page-section">
    ${renderPageHeader("Appearance", "Switch between light and dark mode. Your preference is saved locally.", "palette")}
    <div class="appearance-grid">
      <article class="panel theme-preview">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Theme</p>
            <h3>${state.theme === "dark" ? "Dark Mode" : "Light Mode"}</h3>
          </div>
          <button class="button primary compact" type="button" data-action="toggle-theme">
            ${icon(state.theme === "dark" ? "sun" : "moon", 18)}Switch Theme
          </button>
        </div>
        <div class="preview-stack">
          <span></span><span></span><span></span>
        </div>
      </article>
      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Sidebar</p>
            <h3>Navigation density</h3>
          </div>
          <button class="button ghost compact" type="button" data-action="toggle-sidebar">${icon("menu", 18)}Toggle</button>
        </div>
        <p class="muted">Desktop navigation can expand for labels or collapse into icon-only mode. Mobile uses a cancelable overlay drawer.</p>
      </article>
    </div>
  </section>`;
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal.type === "resource-upload") return renderResourceUploadModal();
  if (state.modal.type === "project-detail") return renderProjectDetailModal();
  if (state.modal.type === "resource-detail") return renderResourceDetailModal();
  if (state.modal.type === "java-upload") return renderJavaUploadModal();
  if (state.modal.type === "java-detail") return renderJavaDetailModal();
  return "";
}

function modalFrame(title, body, size = "") {
  return `<div class="modal-layer" role="presentation">
    <button class="modal-backdrop" type="button" data-action="close-modal" aria-label="Close dialog"></button>
    <section class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="Close dialog">${icon("x", 18)}</button>
      </div>
      ${body}
    </section>
  </div>`;
}

function findResource(route, id) {
  return (state.data[route] || []).find((item) => item.id === id);
}

function findJava(id) {
  return (state.data.java || []).find((item) => item.id === id);
}

function renderResourceUploadModal() {
  const page = resourcePages[state.modal.route];
  const existing = state.modal.id ? findResource(page.route, state.modal.id) : null;
  const title = existing ? `Edit ${page.shortTitle}` : page.uploadTitle;
  const isProject = page.requiresProjectAssets;
  const body = `<form class="modal-form" data-form="resource-upload" data-route="${page.route}" data-id="${existing?.id || ""}">
    ${dropzone("mainFile", isProject ? "Project File (.swb or .zip)" : "File", page.accept, !existing, true)}
    ${
      isProject
        ? `${dropzone("iconFile", "Icon File", "image/*", !existing)}
          <div class="two-column">${dropzone("previewOne", "Preview Image 1", "image/*", !existing)}${dropzone(
            "previewTwo",
            "Preview Image 2",
            "image/*",
            !existing
          )}</div>`
        : ""
    }
    <label class="field">
      <span class="field-label">File Name</span>
      <input type="text" name="fileName" required maxlength="120" value="${escapeHtml(existing?.file_name || "")}" placeholder="Auto-filled from selected file" />
    </label>
    <label class="field">
      <span class="field-label">Description</span>
      <textarea name="description" rows="3" placeholder="${escapeHtml(CONFIG.defaultDescription)}">${escapeHtml(existing?.description || "")}</textarea>
    </label>
    <div class="two-column">${categoryDropdown("category", existing?.category || CONFIG.categories[0])}${sortingDropdown(
      existing?.sort_key || "newest"
    )}</div>
    <div class="modal-actions">
      <button class="button ghost" type="button" data-action="close-modal">Cancel</button>
      <button class="button primary" type="submit">${icon("upload", 18)}${existing ? "Save Changes" : "Upload"}</button>
    </div>
  </form>`;
  return modalFrame(title, body, "large");
}

function dropzone(name, label, accept, required, autofill = false) {
  return `<label class="dropzone" data-dropzone="${name}">
    <input type="file" name="${name}" accept="${accept}" ${required ? "required" : ""} ${
      autofill ? 'data-autofill-name="true"' : ""
    } />
    <span>${icon("upload", 22)}</span>
    <strong>${escapeHtml(label)}</strong>
    <small>Tap to choose or drag and drop</small>
    <em data-file-summary="${name}">No file selected</em>
  </label>`;
}

function renderProjectDetailModal() {
  const item = findResource("projects", state.modal.id);
  if (!item) return "";
  const manage = canManage(state.user, state.profile, item);
  const body = `<div class="detail-layout">
    <div class="detail-hero">
      <span class="file-thumb large">${item.icon_url ? `<img src="${item.icon_url}" alt="" />` : icon("folder", 36)}</span>
      <div>
        <p class="eyebrow">${escapeHtml(item.category || "Uncategorized")}</p>
        <h3>${escapeHtml(item.file_name)}</h3>
        <p>${escapeHtml(item.description || CONFIG.defaultDescription)}</p>
      </div>
      ${favoriteButton("resource", item)}
    </div>
    <div class="preview-grid">
      ${previewImage(item.preview_one_url, "Preview image one")}
      ${previewImage(item.preview_two_url, "Preview image two")}
    </div>
    <div class="detail-meta">
      <span>${icon("clock", 17)} Uploaded ${formatDate(item.created_at)}</span>
      <span>${icon("download", 17)} ${Number(item.download_count || 0).toLocaleString()} downloads</span>
    </div>
    <div class="modal-actions split">
      ${downloadButton(item)}
      <span></span>
      ${
        manage
          ? `<button class="button secondary" type="button" data-action="edit-resource" data-route="projects" data-id="${item.id}">${icon(
              "edit",
              18
            )}Edit</button>
            <button class="button danger" type="button" data-action="delete-resource" data-route="projects" data-id="${item.id}">${icon(
              "trash",
              18
            )}Delete</button>`
          : ""
      }
    </div>
  </div>`;
  return modalFrame("Project Details", body, "large");
}

function previewImage(url, alt) {
  return `<figure class="preview-frame">${
    url ? `<img src="${url}" alt="${alt}" />` : `<span>${icon("image", 28)}No preview</span>`
  }</figure>`;
}

function renderResourceDetailModal() {
  const page = resourcePages[state.modal.route];
  const item = page ? findResource(page.route, state.modal.id) : null;
  if (!item) return "";
  const manage = canManage(state.user, state.profile, item);
  const body = `<div class="detail-layout resource-detail-layout">
    <div class="detail-hero">
      <span class="file-thumb large">${item.icon_url ? `<img src="${item.icon_url}" alt="" />` : icon(page.icon, 36)}</span>
      <div>
        <p class="eyebrow">${escapeHtml(item.category || "Uncategorized")}</p>
        <h3>${escapeHtml(item.file_name)}</h3>
        <p>${escapeHtml(item.description || CONFIG.defaultDescription)}</p>
      </div>
      ${favoriteButton("resource", item)}
    </div>
    <figure class="icon-detail-preview">
      ${item.icon_url ? `<img src="${item.icon_url}" alt="${escapeHtml(item.file_name)} preview" />` : `<span>${icon(page.icon, 54)}No preview available</span>`}
    </figure>
    <div class="detail-meta">
      <span>${icon("clock", 17)} Uploaded ${formatDate(item.created_at)}</span>
      <span>${icon("file", 17)} ${fileSize(item.file_size) || "Unknown size"}</span>
      <span>${icon("download", 17)} ${Number(item.download_count || 0).toLocaleString()} downloads</span>
    </div>
    <div class="modal-actions split">
      ${downloadButton(item)}
      <span></span>
      ${
        manage
          ? `<button class="button secondary" type="button" data-action="edit-resource" data-route="${page.route}" data-id="${item.id}">${icon(
              "edit",
              18
            )}Edit</button>
            <button class="button danger" type="button" data-action="delete-resource" data-route="${page.route}" data-id="${item.id}">${icon(
              "trash",
              18
            )}Delete</button>`
          : ""
      }
    </div>
  </div>`;
  return modalFrame(`${page.shortTitle} Details`, body, "large");
}

function renderJavaUploadModal() {
  const existing = state.modal.id ? findJava(state.modal.id) : null;
  const body = `<form class="modal-form" data-form="java-upload" data-id="${existing?.id || ""}">
    <label class="field">
      <span class="field-label">Code Name</span>
      <input type="text" name="codeName" required maxlength="120" value="${escapeHtml(existing?.code_name || "")}" placeholder="RecyclerView adapter helper" />
    </label>
    <label class="field">
      <span class="field-label">Java Source Code Editor</span>
      <textarea class="code-editor" name="sourceCode" required rows="13" spellcheck="false" placeholder="public class MainActivity { ... }">${escapeHtml(
        existing?.source_code || ""
      )}</textarea>
    </label>
    <div class="two-column">${categoryDropdown("category", existing?.category || CONFIG.categories[0])}${sortingDropdown(
      existing?.sort_key || "newest"
    )}</div>
    <div class="modal-actions">
      <button class="button ghost" type="button" data-action="close-modal">Cancel</button>
      <button class="button primary" type="submit">${icon("upload", 18)}${existing ? "Save Changes" : "Upload"}</button>
    </div>
  </form>`;
  return modalFrame(existing ? "Edit Java Source Code" : "Upload Java Source Code", body, "large");
}

function renderJavaDetailModal() {
  const item = findJava(state.modal.id);
  if (!item) return "";
  const manage = canManage(state.user, state.profile, item);
  const body = `<div class="java-detail">
    <div class="detail-hero">
      <span class="file-thumb large">${icon("code", 34)}</span>
      <div>
        <p class="eyebrow">${escapeHtml(item.category || "Uncategorized")}</p>
        <h3>${escapeHtml(item.code_name)}</h3>
        <p>Uploaded ${formatDate(item.created_at)}</p>
      </div>
      ${favoriteButton("java", item)}
    </div>
    <pre class="code-block"><code>${highlightJava(item.source_code)}</code></pre>
    <div class="modal-actions split">
      <button class="button primary" type="button" data-action="copy-java" data-id="${item.id}">${icon("copy", 18)}Copy</button>
      <span></span>
      ${
        manage
          ? `<button class="button secondary" type="button" data-action="edit-java" data-id="${item.id}">${icon(
              "edit",
              18
            )}Edit</button>
            <button class="button danger" type="button" data-action="delete-java" data-id="${item.id}">${icon(
              "trash",
              18
            )}Delete</button>`
          : ""
      }
    </div>
  </div>`;
  return modalFrame("Java Source Details", body, "large");
}

async function handleClick(event) {
  const closeToast = event.target.closest("[data-toast-close]");
  if (closeToast) {
    dismissToast(closeToast.dataset.toastClose);
    return;
  }

  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) {
    if (!event.target.closest("[data-dropdown]")) closeDropdowns();
    return;
  }

  const action = actionEl.dataset.action;
  if (action !== "dropdown-toggle" && !action.includes("dropdown-option")) closeDropdowns();

  switch (action) {
    case "navigate":
      navigate(actionEl.dataset.route);
      break;
    case "auth-mode":
      state.authMode = actionEl.dataset.mode;
      render();
      break;
    case "toggle-password":
      togglePassword(actionEl);
      break;
    case "oauth":
      await runAction(actionEl, () => signInWithProvider(actionEl.dataset.provider), "Redirecting...");
      break;
    case "toggle-theme":
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("theme", state.theme);
      render();
      break;
    case "toggle-sidebar":
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem("sidebar-collapsed", String(state.sidebarCollapsed));
      render();
      break;
    case "open-mobile-nav":
      state.mobileNavOpen = true;
      render();
      break;
    case "close-mobile-nav":
      state.mobileNavOpen = false;
      render();
      break;
    case "signout":
      await runAction(actionEl, signOut, "Signing out...");
      state.user = null;
      state.profile = null;
      state.session = null;
      navigate("landing");
      toast("Signed out successfully.", "success");
      break;
    case "dropdown-toggle":
      toggleDropdown(actionEl);
      break;
    case "dropdown-option":
      selectDropdownOption(actionEl);
      break;
    case "filter-dropdown-option":
      selectFilterOption(actionEl);
      break;
    case "toggle-favorites-filter":
      state.filters[actionEl.dataset.route].favoritesOnly = !state.filters[actionEl.dataset.route].favoritesOnly;
      render();
      break;
    case "view-mode":
      state.viewMode[actionEl.dataset.route || "projects"] = actionEl.dataset.mode;
      render();
      break;
    case "open-upload":
      state.modal = { type: "resource-upload", route: actionEl.dataset.route };
      render();
      break;
    case "open-java-upload":
      state.modal = { type: "java-upload" };
      render();
      break;
    case "close-modal":
      state.modal = null;
      render();
      break;
    case "open-project":
      state.modal = { type: "project-detail", id: actionEl.dataset.id };
      render();
      break;
    case "open-resource-detail":
      state.modal = { type: "resource-detail", route: actionEl.dataset.route, id: actionEl.dataset.id };
      render();
      break;
    case "open-java-detail":
      state.modal = { type: "java-detail", id: actionEl.dataset.id };
      render();
      break;
    case "toggle-favorite":
      await handleFavorite(actionEl);
      break;
    case "download-resource":
      await handleDownload(actionEl.dataset.id);
      break;
    case "edit-resource":
      state.modal = { type: "resource-upload", route: actionEl.dataset.route, id: actionEl.dataset.id };
      render();
      break;
    case "delete-resource":
      await handleDeleteResource(actionEl.dataset.route, actionEl.dataset.id);
      break;
    case "edit-java":
      state.modal = { type: "java-upload", id: actionEl.dataset.id };
      render();
      break;
    case "delete-java":
      await handleDeleteJava(actionEl.dataset.id);
      break;
    case "copy-java":
      await handleCopyJava(actionEl.dataset.id);
      break;
    default:
      break;
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');

  switch (form.dataset.form) {
    case "signin":
      await runAction(submit, async () => {
        const data = new FormData(form);
        await signInWithEmail(data.get("email"), data.get("password"));
        const context = await getCurrentContext();
        state.session = context.session;
        state.user = context.user;
        state.profile = context.profile;
        toast("Signed in successfully.", "success");
        navigate("dashboard");
      });
      break;
    case "signup":
      await runAction(submit, async () => {
        const data = new FormData(form);
        if (data.get("password") !== data.get("confirmPassword")) throw new Error("Passwords do not match.");
        await signUpWithEmail(data.get("username"), data.get("email"), data.get("password"));
        const context = await getCurrentContext();
        state.session = context.session;
        state.user = context.user;
        state.profile = context.profile;
        toast("Account created. Welcome in.", "success");
        navigate("dashboard");
      });
      break;
    case "forgot":
      await runAction(submit, async () => {
        const data = new FormData(form);
        await sendPasswordReset(data.get("email"));
        toast("Password reset email sent.", "success");
      });
      break;
    case "password-update":
      await runAction(submit, async () => {
        const data = new FormData(form);
        if (!data.get("password")) throw new Error("Enter your new password first.");
        if (data.get("password") !== data.get("confirmPassword")) throw new Error("Passwords do not match.");
        await updatePassword(data.get("password"));
        toast("Password updated.", "success");
        state.authMode = "signin";
        render();
      });
      break;
    case "resource-upload":
      await handleResourceUpload(form, submit);
      break;
    case "java-upload":
      await handleJavaUpload(form, submit);
      break;
    default:
      break;
  }
}

function handleInput(event) {
  const searchRoute = event.target.dataset.searchRoute;
  if (!searchRoute) return;
  const value = event.target.value;
  state.filters[searchRoute].search = value;
  render();
  requestAnimationFrame(() => {
    const input = document.querySelector(`[data-search-route="${searchRoute}"]`);
    if (!input) return;
    input.focus();
    input.setSelectionRange(value.length, value.length);
  });
}

function handleChange(event) {
  const input = event.target;
  if (input.matches('input[type="file"]')) {
    updateFileSummary(input);
    if (input.dataset.autofillName) {
      const form = input.closest("form");
      const fileName = form?.elements.fileName;
      if (fileName && !fileName.value && input.files?.[0]) {
        fileName.value = input.files[0].name.replace(/\.[^.]+$/, "");
      }
    }
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    if (state.modal) {
      state.modal = null;
      render();
    } else if (state.mobileNavOpen) {
      state.mobileNavOpen = false;
      render();
    }
  }
  if ((event.key === "Enter" || event.key === " ") && event.target.matches(".resource-card[data-action], .clickable[data-action]")) {
    event.preventDefault();
    event.target.click();
  }
}

function handleDragOver(event) {
  const zone = event.target.closest("[data-dropzone]");
  if (!zone) return;
  event.preventDefault();
  zone.classList.add("dragging");
}

function handleDragLeave(event) {
  const zone = event.target.closest("[data-dropzone]");
  if (!zone) return;
  zone.classList.remove("dragging");
}

function handleDrop(event) {
  const zone = event.target.closest("[data-dropzone]");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("dragging");
  const input = zone.querySelector('input[type="file"]');
  if (!input || !event.dataTransfer?.files?.length) return;
  input.files = event.dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function bindTouchNavigation() {
  let startX = 0;
  let startY = 0;
  document.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    },
    { passive: true }
  );
  document.addEventListener(
    "touchend",
    (event) => {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      if (dy > 70) return;
      if (startX < 32 && dx > 80 && routeIsProtected()) {
        state.mobileNavOpen = true;
        render();
      }
      if (state.mobileNavOpen && dx < -80) {
        state.mobileNavOpen = false;
        render();
      }
    },
    { passive: true }
  );
}

function togglePassword(button) {
  const field = button.closest(".password-field");
  const input = field?.querySelector("input");
  if (!input) return;
  const showPassword = input.type === "password";
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  input.type = showPassword ? "text" : "password";
  button.setAttribute("aria-pressed", String(showPassword));
  button.setAttribute("aria-label", `${showPassword ? "Hide" : "Show"} ${field.querySelector(".field-label")?.textContent || "password"}`);
  button.innerHTML = icon(showPassword ? "eyeOff" : "eye", 18);
  input.focus({ preventScroll: true });
  if (selectionStart !== null && selectionEnd !== null) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

function toggleDropdown(button) {
  const field = button.closest("[data-dropdown]");
  const open = field.classList.contains("open");
  closeDropdowns();
  field.classList.toggle("open", !open);
  button.setAttribute("aria-expanded", String(!open));
}

function closeDropdowns() {
  document.querySelectorAll("[data-dropdown].open").forEach((field) => {
    field.classList.remove("open");
    field.querySelector(".dropdown-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function selectDropdownOption(button) {
  const field = button.closest("[data-dropdown]");
  const name = button.dataset.name;
  const value = button.dataset.value;
  field.querySelector(`input[name="${name}"]`).value = value;
  field.querySelector(`[data-dropdown-label="${name}"]`).textContent = button.textContent.trim();
  field.querySelectorAll(".dropdown-item").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  closeDropdowns();
}

function selectFilterOption(button) {
  const name = button.dataset.name;
  const value = button.dataset.value;
  state.filters[state.route][name] = value;
  closeDropdowns();
  render();
}

function updateFileSummary(input) {
  const summary = input.closest(".dropzone")?.querySelector(`[data-file-summary="${input.name}"]`);
  if (!summary) return;
  const file = input.files?.[0];
  summary.textContent = file ? `${file.name || "Selected file"} ${fileSize(file.size)}` : "No file selected";
}

function extensionOf(file) {
  return String(file?.name || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
}

function projectFileIsSupported(file) {
  const extension = extensionOf(file);
  const type = String(file?.type || "").toLowerCase();
  return extension === "swb" || extension === "zip" || type.includes("zip") || (!extension && !type);
}

async function runAction(button, task, pendingText = "") {
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (pendingText) button.innerHTML = `${icon("cloud", 17)}${escapeHtml(pendingText)}`;
  }
  try {
    await task();
  } catch (error) {
    toast(readableError(error), "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = original;
    }
  }
}

async function handleResourceUpload(form, submit) {
  await runAction(submit, async () => {
    const route = form.dataset.route;
    const page = resourcePages[route];
    const existing = form.dataset.id ? findResource(route, form.dataset.id) : null;
    const data = new FormData(form);
    const mainFile = form.elements.mainFile.files[0];
    const iconFile = form.elements.iconFile?.files?.[0];
    const previewOne = form.elements.previewOne?.files?.[0];
    const previewTwo = form.elements.previewTwo?.files?.[0];

    if (!existing && !mainFile) throw new Error("Choose the main file before uploading.");
    if (page.requiresProjectAssets) {
      if (mainFile && !projectFileIsSupported(mainFile)) throw new Error("Project file must be .swb or .zip.");
      if (!existing && (!iconFile || !previewOne || !previewTwo)) {
        throw new Error("Project uploads require an icon and two preview images.");
      }
    }

    await saveResource(
      page.type,
      {
        fileName: data.get("fileName"),
        description: data.get("description"),
        category: data.get("category"),
        sortKey: data.get("sortKey")
      },
      { mainFile, iconFile, previewOne, previewTwo },
      existing
    );
    state.modal = null;
    toast(existing ? "Resource updated." : "Resource uploaded.", "success");
    await reloadAfterMutation(route);
  }, "Uploading...");
}

async function handleJavaUpload(form, submit) {
  await runAction(submit, async () => {
    const existing = form.dataset.id ? findJava(form.dataset.id) : null;
    const data = new FormData(form);
    await saveJavaCode(
      {
        codeName: data.get("codeName"),
        sourceCode: data.get("sourceCode"),
        category: data.get("category"),
        sortKey: data.get("sortKey")
      },
      existing
    );
    state.modal = null;
    toast(existing ? "Java source updated." : "Java source uploaded.", "success");
    await reloadAfterMutation("java");
  });
}

async function handleFavorite(button) {
  await runAction(button, async () => {
    const next = await toggleFavorite(button.dataset.kind, button.dataset.id, button.getAttribute("aria-pressed") === "true");
    updateFavoriteInState(button.dataset.kind, button.dataset.id, next);
    toast(next ? "Added to favorites." : "Removed from favorites.", "success");
    render();
  });
}

function updateFavoriteInState(kind, id, value) {
  const keys = kind === "java" ? ["java"] : ["projects", "blocks", "libraries", "icons"];
  keys.forEach((key) => {
    state.data[key] = state.data[key]?.map((item) => (item.id === id ? { ...item, is_favorite: value } : item)) || state.data[key];
  });
}

function findResourceById(id) {
  for (const route of Object.keys(resourcePages)) {
    const item = findResource(route, id);
    if (item) return { item, route };
  }
  return { item: null, route: "" };
}

async function handleDownload(id) {
  const { item, route } = findResourceById(id);
  if (!item) return;

  state.downloads[id] = { status: "downloading", percent: 0 };
  render();
  try {
    const blob = await downloadResourceFile(item, (percent) => {
      state.downloads[id] = { status: "downloading", percent };
      updateDownloadDom(id, percent, `${percent}%`);
    });
    downloadBlob(blob, item.file_name);
    state.downloads[id] = { status: "done", percent: 100 };
    toast("Download completed.", "success");
    await refreshRoute(route);
  } catch (error) {
    state.downloads[id] = { status: "error", percent: 0 };
    toast(`${readableError(error)} Tap Retry to try again.`, "error");
  } finally {
    render();
  }
}

function updateDownloadDom(id, percent, label) {
  document.querySelectorAll(`[data-download-id="${id}"]`).forEach((button) => {
    button.querySelector(".download-progress")?.style.setProperty("width", `${percent}%`);
    const span = button.querySelector("span:not(.download-progress)");
    if (span) span.textContent = label;
  });
}

async function handleDeleteResource(route, id) {
  const item = findResource(route, id);
  if (!item) return;
  if (!confirm(`Delete "${item.file_name}"? This removes the database record and uploaded files.`)) return;
  await runAction(null, async () => {
    await deleteResource(item);
    state.modal = null;
    toast("Resource deleted.", "success");
    await reloadAfterMutation(route);
  });
}

async function handleDeleteJava(id) {
  const item = findJava(id);
  if (!item) return;
  if (!confirm(`Delete "${item.code_name}"?`)) return;
  await runAction(null, async () => {
    await deleteJavaCode(item);
    state.modal = null;
    toast("Java source deleted.", "success");
    await reloadAfterMutation("java");
  });
}

async function handleCopyJava(id) {
  const item = findJava(id);
  if (!item) return;
  try {
    await navigator.clipboard.writeText(item.source_code);
    toast("Java code copied.", "success");
  } catch {
    toast("Clipboard permission was blocked.", "error");
  }
}

boot();
