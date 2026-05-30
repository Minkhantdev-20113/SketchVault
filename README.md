# Sketchware Pro Hub

Mobile-first responsive SaaS web app for Sketchware Pro projects, Java source code, custom blocks, libraries, and icons. The app is plain HTML/CSS/JavaScript with a real Supabase auth/database/storage integration.

## Run locally

```powershell
& "C:\Users\Min Khant\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.mjs
```

Open `http://localhost:4173`.

## Supabase Setup လမ်းညွှန်

### 1. Project အသစ်ဖန်တီးပါ

1. [Supabase](https://supabase.com) မှာ project အသစ်ဖန်တီးပါ။
2. Project Settings → API ကိုဖွင့်ပါ။
3. `Project URL` နဲ့ `anon public key` ကိုကူးပါ။
4. `src/config.js` ထဲက `supabaseUrl` နဲ့ `supabaseAnonKey` ကို သင့် project key တွေနဲ့အစားထိုးပါ။

`.env.example` ကို production hosting မှာ reference အနေနဲ့သုံးနိုင်ပါတယ်။ ဒီ static version က build step မလိုတဲ့အတွက် browser runtime မှာ `src/config.js` ကို တိုက်ရိုက်အသုံးပြုပါတယ်။

### 2. Database schema ထည့်ပါ

1. Supabase Dashboard → SQL Editor ကိုဖွင့်ပါ။
2. `supabase/schema.sql` ထဲက SQL အကုန်ကို copy လုပ်ပါ။
3. SQL Editor မှာ paste လုပ်ပြီး Run နှိပ်ပါ။

ဒီ schema က table များ၊ trigger များ၊ RLS policies များ၊ storage buckets များကိုတစ်ခါတည်းဖန်တီးပေးပါသည်။

Tables:

- `profiles`
- `resource_items`
- `java_codes`
- `favorites`

Storage buckets:

- `resource-files`
- `resource-icons`
- `resource-previews`

### 3. Authentication ပြင်ဆင်ပါ

Supabase Dashboard → Authentication → Providers:

1. Email provider ကို Enable လုပ်ပါ။
2. Email confirmation မလိုချင်ပါက Authentication → Providers → Email → Confirm email ကို Off လုပ်ပါ။
3. Google provider ကို Enable လုပ်ပြီး Google OAuth Client ID/Secret ထည့်ပါ။
4. GitHub provider ကို Enable လုပ်ပြီး GitHub OAuth Client ID/Secret ထည့်ပါ။
5. Authentication → URL Configuration ထဲမှာ Site URL ကို သင့် app URL ထည့်ပါ။
6. Redirect URLs ထဲမှာ local/dev URL နဲ့ production URL ထည့်ပါ။

Examples:

```text
http://localhost:4173
http://localhost:4173/
https://your-domain.com
https://your-domain.com/
```

### 4. Security / RLS

`schema.sql` က Row Level Security ကို Enable လုပ်ထားပြီး policy အောက်ပါအတိုင်းပါဝင်ပါတယ်။

- Signed-in users အားလုံး resource/code တွေကို read လုပ်နိုင်သည်။
- Upload လုပ်သူသာ သူ့ record ကို edit/delete လုပ်နိုင်သည်။
- `profiles.role = 'admin'` ဖြစ်သူသည် resource/code အားလုံးကို manage လုပ်နိုင်သည်။
- Favorites ကို ကိုယ်ပိုင် user row များအတွက်ပဲ read/insert/delete လုပ်နိုင်သည်။
- Storage files ကို authenticated user များက signed URL ဖြင့် read လုပ်နိုင်သည်။
- Storage upload path သည် `auth.uid()` folder အောက်မှာပဲ insert ခွင့်ရှိသည်။

Admin သတ်မှတ်ရန် user sign up ပြီးနောက် Supabase Table Editor → `profiles` ထဲမှာ user row ကိုရှာပြီး `role` ကို `admin` ပြောင်းပါ။

### 5. App features

- Email/password sign in, sign up, password reset
- Google and GitHub OAuth
- Auto-generated username avatar
- Mobile overlay sidebar with swipe open/close
- Collapsible desktop sidebar
- Light/dark mode with local persistence
- Project upload with `.swb`/`.zip`, icon, two previews
- Generic upload for custom blocks, libraries, and icons
- Java source upload with syntax highlighted detail view
- Search by filename/code name
- Category, sort, and favorites filters
- Grid/list toggle for project files
- Owner/admin edit and delete controls
- Private Supabase Storage downloads with progress and retry state
- Toast notifications, skeleton loaders, responsive dialogs

### 6. Deployment

ဒီ app က static site ဖြစ်လို့ Netlify, Vercel, Cloudflare Pages, Supabase Hosting, Nginx, Apache စသည့် static hosting များမှာတင်နိုင်ပါတယ်။

Production deploy မလုပ်မီ:

1. `src/config.js` ထဲမှာ production Supabase URL/key ထည့်ပါ။
2. Supabase Auth Redirect URLs ထဲမှာ production domain ထည့်ပါ။
3. `docs.html` နှင့် `tools.html` ကို final content/URL များဖြင့်အစားထိုးပါ။
4. Landing download links ကို `src/config.js` ထဲမှာ final URLs များဖြင့်ပြောင်းပါ။
5. Supabase policies ကို သင့် sharing model အတိုင်း public/private read ပြင်လိုပါက SQL Editor မှာ policy update လုပ်ပါ။

### 7. Important files

- `index.html` - SPA entry
- `src/app.js` - routing, UI behavior, forms, dashboard, modals
- `src/supabase.js` - Supabase auth/database/storage service layer
- `src/ui.js` - reusable UI helpers
- `src/styles.css` - responsive design system and themes
- `src/config.js` - app configuration and Supabase keys
- `supabase/schema.sql` - database, buckets, RLS policies
- `server.mjs` - local static server
