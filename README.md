# SketchVault

Sketchware Pro ပရောဂျက်ဖိုင်များ၊ Java source code၊ custom blocks၊ libraries နှင့် icons များကို စီမံခန့်ခွဲရန် မိုဘိုင်းဦးစားပေး static web app။ HTML/CSS/JavaScript + Supabase (Auth / Database / Storage) သုံးထားပါသည်။

## ဒေသတွင်း run ရန်

```powershell
node server.mjs
```

ဖွင့်ရန် — `http://localhost:4173`

## Supabase Setup လမ်းညွှန်

### ၁. Project အသစ်ဖန်တီးပါ

1. [Supabase](https://supabase.com) တွင် project အသစ်ဖန်တီးပါ။
2. Project Settings → API → `Project URL` နှင့် `anon public key` ကို ကူးပါ။
3. `src/config.js` ထဲက `supabaseUrl` / `supabaseAnonKey` ကို အစားထိုးပါ။

ဤ static app သည် build step မလိုပါ — browser မှ `src/config.js` ကို တိုက်ရိုက်ဖတ်ပါသည်။ Production တွင် environment variable မသုံးပါက key များကို repo ထဲ မထည့်ပါနှင့်။

### ၂. Database schema

1. Supabase Dashboard → SQL Editor
2. `supabase/schema.sql` အပြည့်အစုံကို paste လုပ်ပြီး Run
3. **`java_codes.description`** ကော်လံ အသစ်ပါသည် — ယခင်က deploy လုပ်ထားပြီးသားဆိုရင် SQL Editor တွင် အောက်ပါကို တစ်ကြောင်း run ပါ —
   ```sql
   alter table public.java_codes add column if not exists description text;
   ```

### ၃. Authentication

Authentication → Providers:

1. **Email** — Enable (လိုပါက Confirm email ကို Off)
2. **Google** — မသုံးတော့ပါ (SketchVault တွင် ဖယ်ထားပြီး)
3. **GitHub** — Enable + OAuth Client ID/Secret
4. URL Configuration → Site URL နှင့် Redirect URLs:
   ```text
   http://localhost:4173/
   https://your-domain.com/
   ```

စကားဝှက် ပြန်လည်သတ်မှတ်လင့်ခ်သည် `#/auth?mode=recovery` သို့ ပြန်လာပါသည်။

### ၄. Storage & RLS

`schema.sql` က buckets (`resource-files`, `resource-icons`, `resource-previews`) နှင့် RLS policies များကို ဖန်တီးပေးပါသည်။ Upload path သည် `{auth.uid()}/...` အောက်တွင်သာ ခွင့်ပြုထားပါသည်။

Admin — `profiles.role = 'admin'`

### ၅. ဘာသာစကား (App UI)

- Default: **English**
- **Appearance** page → **Language** → `English + Burmese` သည် UI တွင် မြန်မာလို label များကို English နှင့်အတူ ပြပါသည်။
- Tutorial/README များကို မြန်မာလို ထားထားနိုင်ပါသည် — app UI နှင့် ခွဲထားပါသည်။

### ၆. အဓိက လုပ်ဆောင်ချက်များ

- Email/Password + GitHub OAuth
- စကားဝှက် ပြရန်/ဖျောက်ရန် ခလုတ်
- အလင်း / အမှောင် / စနစ် theme (default: စနစ်)
- Android မိုဘိုင်းအတွက် upload progress + XHR storage + session timeout ပြင်ဆင်ချက်
- Dashboard stat cards၊ skeleton loaders၊ FAB
- Project / Icon grid-list toggle
- Java Prism syntax highlighting + ဖော်ပြချက်
- ဒေါင်းလုဒ် progress နှင့် retry

## Deployment — Vercel vs Cloudflare

| | Vercel (Free) | Cloudflare Pages (Free) |
|---|---|---|
| Static hosting | ✓ | ✓ |
| SPA rewrite | `vercel.json` ပါပြီး | `_redirects` သို့မဟုတ် Pages settings |
| ကမ္ဘာလုံးဆိုင်ရာ CDN | ✓ | ✓ (အများအားဖြင့် မြန်သည်) |
| Upload ပြဿနာ | **မဖြေရှင်း** — ဖိုင်သည် client → Supabase တိုက်ရိုက် | **မဖြေရှင်း** — တူညီသည် |

**အကြံပြုချက်:** မိုဘိုင်း upload သည် Vercel/Cloudflare ကြားကွာခြားမှု မဟုတ်ပါ — Supabase Storage သို့ browser တိုက်ရိုက်တင်ပါသည်။ လက်ရှိ upload ပြဿနာကို `src/supabase.js` တွင် session/local XHR + progress UI ဖြင့် ပြင်ထားပါသည်။ ငွေကြေးမရှိပါက **Cloudflare Pages** သို့ ပြောင်းခြင်းသည် performance အတွက် ကောင်းနိုင်သော်လည်း upload bug အတွက် မဖြစ်မနေ မလိုပါ။

ယခု repo တွင် `vercel.json` (SPA rewrite) ပါပြီးသားဖြစ်သည်။ Cloudflare သို့ ရွေ့မည်ဆိုပါက —
1. GitHub repo ချိတ်ဆက်
2. Build command: *(ဗလာ)*
3. Output: root directory
4. `_redirects` ဖိုင် — `/* /index.html 200`

## မှတ်သားရန် ဖိုင်များ

- `index.html` — entry + Prism.js
- `src/app.js` — routing, UI, forms
- `src/supabase.js` — auth, storage, upload pipeline
- `src/ui.js` — helpers
- `src/styles.css` — design system
- `vercel.json` — SPA routing
- `supabase/schema.sql` — DB + storage
