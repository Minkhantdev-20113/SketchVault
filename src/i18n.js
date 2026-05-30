const STRINGS = {
  en: {
    "lang.en": "English",
    "lang.my": "English + Burmese",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.system": "System",
    "theme.aria": "Theme",
    "nav.dashboard": "Main Dashboard",
    "nav.projects": "Project Files",
    "nav.java": "Java Source Code",
    "nav.blocks": "Custom Blocks Files",
    "nav.libraries": "Library Files",
    "nav.icons": "Icon Files",
    "nav.appearance": "Appearance",
    "common.cancel": "Cancel",
    "common.save": "Save Changes",
    "common.upload": "Upload",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.copy": "Copy",
    "common.details": "Details",
    "common.download": "Download",
    "common.retry": "Retry",
    "common.signOut": "Sign Out",
    "common.getStarted": "Get Started",
    "common.documentation": "Documentation",
    "common.tools": "Other Tools",
    "common.favorites": "Favorites",
    "common.addNew": "Add New",
    "common.admin": "Admin",
    "common.member": "Member",
    "common.workspace": "Workspace",
    "auth.signIn": "Sign In",
    "auth.signUp": "Sign Up",
    "auth.forgot": "Reset",
    "auth.welcome": "Welcome back",
    "auth.createAccount": "Create your account",
    "auth.resetAccess": "Reset access",
    "auth.setNewPassword": "Set a new password",
    "auth.secureWorkspace": "Secure workspace",
    "auth.subtitle": "Use email or GitHub to manage Sketchware resources with private storage.",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.username": "Username",
    "auth.showPassword": "Show password",
    "auth.hidePassword": "Hide password",
    "auth.forgotLink": "Forgot password?",
    "auth.github": "Continue with GitHub",
    "auth.reset.step1": "Enter your email and request a reset link",
    "auth.reset.step2": "Open the link from your inbox",
    "auth.reset.step3": "Set your new password",
    "auth.reset.send": "Send reset link",
    "auth.reset.recoveryLink": "Already opened the link? Set new password",
    "auth.reset.update": "Update password",
    "auth.reset.backSignIn": "Back to sign in",
    "appearance.title": "Appearance",
    "appearance.subtitle": "Theme and display preferences. Choices are saved on this device.",
    "appearance.language": "Language",
    "appearance.languageHint": "English is the default. English + Burmese shows Burmese labels alongside English in the app.",
    "appearance.sidebar": "Navigation density",
    "appearance.sidebarHint": "Collapse the sidebar to icon-only mode on desktop.",
    "appearance.toggleSidebar": "Toggle sidebar",
    "landing.eyebrow": "Sketchware Pro resource platform",
    "landing.hero": "A mobile-first workspace for Sketchware project files, Java code, blocks, libraries, and icons.",
    "dashboard.welcome": "Welcome",
    "dashboard.subtitle": "A real-time control center for your Sketchware Pro resources.",
    "dashboard.loading": "Loading your Sketchware resource workspace.",
    "dashboard.stat.projects": "Project Files",
    "dashboard.stat.java": "Java Snippets",
    "dashboard.stat.files": "Files Total",
    "dashboard.stat.categories": "Categories",
    "java.codeName": "Code Name",
    "java.description": "Description",
    "java.descriptionPlaceholder": "What is this snippet used for?",
    "java.source": "Java Source Code",
    "java.uploadTitle": "Upload Java Source Code",
    "java.editTitle": "Edit Java Source Code",
    "java.detailTitle": "Java Source Details",
    "java.uploaded": "Uploaded",
    "resource.fileName": "File Name",
    "resource.description": "Description",
    "resource.noMatch": "No matching files",
    "resource.noMatchHint": "Upload a resource or adjust search, category, sort, and favorites.",
    "upload.preparing": "Preparing upload…",
    "upload.session": "Checking session…",
    "upload.failed": "Upload failed",
    "upload.complete": "Upload complete!",
    "upload.cancelled": "Upload cancelled."
  },
  my: {
    "lang.en": "English",
    "lang.my": "English + Burmese",
    "theme.light": "Light / အလင်း",
    "theme.dark": "Dark / အမှောင်",
    "theme.system": "System / စနစ်",
    "theme.aria": "Theme / အပြင်အဆင်",
    "nav.dashboard": "Main Dashboard / ပင်မဒက်ရှ်ဘုတ်",
    "nav.projects": "Project Files / ပရောဂျက်ဖိုင်များ",
    "nav.java": "Java Source Code / Java ကုဒ်",
    "nav.blocks": "Custom Blocks / ဘလောက်ဖိုင်များ",
    "nav.libraries": "Library Files / လိုင်ဘရာရီများ",
    "nav.icons": "Icon Files / အိုင်ကွန်များ",
    "nav.appearance": "Appearance / အပြင်အဆင်",
    "common.cancel": "Cancel / ပယ်ဖျက်ရန်",
    "common.save": "Save / သိမ်းရန်",
    "common.upload": "Upload / တင်ရန်",
    "common.delete": "Delete / ဖျက်ရန်",
    "common.edit": "Edit / ပြင်ရန်",
    "common.copy": "Copy / ကူးရန်",
    "common.details": "Details / အသေးစိတ်",
    "common.download": "Download / ဒေါင်းလုဒ်",
    "common.retry": "Retry / ထပ်စမ်း",
    "common.signOut": "Sign Out / ထွက်ရန်",
    "common.getStarted": "Get Started / စတင်ရန်",
    "common.documentation": "Documentation / စာရွက်စာတမ်း",
    "common.tools": "Other Tools / ကိရိယာများ",
    "common.favorites": "Favorites / စိတ်ကြိုက်များ",
    "common.addNew": "Add New / အသစ်ထည့်ရန်",
    "common.admin": "Admin",
    "common.member": "Member / အဖွဲ့ဝင်",
    "common.workspace": "Workspace",
    "auth.signIn": "Sign In / ဝင်ရန်",
    "auth.signUp": "Sign Up / စာရင်းသွင်း",
    "auth.forgot": "Reset / စကားဝှက်",
    "auth.welcome": "Welcome back / ပြန်လည်ကြိုဆိုပါသည်",
    "auth.createAccount": "Create account / အကောင့်ဖွင့်ရန်",
    "auth.resetAccess": "Reset access / စကားဝှက် ပြန်သတ်မှတ်",
    "auth.setNewPassword": "New password / စကားဝှက်အသစ်",
    "auth.secureWorkspace": "Secure workspace / လုံခြုံသော workspace",
    "auth.subtitle": "Email သို့မဟုတ် GitHub ဖြင့် resource များကို စီမံပါ။",
    "auth.email": "Email",
    "auth.password": "Password / စကားဝှက်",
    "auth.username": "Username / အသုံးပြုသူအမည်",
    "auth.showPassword": "Show password / ပြရန်",
    "auth.hidePassword": "Hide password / ဖျောက်ရန်",
    "auth.forgotLink": "Forgot password? / စကားဝှက် မေ့နေပါသလား?",
    "auth.github": "Continue with GitHub",
    "auth.reset.step1": "Email ထည့်ပြီး reset link တောင်းပါ",
    "auth.reset.step2": "Inbox ထဲက link ကို ဖွင့်ပါ",
    "auth.reset.step3": "စကားဝှက်အသစ် ထားပါ",
    "auth.reset.send": "Send reset link / လင့်ခ်ပို့ရန်",
    "auth.reset.recoveryLink": "Link ဖွင့်ပြီးပြီလား?",
    "auth.reset.update": "Update password / အပ်ဒိတ်လုပ်ရန်",
    "auth.reset.backSignIn": "Back to sign in / ဝင်ရန်သို့",
    "appearance.title": "Appearance / အပြင်အဆင်",
    "appearance.subtitle": "Theme နှင့် ဘာသာစကား ရွေးချယ်မှုများ။",
    "appearance.language": "Language / ဘာသာစကား",
    "appearance.languageHint": "Default သည် English ဖြစ်သည်။ English + Burmese သည် app UI တွင် မြန်မာလိုလည်း ပြပါသည်။",
    "appearance.sidebar": "Sidebar / ဘေးတန်း",
    "appearance.sidebarHint": "Desktop တွင် icon-only မုဒ်သို့ ပြောင်းနိုင်သည်။",
    "appearance.toggleSidebar": "Toggle / ပြောင်းရန်",
    "landing.eyebrow": "Sketchware Pro resource platform",
    "landing.hero": "ပရောဂျက်ဖိုင်များ၊ Java၊ blocks၊ libraries၊ icons များကို တစ်နေရာတည်းမှ စီမံပါ။",
    "dashboard.welcome": "Welcome",
    "dashboard.subtitle": "Sketchware Pro resource များအတွက် control center။",
    "dashboard.loading": "Workspace ဖွင့်နေသည်…",
    "dashboard.stat.projects": "Projects / ပရောဂျက်များ",
    "dashboard.stat.java": "Java / ကုဒ်များ",
    "dashboard.stat.files": "Files / ဖိုင်စုစုပေါင်း",
    "dashboard.stat.categories": "Categories / ကဏ္ဍများ",
    "java.codeName": "Code Name / ကုဒ်အမည်",
    "java.description": "Description / ဖော်ပြချက်",
    "java.descriptionPlaceholder": "ဤကုဒ်ကို ဘာအတွက်သုံးသလဲ",
    "java.source": "Java Source Code",
    "java.uploadTitle": "Upload Java / Java တင်ရန်",
    "java.editTitle": "Edit Java / Java ပြင်ရန်",
    "java.detailTitle": "Java Details / အသေးစိတ်",
    "java.uploaded": "Uploaded / တင်ခဲ့သည့်ရက်",
    "resource.fileName": "File Name / အမည်",
    "resource.description": "Description / ဖော်ပြချက်",
    "resource.noMatch": "No matching files / ဖိုင်မတွေ့ပါ",
    "resource.noMatchHint": "ဖိုင်တင်ပါ သို့မဟုတ် filter များကို ပြင်ပါ။",
    "upload.preparing": "Preparing… / ပြင်ဆင်နေသည်",
    "upload.session": "Checking session… / စက်ရှင်စစ်ဆေးနေသည်",
    "upload.failed": "Upload failed / တင်ခြင်း မအောင်မြင်",
    "upload.complete": "Upload complete! / အောင်မြင်ပါသည်",
    "upload.cancelled": "Upload cancelled. / ပယ်ဖျက်ပြီး"
  }
};

let currentLocale = localStorage.getItem("locale") || "en";

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  currentLocale = STRINGS[locale] ? locale : "en";
  localStorage.setItem("locale", currentLocale);
  document.documentElement.lang = currentLocale === "my" ? "my" : "en";
}

export function t(key, vars = {}) {
  const table = STRINGS[currentLocale] || STRINGS.en;
  let text = table[key] ?? STRINGS.en[key] ?? key;
  Object.entries(vars).forEach(([name, value]) => {
    text = text.replaceAll(`{${name}}`, String(value));
  });
  return text;
}

export function languageSwitcherHtml(compact = false) {
  const options = [
    { id: "en", label: t("lang.en") },
    { id: "my", label: t("lang.my") }
  ];
  return `<div class="lang-switch${compact ? " lang-switch--compact" : ""}" role="group" aria-label="${t("appearance.language")}">
    ${options
      .map(
        (opt) =>
          `<button type="button" class="lang-switch-btn${currentLocale === opt.id ? " active" : ""}" data-action="set-locale" data-locale="${opt.id}">${opt.label}</button>`
      )
      .join("")}
  </div>`;
}

setLocale(currentLocale);
