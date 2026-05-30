import { CONFIG, isSupabaseConfigured } from "./config.js";
import { getLocale, languageSwitcherHtml, setLocale, t } from "./i18n.js";
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
  skeletonListRows,
  sortingDropdown,
  statSparkline,
  toast,
  uploadStatusMarkup
} from "./ui.js";

const app = document.getElementById("app");
const protectedRoutes = new Set(["dashboard", "projects", "java", "blocks", "libraries", "icons", "appearance"]);
const navItems = [
  { route: "dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
  { route: "projects", labelKey: "nav.projects", icon: "folder" },
  { route: "java", labelKey: "nav.java", icon: "code" },
  { route: "blocks", labelKey: "nav.blocks", icon: "blocks" },
  { route: "libraries", labelKey: "nav.libraries", icon: "library" },
  { route: "icons", labelKey: "nav.icons", icon: "image" },
  { route: "appearance", labelKey: "nav.appearance", icon: "palette" }
];

function navLabel(item) {
  return t(item.labelKey);
}

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
  theme: localStorage.getItem("theme") || "system",
  locale: getLocale(),
  upload: { active: false, message: "", percent: 0, error: "", retry: null },
  uploadAbort: null,
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
  const hash = window.location.hash;
  if (hash.includes("access_token") || hash.includes("error=") || hash.includes("type=recovery")) {
    return "auth";
  }
  const raw = hash.replace(/^#\/?/, "");
  if (!raw) return "landing";
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

function resolvedTheme() {
  if (state.theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return state.theme === "dark" ? "dark" : "light";
}

function applyTheme() {
  const active = resolvedTheme();
  document.documentElement.dataset.theme = active;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    active === "dark" ? "#111827" : "#f7f8fb"
  );
}

function themeToggleHtml(compact = false) {
  const modes = [
    { id: "light", label: t("theme.light"), icon: "sun" },
    { id: "dark", label: t("theme.dark"), icon: "moon" },
    { id: "system", label: t("theme.system"), icon: "palette" }
  ];
  return `<div class="theme-switch${compact ? " theme-switch--compact" : ""}" role="group" aria-label="${t("theme.aria")}">
    ${modes
      .map(
        (mode) => `<button type="button" class="theme-switch-btn${state.theme === mode.id ? " active" : ""}" data-action="set-theme" data-theme="${mode.id}" title="${mode.label}">
          ${icon(mode.icon, 16)}<span class="theme-switch-label">${mode.label}</span>
        </button>`
      )
      .join("")}
  </div>`;
}

function setTheme(mode) {
  state.theme = mode;
  localStorage.setItem("theme", mode);
  applyTheme();
  render();
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

  if (!state.authLoading && state.route === "auth" && isSignedIn() && state.authMode !== "recovery") {
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
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") applyTheme();
  });
  const hash = window.location.hash;
  if (
    hash.includes("type=recovery") ||
    hash.includes("access_token") ||
    window.location.search.includes("type=recovery")
  ) {
    state.route = "auth";
    state.authMode = hash.includes("type=recovery") || window.location.search.includes("type=recovery") ? "recovery" : state.authMode;
    if (hash.includes("access_token")) state.authMode = "recovery";
  }
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

async function loadRouteData(force = false, options = {}) {
  if (!configured() || !isSignedIn() || state.route === "auth" || state.route === "landing" || state.route === "appearance") {
    return;
  }

  const route = options.route || state.route;
  if (!force && state.data[route]) return;

  const silent = Boolean(options.silent);
  const showSkeleton = !silent && state.data[route] === null;
  if (showSkeleton) {
    state.dataLoading = true;
    render();
  }
  const authOpts = { session: state.session, user: state.user };
  try {
    if (route === "dashboard") {
      state.data.dashboard = await loadDashboardData(authOpts);
    } else if (route === "java") {
      state.data.java = await listJavaCodes(authOpts);
    } else if (resourcePages[route]) {
      state.data[route] = await listResources(resourcePages[route].type, authOpts);
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
  state.data.dashboard = null;
  const route = primaryRoute || state.route;
  await loadRouteData(true, { silent: true, route });
}

function renderLanding() {
  const startTarget = isSignedIn() ? "dashboard" : "auth";
  return `<main class="landing">
    <header class="landing-nav">
      <a class="brand" href="#/" aria-label="${CONFIG.appName} ပင်မစာမျက်နှာ">
        <span class="brand-mark">S</span>
        <span>${CONFIG.appName}</span>
      </a>
      <nav class="landing-actions" aria-label="Landing actions">
        ${themeToggleHtml(true)}
        ${languageSwitcherHtml(true)}
        <a class="button ghost" href="${CONFIG.docsUrl}">${icon("book", 18)}${t("common.documentation")}</a>
        <a class="button ghost" href="${CONFIG.toolsUrl}">${icon("tools", 18)}${t("common.tools")}</a>
        <button class="button primary" type="button" data-action="navigate" data-route="${startTarget}">
          ${icon("chevronRight", 18)}${t("common.getStarted")}
        </button>
      </nav>
    </header>

    <section class="hero-section">
      <div class="hero-bg" aria-hidden="true"></div>
      <div class="hero-copy">
        <p class="eyebrow">${t("landing.eyebrow")}</p>
        <h1>${CONFIG.appName}</h1>
        <p>${t("landing.hero")}</p>
        <div class="hero-actions">
          <button class="button primary large" type="button" data-action="navigate" data-route="${startTarget}">
            ${icon("chevronRight", 20)}${t("common.getStarted")}
          </button>
          <a class="button secondary large" href="${CONFIG.docsUrl}">${icon("book", 20)}${t("common.documentation")}</a>
        </div>
      </div>
      <div class="hero-media" aria-label="${CONFIG.appName} dashboard အစမ်းကြည့်ရှု">
        <img src="assets/hero-dashboard.png" alt="${CONFIG.appName} dashboard အစမ်းကြည့်ရှု" />
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
          <p>Add your Supabase URL and anon key in <code>src/config.js</code>, then run <code>supabase/schema.sql</code>.</p>
        </div>
      </section>`
    : "";

  const mode = state.authMode;
  const titles = {
    signup: t("auth.createAccount"),
    forgot: t("auth.resetAccess"),
    recovery: t("auth.setNewPassword"),
    signin: t("auth.welcome")
  };
  return `<main class="auth-page">
    <div class="auth-topbar">
      <a class="brand" href="#/">
        <span class="brand-mark">S</span>
        <span>${CONFIG.appName}</span>
      </a>
      <div class="auth-topbar-controls">
        ${languageSwitcherHtml(true)}
        ${themeToggleHtml(true)}
      </div>
    </div>
    <section class="auth-card">
      <div class="auth-copy">
        <p class="eyebrow">${t("auth.secureWorkspace")}</p>
        <h1>${titles[mode] || titles.signin}</h1>
        <p>${t("auth.subtitle")}</p>
      </div>
      ${configuredNotice}
      <div class="auth-tabs" role="tablist" aria-label="Authentication">
        ${authTab("signin", t("auth.signIn"))}
        ${authTab("signup", t("auth.signUp"))}
        ${authTab("forgot", t("auth.forgot"))}
      </div>
      ${
        mode === "recovery"
          ? renderRecoveryForm()
          : mode === "signup"
            ? renderSignUpForm()
            : mode === "forgot"
              ? renderForgotForm()
              : renderSignInForm()
      }
    </section>
  </main>`;
}

function authTab(mode, label) {
  return `<button type="button" class="auth-tab${state.authMode === mode ? " active" : ""}" data-action="auth-mode" data-mode="${mode}" role="tab" aria-selected="${
    state.authMode === mode
  }">${label}</button>`;
}

function passwordField(name, label, placeholder, autocomplete, required = true) {
  return `<label class="field has-password-toggle">
    <span class="field-label">${label}</span>
    <span class="input-icon">${icon("lock", 18)}</span>
    <input type="password" name="${name}" autocomplete="${autocomplete}" ${required ? "required" : ""} minlength="6" placeholder="${escapeHtml(
      placeholder
    )}" />
    <button class="password-toggle" type="button" data-action="toggle-password" aria-label="${t("auth.showPassword")}">${icon(
      "eye",
      18
    )}</button>
  </label>`;
}

function renderSignInForm() {
  return `<form class="auth-form" data-form="signin">
    <label class="field">
      <span class="field-label">${t("auth.email")}</span>
      <span class="input-icon">${icon("mail", 18)}</span>
      <input type="email" name="email" autocomplete="email" required placeholder="you@example.com" />
    </label>
    ${passwordField("password", t("auth.password"), "Your password", "current-password")}
    <button class="button primary full" type="submit">${icon("chevronRight", 18)}${t("auth.signIn")}</button>
    ${oauthButtons()}
    <p class="auth-hint"><button type="button" class="link-button" data-action="auth-mode" data-mode="forgot">${t("auth.forgotLink")}</button></p>
  </form>`;
}

function renderSignUpForm() {
  return `<form class="auth-form" data-form="signup">
    <label class="field">
      <span class="field-label">${t("auth.username")}</span>
      <span class="input-icon">${icon("user", 18)}</span>
      <input type="text" name="username" autocomplete="nickname" required minlength="2" maxlength="32" placeholder="ပြသမည့် အမည်" />
    </label>
    <label class="field">
      <span class="field-label">${t("auth.email")}</span>
      <span class="input-icon">${icon("mail", 18)}</span>
      <input type="email" name="email" autocomplete="email" required placeholder="you@example.com" />
    </label>
    ${passwordField("password", t("auth.password"), "At least 6 characters", "new-password")}
    <button class="button primary full" type="submit">${icon("chevronRight", 18)}${t("auth.signUp")}</button>
    ${oauthButtons()}
  </form>`;
}

function renderForgotForm() {
  return `<div class="reset-flow">
    <ol class="reset-steps">
      <li class="active"><strong>1</strong> ${t("auth.reset.step1")}</li>
      <li><strong>2</strong> ${t("auth.reset.step2")}</li>
      <li><strong>3</strong> ${t("auth.reset.step3")}</li>
    </ol>
    <form class="auth-form" data-form="forgot">
      <label class="field">
        <span class="field-label">${t("auth.email")}</span>
        <span class="input-icon">${icon("mail", 18)}</span>
        <input type="email" name="email" autocomplete="email" required placeholder="you@example.com" />
      </label>
      <button class="button primary full" type="submit">${icon("mail", 18)}${t("auth.reset.send")}</button>
    </form>
    <p class="auth-hint"><button type="button" class="link-button" data-action="auth-mode" data-mode="recovery">${t("auth.reset.recoveryLink")}</button></p>
  </div>`;
}

function renderRecoveryForm() {
  return `<div class="reset-flow">
    <ol class="reset-steps">
      <li><strong>1</strong> ${t("auth.reset.step1")}</li>
      <li><strong>2</strong> ${t("auth.reset.step2")}</li>
      <li class="active"><strong>3</strong> ${t("auth.reset.step3")}</li>
    </ol>
    <form class="auth-form" data-form="password-update">
      ${passwordField("password", t("auth.password"), "At least 6 characters", "new-password")}
      <button class="button primary full" type="submit">${icon("check", 18)}${t("auth.reset.update")}</button>
    </form>
    <p class="auth-hint"><button type="button" class="link-button" data-action="auth-mode" data-mode="signin">${t("auth.reset.backSignIn")}</button></p>
  </div>`;
}

function oauthButtons() {
  return `<div class="oauth-grid single">
    <button class="button oauth" type="button" data-action="oauth" data-provider="github"><span class="oauth-mark">GH</span>${t("auth.github")}</button>
  </div>`;
}

function renderShell(content) {
  return `<div class="app-shell${state.sidebarCollapsed ? " is-collapsed" : ""}${state.mobileNavOpen ? " nav-open" : ""}">
    <button class="mobile-backdrop" type="button" data-action="close-mobile-nav" aria-label="Close navigation"></button>
    ${renderSidebar()}
    <section class="workspace">
      ${renderTopbar()}
      <main class="page-view">${content}</main>
    </section>
    ${renderModal()}
  </div>`;
}

function renderSidebar() {
  return `<aside class="sidebar" aria-label="Primary navigation">
    <div class="sidebar-head">
      <a class="brand" href="#/dashboard">
        <span class="brand-mark">S</span>
        <span class="brand-text">${CONFIG.appName}</span>
      </a>
      <button class="icon-button sidebar-close" type="button" data-action="close-mobile-nav" aria-label="Close sidebar">${icon("x", 18)}</button>
    </div>
    <nav class="sidebar-nav">
      ${navItems
        .map(
          (item) => `<button type="button" title="${navLabel(item)}" class="nav-item${
            state.route === item.route ? " active" : ""
          }" data-action="navigate" data-route="${item.route}">
            ${icon(item.icon, 20)}
            <span>${navLabel(item)}</span>
          </button>`
        )
        .join("")}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-theme">${themeToggleHtml()}</div>
      <button class="nav-item signout-nav" type="button" data-action="signout">
        ${icon("logout", 20)}
        <span>${t("common.signOut")}</span>
      </button>
      <div class="profile-chip">
        <span class="avatar">${initials(username())}</span>
        <span class="profile-copy">
          <strong>${escapeHtml(username())}</strong>
          <small>${state.profile?.role === "admin" ? t("common.admin") : t("common.member")}</small>
        </span>
      </div>
    </div>
  </aside>`;
}

function renderTopbar() {
  const current = navItems.find((item) => item.route === state.route);
  const title = current ? navLabel(current) : t("common.workspace");
  return `<header class="topbar">
    <div class="topbar-left">
      <button class="icon-button" type="button" data-action="open-mobile-nav" aria-label="Open navigation">${icon("menu", 20)}</button>
      <button class="icon-button collapse-toggle" type="button" data-action="toggle-sidebar" aria-label="Collapse sidebar">
        ${icon(state.sidebarCollapsed ? "chevronRight" : "chevronLeft", 19)}
      </button>
      <div class="topbar-titles">
        <p class="eyebrow">${CONFIG.appName}</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
    </div>
    <div class="topbar-actions">
      ${languageSwitcherHtml(true)}
      ${themeToggleHtml(true)}
      <div class="topbar-user">
        <span class="avatar">${initials(username())}</span>
        <span>${escapeHtml(username())}</span>
      </div>
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
    return `<section class="page-section">${renderPageHeader(t("auth.welcome"), t("dashboard.loading"), "dashboard")}${skeletonCards(
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
    ${renderPageHeader(`${t("dashboard.welcome")}, ${username()}`, t("dashboard.subtitle"), "dashboard")}
    <div class="stats-grid">
      ${statCard(t("dashboard.stat.projects"), projects, "folder", "primary", [3, 5, 4, projects || 2, 6, projects || 3], dashboard.resources.length || 8)}
      ${statCard(t("dashboard.stat.java"), javaCount, "code", "accent", [2, 4, javaCount || 1, 5, 3, javaCount || 2], Math.max(javaCount, 8))}
      ${statCard(t("dashboard.stat.files"), dashboard.resources.length, "cloud", "success", [4, 6, 5, 8, dashboard.resources.length || 4, 7], Math.max(dashboard.resources.length, 12))}
      ${statCard(t("dashboard.stat.categories"), categories.size, "filter", "warning", [1, 2, categories.size || 1, 3, 2, categories.size || 2], CONFIG.categories.length)}
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

function statCard(label, value, iconName, tone = "primary", spark = [], maxHint = 10) {
  const numeric = Number(value);
  const cap = Math.max(maxHint, numeric, 1);
  const percent = Math.min(100, Math.round((numeric / cap) * 100));
  return `<article class="stat-card stat-card-rich tone-${tone}">
    <div class="stat-card-top">
      <span class="stat-icon">${icon(iconName, 20)}</span>
      <strong>${numeric.toLocaleString()}</strong>
    </div>
    <div class="stat-card-body">
      <small>${escapeHtml(label)}</small>
      <span class="stat-meter"><span style="width:${percent}%"></span></span>
    </div>
    ${statSparkline(spark)}
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
  const isIcon = page.route === "icons";
  const gridMode = isProject ? state.viewMode.projects === "grid" : isIcon ? state.viewMode.icons === "grid" : false;

  return `<section class="page-section resource-page">
    ${renderSectionToolbar(page, filtered.length, items.length)}
    ${
      loading
        ? gridMode
          ? `<div class="resource-grid">${skeletonCards(6)}</div>`
          : `<div class="resource-list">${skeletonListRows(6)}</div>`
        : filtered.length
          ? isProject
            ? renderProjectCollection(filtered)
            : isIcon && gridMode
              ? renderIconGrid(filtered, page)
              : renderResourceList(filtered, page)
          : emptyState(
              t("resource.noMatch"),
              t("resource.noMatchHint"),
              `<button class="button primary" type="button" data-action="open-upload" data-route="${page.route}">${icon(
                "plus",
                18
              )}${t("common.addNew")}</button>`
            )
    }
    <button class="fab" type="button" data-action="open-upload" data-route="${page.route}" aria-label="${t("common.addNew")}">
      ${icon("plus", 24)}
    </button>
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
  const viewToggle =
    page.route === "projects" || page.route === "icons"
      ? `<div class="segmented" aria-label="မြင်ကွင်း မုဒ်">
        <button type="button" class="${(page.route === "projects" ? state.viewMode.projects : state.viewMode.icons) === "grid" ? "active" : ""}" data-action="view-mode" data-route="${page.route}" data-mode="grid" aria-label="Grid">${icon(
          "grid",
          18
        )}</button>
        <button type="button" class="${(page.route === "projects" ? state.viewMode.projects : state.viewMode.icons) === "list" ? "active" : ""}" data-action="view-mode" data-route="${page.route}" data-mode="list" aria-label="List">${icon(
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
      <button class="button primary compact hide-mobile-add" type="button" data-action="open-upload" data-route="${page.route}">
        ${icon("plus", 18)}${t("common.addNew")}
      </button>
    </div>
  </div>`;
}

function renderIconGrid(items, page) {
  return `<div class="resource-grid icon-grid">${items
    .map(
      (item) => `<article class="resource-card icon-card">
        <div class="resource-card-top">
          <span class="file-thumb">${item.icon_url ? `<img src="${item.icon_url}" alt="" />` : icon("image", 24)}</span>
          ${favoriteButton("resource", item)}
        </div>
        <h3>${escapeHtml(item.file_name)}</h3>
        <div class="meta-row">
          <span>${escapeHtml(item.category || "Uncategorized")}</span>
          <span>${fileSize(item.file_size)}</span>
        </div>
        <div class="row-actions card-actions">
          ${downloadButton(item)}
          ${
            canManage(state.user, state.profile, item)
              ? `<button class="icon-button" type="button" data-action="edit-resource" data-route="${page.route}" data-id="${item.id}">${icon(
                  "edit",
                  18
                )}</button>
                <button class="icon-button danger" type="button" data-action="delete-resource" data-route="${page.route}" data-id="${item.id}">${icon(
                  "trash",
                  18
                )}</button>`
              : ""
          }
        </div>
      </article>`
    )
    .join("")}</div>`;
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
  const label =
    progress?.status === "downloading"
      ? `${progress.percent || 0}%`
      : progress?.status === "error"
        ? t("common.retry")
        : t("common.download");
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
        ? `<div class="resource-list">${skeletonListRows(5)}</div>`
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
  const active = resolvedTheme();
  const themeLabel =
    state.theme === "system"
      ? `${t("theme.system")} (${active === "dark" ? t("theme.dark") : t("theme.light")})`
      : state.theme === "dark"
        ? t("theme.dark")
        : t("theme.light");
  return `<section class="page-section">
    ${renderPageHeader(t("appearance.title"), t("appearance.subtitle"), "palette")}
    <div class="appearance-grid">
      <article class="panel theme-preview">
        <div class="panel-head">
          <div>
            <p class="eyebrow">${t("theme.aria")}</p>
            <h3>${themeLabel}</h3>
          </div>
          ${themeToggleHtml()}
        </div>
        <div class="preview-stack">
          <span></span><span></span><span></span>
        </div>
      </article>
      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">${t("appearance.language")}</p>
            <h3>${getLocale() === "my" ? t("lang.my") : t("lang.en")}</h3>
          </div>
        </div>
        <p class="muted">${t("appearance.languageHint")}</p>
        ${languageSwitcherHtml()}
      </article>
      <article class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">${t("appearance.sidebar")}</p>
            <h3>${t("appearance.toggleSidebar")}</h3>
          </div>
          <button class="button ghost compact" type="button" data-action="toggle-sidebar">${icon("menu", 18)}${t("appearance.toggleSidebar")}</button>
        </div>
        <p class="muted">${t("appearance.sidebarHint")}</p>
      </article>
    </div>
  </section>`;
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal.type === "resource-upload") return renderResourceUploadModal();
  if (state.modal.type === "project-detail") return renderProjectDetailModal();
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
      <div class="modal-body">${body}</div>
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
  const isIcon = page.route === "icons";
  const accept = isIcon ? "image/*,.zip,*/*" : page.accept.includes("*") ? "*/*" : page.accept;
  const body = `<form class="modal-form modal-form--stacked" data-form="resource-upload" data-route="${page.route}" data-id="${existing?.id || ""}">
    <div class="modal-scroll">
      ${uploadStatusMarkup(state.upload)}
      ${dropzone("mainFile", isProject ? "Project file (.swb / .zip)" : "File", accept, !existing, true)}
      ${
        isProject
          ? `${dropzone("iconFile", "Icon file", "image/*", !existing)}
            <div class="two-column">${dropzone("previewOne", "Preview image 1", "image/*", !existing)}${dropzone(
              "previewTwo",
              "Preview image 2",
              "image/*",
              !existing
            )}</div>`
          : ""
      }
      <label class="field">
        <span class="field-label">${t("resource.fileName")}</span>
        <input type="text" name="fileName" required maxlength="120" value="${escapeHtml(existing?.file_name || "")}" placeholder="Auto-filled from file name" />
      </label>
      ${
        isIcon
          ? ""
          : `<label class="field">
        <span class="field-label">${t("resource.description")}</span>
        <textarea name="description" rows="3" placeholder="${escapeHtml(CONFIG.defaultDescription)}">${escapeHtml(existing?.description || "")}</textarea>
      </label>`
      }
      <div class="two-column">${categoryDropdown("category", existing?.category || CONFIG.categories[0])}${sortingDropdown(
        existing?.sort_key || "newest"
      )}</div>
    </div>
    <div class="modal-actions">
      <button class="button ghost" type="button" data-action="close-modal" ${state.upload.active ? "disabled" : ""}>${t("common.cancel")}</button>
      <button class="button primary" type="submit" ${state.upload.active ? "disabled" : ""}>${icon("upload", 18)}${existing ? t("common.save") : t("common.upload")}</button>
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
  const body = `<div class="modal-detail--stacked">
    <div class="modal-scroll detail-layout">
      <div class="detail-hero">
        <span class="file-thumb large">${item.icon_url ? `<img src="${item.icon_url}" alt="" />` : icon("folder", 36)}</span>
        <div class="detail-hero-copy">
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
    </div>
    <div class="modal-actions split">
      ${downloadButton(item)}
      <span></span>
      ${
        manage
          ? `<button class="button secondary" type="button" data-action="edit-resource" data-route="projects" data-id="${item.id}">${icon(
              "edit",
              18
            )}${t("common.edit")}</button>
            <button class="button danger" type="button" data-action="delete-resource" data-route="projects" data-id="${item.id}">${icon(
              "trash",
              18
            )}${t("common.delete")}</button>`
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

function renderJavaUploadModal() {
  const existing = state.modal.id ? findJava(state.modal.id) : null;
  const body = `<form class="modal-form modal-form--stacked" data-form="java-upload" data-id="${existing?.id || ""}">
    <div class="modal-scroll">
      <label class="field">
        <span class="field-label">${t("java.codeName")}</span>
        <input type="text" name="codeName" required maxlength="120" value="${escapeHtml(existing?.code_name || "")}" placeholder="RecyclerView adapter helper" />
      </label>
      <label class="field">
        <span class="field-label">${t("java.description")}</span>
        <textarea name="description" rows="2" placeholder="${escapeHtml(t("java.descriptionPlaceholder"))}">${escapeHtml(existing?.description || "")}</textarea>
      </label>
      <label class="field">
        <span class="field-label">${t("java.source")}</span>
        <textarea class="code-editor" name="sourceCode" required rows="10" spellcheck="false" placeholder="public class MainActivity { ... }">${escapeHtml(
          existing?.source_code || ""
        )}</textarea>
      </label>
      <div class="two-column">${categoryDropdown("category", existing?.category || CONFIG.categories[0])}${sortingDropdown(
        existing?.sort_key || "newest"
      )}</div>
    </div>
    <div class="modal-actions">
      <button class="button ghost" type="button" data-action="close-modal">${t("common.cancel")}</button>
      <button class="button primary" type="submit">${icon("upload", 18)}${existing ? t("common.save") : t("common.upload")}</button>
    </div>
  </form>`;
  return modalFrame(existing ? t("java.editTitle") : t("java.uploadTitle"), body, "large");
}

function renderJavaDetailModal() {
  const item = findJava(state.modal.id);
  if (!item) return "";
  const manage = canManage(state.user, state.profile, item);
  const body = `<div class="java-detail modal-detail--stacked">
    <div class="modal-scroll">
      <div class="detail-hero">
        <span class="file-thumb large">${icon("code", 34)}</span>
        <div class="detail-hero-copy">
          <p class="eyebrow">${escapeHtml(item.category || "Uncategorized")}</p>
          <h3>${escapeHtml(item.code_name)}</h3>
          ${item.description ? `<p class="java-description">${escapeHtml(item.description)}</p>` : ""}
          <p class="muted">${t("java.uploaded")} ${formatDate(item.created_at)}</p>
        </div>
        ${favoriteButton("java", item)}
      </div>
      <pre class="code-block language-java"><code class="language-java">${highlightJava(item.source_code)}</code></pre>
    </div>
    <div class="modal-actions split">
      <button class="button primary" type="button" data-action="copy-java" data-id="${item.id}">${icon("copy", 18)}${t("common.copy")}</button>
      <span></span>
      ${
        manage
          ? `<button class="button secondary" type="button" data-action="edit-java" data-id="${item.id}">${icon(
              "edit",
              18
            )}${t("common.edit")}</button>
            <button class="button danger" type="button" data-action="delete-java" data-id="${item.id}">${icon(
              "trash",
              18
            )}${t("common.delete")}</button>`
          : ""
      }
    </div>
  </div>`;
  return modalFrame(t("java.detailTitle"), body, "xlarge");
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
    case "oauth":
      await runAction(actionEl, () => signInWithProvider(actionEl.dataset.provider), "Redirecting...");
      break;
    case "set-theme":
      setTheme(actionEl.dataset.theme);
      break;
    case "set-locale":
      state.locale = actionEl.dataset.locale;
      setLocale(actionEl.dataset.locale);
      render();
      break;
    case "toggle-password": {
      const field = actionEl.closest(".field");
      const input = field?.querySelector('input[type="password"], input[type="text"]');
      if (!input) break;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      actionEl.innerHTML = icon(show ? "eye-off" : "eye", 18);
      actionEl.setAttribute("aria-label", show ? t("auth.hidePassword") : t("auth.showPassword"));
      break;
    }
    case "cancel-upload":
      cancelActiveUpload();
      break;
    case "retry-upload":
      if (typeof state.upload.retry === "function") state.upload.retry();
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
      state.mobileNavOpen = false;
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
      if (actionEl.dataset.route === "icons") state.viewMode.icons = actionEl.dataset.mode;
      else state.viewMode.projects = actionEl.dataset.mode;
      render();
      break;
    case "open-upload":
      resetUploadState();
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
        const result = await signInWithEmail(data.get("email"), data.get("password"));
        state.session = result.session;
        state.user = result.user;
        state.profile = result.profile;
        toast("Signed in successfully.", "success");
        navigate("dashboard");
      });
      break;
    case "signup":
      await runAction(submit, async () => {
        const data = new FormData(form);
        const result = await signUpWithEmail(data.get("username"), data.get("email"), data.get("password"));
        if (result.needsEmailConfirmation) {
          toast("Account created. Check your email to confirm, then sign in.", "success");
          state.authMode = "signin";
          render();
          return;
        }
        state.session = result.session;
        state.user = result.user;
        state.profile = result.profile;
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
  summary.textContent = input.files?.[0] ? `${input.files[0].name} ${fileSize(input.files[0].size)}` : "No file selected";
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

function resetUploadState() {
  state.upload = { active: false, message: "", percent: 0, error: "", retry: null };
  state.uploadAbort = null;
}

function cancelActiveUpload() {
  if (state.uploadAbort) state.uploadAbort.abort();
  resetUploadState();
  render();
  toast(t("upload.cancelled"), "info");
}

let uploadRenderTimer;
function setUploadProgress(patch) {
  state.upload = { ...state.upload, active: !patch.error, ...patch };
  clearTimeout(uploadRenderTimer);
  uploadRenderTimer = setTimeout(() => updateUploadProgressUi(), patch.error || patch.percent === 100 ? 0 : 180);
}

function updateUploadProgressUi() {
  const bar = document.querySelector("[data-upload-progress]");
  if (!bar) {
    render();
    return;
  }
  const message = bar.querySelector("[data-upload-message]");
  const fill = bar.querySelector("[data-upload-fill]");
  const percent = bar.querySelector("[data-upload-percent]");
  if (message) message.textContent = state.upload.message || "";
  if (fill) fill.style.width = `${state.upload.percent || 0}%`;
  if (percent) percent.textContent = `${state.upload.percent || 0}%`;
}

async function patchResourceList(route, saved) {
  if (!saved?.id || !resourcePages[route]) return;
  const authOpts = { session: state.session, user: state.user };
  try {
    const fresh = await listResources(resourcePages[route].type, authOpts);
    const item = fresh.find((row) => row.id === saved.id);
    if (!item) return;
    const list = state.data[route] || [];
    state.data[route] = [item, ...list.filter((row) => row.id !== saved.id)];
    if (state.route === route) render();
  } catch {
    /* silent refresh will reconcile */
  }
}

async function performResourceUpload(form, existing) {
  const route = form.dataset.route;
  const page = resourcePages[route];
  const data = new FormData(form);
  const mainFile = form.elements.mainFile.files[0];
  const iconFile = form.elements.iconFile?.files?.[0];
  const previewOne = form.elements.previewOne?.files?.[0];
  const previewTwo = form.elements.previewTwo?.files?.[0];

  if (!existing && !mainFile) throw new Error("Choose the main file before uploading.");
  if (page.requiresProjectAssets) {
    if (mainFile && !/\.(swb|zip)$/i.test(mainFile.name)) throw new Error("Project file must be .swb or .zip.");
    if (!existing && (!iconFile || !previewOne || !previewTwo)) {
      throw new Error("Project uploads require an icon and two preview images.");
    }
  }
  if (page.route === "icons" && mainFile && !/\.(png|jpe?g|webp|svg|zip)$/i.test(mainFile.name)) {
    console.warn("[SketchVault Upload] icon extension warning", mainFile.name);
  }

  if (!state.session?.access_token || !state.user?.id) {
    throw new Error("You are not signed in. Please sign in and try again.");
  }

  const controller = new AbortController();
  state.uploadAbort = controller;

  return saveResource(
    page.type,
    {
      fileName: data.get("fileName"),
      description: page.route === "icons" ? "" : data.get("description"),
      category: data.get("category"),
      sortKey: data.get("sortKey")
    },
    { mainFile, iconFile, previewOne, previewTwo },
    existing,
    {
      session: state.session,
      user: state.user,
      signal: controller.signal,
      onProgress: ({ message, percent }) => {
        setUploadProgress({ active: true, message, percent, error: "" });
      }
    }
  );
}

async function handleResourceUpload(form, submit) {
  const existing = form.dataset.id ? findResource(form.dataset.route, form.dataset.id) : null;
  const run = async () => {
    resetUploadState();
    setUploadProgress({ active: true, message: t("upload.preparing"), percent: 0, error: "" });
    try {
      const saved = await performResourceUpload(form, existing);
      resetUploadState();
      state.modal = null;
      toast(existing ? "Resource updated." : t("upload.complete"), "success");
      patchResourceList(form.dataset.route, saved);
      reloadAfterMutation(form.dataset.route);
    } catch (error) {
      const message = readableError(error);
      setUploadProgress({ active: false, message: t("upload.failed"), percent: 0, error: message });
      state.upload.retry = () => handleResourceUpload(form, submit);
      throw error;
    }
  };

  if (submit) {
    submit.disabled = true;
    try {
      await run();
    } catch {
      /* upload status ဖြင့် ပြထားပြီး */
    } finally {
      submit.disabled = false;
    }
  } else {
    await run();
  }
}

async function handleJavaUpload(form, submit) {
  await runAction(submit, async () => {
    if (!state.session?.access_token || !state.user?.id) {
      throw new Error("You are not signed in. Please sign in and try again.");
    }
    const existing = form.dataset.id ? findJava(form.dataset.id) : null;
    const data = new FormData(form);
    await saveJavaCode(
      {
        codeName: data.get("codeName"),
        description: data.get("description"),
        sourceCode: data.get("sourceCode"),
        category: data.get("category"),
        sortKey: data.get("sortKey")
      },
      existing,
      { session: state.session, user: state.user }
    );
    state.modal = null;
    toast(existing ? "Java source updated." : "Java source uploaded.", "success");
    reloadAfterMutation("java");
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
