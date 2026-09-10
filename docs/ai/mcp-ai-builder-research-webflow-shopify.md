# Riset: AI Site Builder Webflow & Shopify → Arahan Perbaikan MCP Driftless

> **Status:** Riset / diagnosis. **Belum ada perubahan kode.**
> **Tanggal:** 2026-09-10
> **Tujuan:** Memahami cara kerja AI site/store builder Webflow & Shopify, lalu memetakan kenapa page yang dibangun lewat **MCP Driftless** sering meleset dari desain referensi — dan apa yang harus ditiru.

---

## 1. Ringkasan Eksekutif

Webflow & Shopify bukan "lebih jago nulis HTML". Keunggulan presisi mereka datang dari **tiga disiplin arsitektural** yang sama:

1. **Design tokens dulu, baru halaman.** Warna, type scale, spacing, radius ditetapkan sebagai *single source of truth* lebih dulu; tiap halaman/section digenerate **mengacu ke token**, bukan nulis angka mentah per elemen.
2. **Merangkai komponen jadi, bukan melukis pixel.** AI menyusun dari library component/section yang sudah encode desain bagus (utility classes Webflow / sections Shopify), lalu divalidasi schema. Output invalid ditolak.
3. **Ada mata.** Hasil dirender di canvas/preview yang bisa dilihat (oleh manusia, dan di tool terbaik — oleh model lewat screenshot) lalu diiterasi.

MCP Driftless **sudah punya sebagian besar potongan ini**, tapi meleset karena **tiga gap**: (1) **model authoring blind** — tak pernah menerima pixel hasil render; (2) **coverage dicek terhadap brief yang ditulis model sendiri**, bukan terhadap gambar referensi; (3) **token system dangkal** — praktis cuma warna, sehingga spacing/tipografi/proporsi ditulis sebagai CSS string mentah yang acak antar-block.

**Arah perbaikan singkat:** tutup *visual feedback loop* (P0), lalu perdalam token system (P1), lalu nilai fidelity terhadap referensi sungguhan (P2–P3). Inilah kenapa "dikasih HTML/CSS pun hasilnya tetap gak mirip": model gak bisa melihat apa yang dia bangun, dan gak ada lapisan token yang mengikat gaya agar konsisten.

---

## 2. Cara Kerja Webflow AI Site Builder

**Input:** user pilih "membangun untuk siapa", isi nama bisnis, lalu deskripsi sedetail mungkin (fungsi, sumber data, interaksi) + brand reference opsional.

**Pipeline (arsitektur berlapis, berbasis framework *Flowkit*):**

```
design tokens  →  utility classes  →  components  →  page layouts
(warna, type      (class reusable     (dirakit dari   (komponen disusun
 scale, spacing)   di atas token)       utilities)       jadi halaman)
```

- AI **menetapkan design tokens DULU** dari prompt + brand reference, **lalu generate tiap halaman mengacu token itu**. Ganti token di *Global Styles* → seluruh situs ikut berubah (konsistensi brand terjaga by design).
- AI tidak menulis markup bebas — ia **merangkai komponen/utility yang sudah ada** (hero + CTA, feature grid 3 kolom, testimonial slider, dst.) sebagai native Webflow element yang bisa diedit di Designer.
- **MCP Webflow = *translation layer*** antara AI dan project: natural language → panggilan **Designer/Data API** yang membuat section, container, grid secara terstruktur, mengisi CMS, menerjemahkan token, mengatur metadata. MCP-nya **bukan** yang "mendesain" — ia eksekutor API; desain bagus datang dari Flowkit + disiplin token.
- Sesudah generate, manusia **menyempurnakan secara visual** di Designer (WYSIWYG).

> **Pelajaran untuk kita:** yang bikin presisi bukan MCP-nya, tapi (a) **token-first**, (b) **library komponen ber-utility**, (c) **canvas visual untuk iterasi**.

---

## 3. Cara Kerja Shopify AI Store Builder / Sidekick

**Input:** "Describe your business in a few words" (prompt singkat) → generate banyak kandidat desain store; bisa iterasi tanpa batas.

**Arsitektur token & guardrail:**

- **`settings_schema.json` → CSS custom properties = *single source of truth*.** Semua color, type, spacing, radius, shadow, motion berasal dari satu sumber token; ubah token di theme editor → seluruh theme restyle otomatis. Persis prinsip yang sama dengan Flowkit-nya Webflow.
- **Block hasil AI dibungkus wrapper `_blocks.liquid`** dan **wajib lolos schema validation**: section penerima harus mendukung `@theme` blocks, punya preset, `{% content_for 'blocks' %}`, dll. **Kalau schema tak terpenuhi → error di editor, block ditolak.** Jadi output yang "ngaco secara struktur" tak pernah lolos.
- Settings pada wrapper jadi **guardrail gaya/layout** agar block tetap konsisten dengan theme.
- Sidekick/Magic juga bantu copywriting (deskripsi produk, headline) — tapi fondasi visualnya tetap token + section + schema.

> **Pelajaran untuk kita:** **schema validation sebagai gerbang** (kita sudah punya di `validate_page_content`) + **token terpusat yang mengikat semua gaya** (ini yang masih kurang).

---

## 4. Pola Bersama + Realita Fidelity

| Disiplin | Webflow | Shopify | Kenapa penting |
|---|---|---|---|
| **Tokens-first** | Flowkit: tokens → utilities → components → layouts | `settings_schema.json` → CSS vars | Gaya konsisten; "ganti sekali, berubah semua"; model gak nulis angka mentah |
| **Constrained components** | utility classes + native elements | sections + theme blocks | Varian rendah → fidelity tinggi; gak ngarang markup |
| **Schema gate** | API terstruktur menolak invalid | `_blocks.liquid` + schema validation | Output ngaco ditolak sebelum tampil |
| **Visual editing / canvas** | Designer (WYSIWYG) | Theme editor | Ada *mata* untuk koreksi |

**Realita fidelity (penting):** Bahkan tool screenshot-to-code terbaik (v0, Bolt.new) hanya mencapai **~70% kemiripan visual** menurut benchmark **Design2Code (Stanford)** — **dan itu pun model-nya MELIHAT screenshot lalu iterasi**. Artinya: fidelity tinggi **mustahil tanpa visual feedback loop**. Prompt bagus saja tidak cukup; model harus bisa membandingkan hasil render dengan referensi dengan matanya sendiri. Ini akar kenapa pendekatan "authoring buta lalu berharap mirip" selalu kalah.

---

## 5. Audit MCP Driftless Saat Ini

Driftless ternyata **sudah mengimplementasikan banyak pola di atas**. Peta tool inti (bukti di `modules/mcp/mcp_tools.ts` & `modules/mcp/controllers/api/pages_controller.ts`):

| Kapabilitas | Status di Driftless | Bukti / catatan |
|---|---|---|
| Theme/brand colour terpusat | ✅ Parsial | `set_appearance` — primary/secondary + `savedColors` → `var(--color-<slug>)` (`mcp_tools.ts:910`). CTA/Button/cart render warna theme. |
| Design tokens (spacing/type/radius/shadow scale) | ❌ Belum | Tidak ada skala token; `styleProps` = CSS string mentah (`padding:"16px 24px"`, hex acak). |
| Library komponen/recipe | ✅ Ada, longgar | Katalog **72 block** + `recipes` + contoh doc (`resources/mcp/catalog.page.json`, `get_block_catalog`). Tapi model bebas menyusun 72 primitive dengan CSS apa pun → varian tinggi. |
| Schema validation gate | ✅ Ada | `validate_page_content` + `puck_content_validator.ts` (unknown block, slot salah, host placeholder = hard error). |
| Brief desain | ✅ Ada | `set_design_brief` (palette, typography, iconStyle, sections + asset slots). |
| Coverage / brief-vs-build | ⚠️ Ada tapi sirkular | `check_design_coverage` / `design_coverage.ts` — **structure+palette+asset saja**, dibanding **brief tulisan model sendiri**. |
| Responsive otomatis | ✅ Ada | `auto_responsive.ts` (mobile/tablet override otomatis saat save). |
| Edit presisi (diff) | ✅ Ada | `patch_page_content` — addressing block via `props.id`, hindari re-send seluruh tree. |
| Asset dari referensi | ✅ Ada | `upload_media(purpose:"reference")` + `crop_media` (potong foto asli dari referensi). |
| **Visual feedback (pixel)** | ❌ **Tidak ada** | `render_page` hanya mengembalikan **HTML teks**, script dibuang. Lihat §6. |
| Ekstraksi token dari gambar referensi | ❌ Belum | Tidak ada; model harus "mengira" palette/spacing secara buta. |

**Kesimpulan audit:** pondasinya sudah mirip Webflow/Shopify. Yang hilang justru **3 hal yang paling menentukan fidelity**.

---

## 6. Diagnosis: 3 Gap Akar Masalah

### Gap #1 — Tidak ada visual feedback loop (penyebab utama)

`render_page` (`pages_controller.ts:368-385`) mengambil HTML dari pipeline `/preview`, lalu menjalankan `trimHtmlForModel` (`pages_controller.ts:92-99`) yang **membuang semua `<script>`** dan memotong pada 60.000 karakter. Note-nya sendiri berkata:

> "Server-rendered draft HTML (script bundles stripped). CSR-only pages render on the client, so their body may be empty here."

Dan docstring-nya eksplisit: model **"authors blind"** (`pages_controller.ts:363`). Hasil grep `puppeteer|playwright|chromium|screenshot` di repo = **nihil**. Artinya model **tidak pernah menerima pixel** — ia tidak bisa menilai spacing, proporsi, overflow, alignment, atau tipografi. Semua gate otomatis berbasis teks/struktur. Satu-satunya "mata" di loop adalah **manusia** yang membuka `get_preview_url`.

→ **Inilah sebab "dikasih HTML/CSS sumber pun tetap gak mirip":** model menerjemahkan sumber menjadi tree Puck secara buta, lalu **tak punya cara melihat** bahwa hasilnya meleset, apalagi mengoreksinya. Bandingkan dengan v0/Bolt yang *melihat* screenshot dan tetap cuma ~70% (§4).

### Gap #2 — Coverage dinilai terhadap brief tulisan model sendiri (sirkular)

`design_coverage.ts` adalah fungsi *pure/synchronous* yang membandingkan build dengan **brief yang ditulis model** (`set_design_brief`), bukan dengan byte gambar referensi. Komentar di kodenya jujur (`design_coverage.ts:252-257`):

> "it compares the build against the brief the model itself wrote, on structure/palette/asset signals only. It does NOT see the render, so it cannot judge visual layout, spacing, proportion or typography."

Alur jadi sirkular: model **transkrip** referensi → brief → lalu dicek **vs transkripsinya sendiri**. Kalau transkripnya sudah salah (wajar, karena buta), coverage bisa lapor "100%" sementara halaman jauh dari referensi.

### Gap #3 — Token system dangkal → gaya mentah & inkonsisten

`set_appearance` (`mcp_tools.ts:910-941`) hanya menangani **font + primary/secondary + `savedColors`**. Warna punya jalur token parsial (`var(--color-<slug>)`), tapi **tidak ada skala token untuk spacing, type scale, radius, shadow, atau container width**. Akibatnya setiap block menulis **CSS string mentah** (`padding:"16px 24px"`, `textSize:"48px"`, hex acak) yang tidak terikat ke sistem apa pun → antar-section tidak konsisten, dan `check_design_coverage` bahkan terpaksa mem-flag hex mentah sebagai *off-brand* karena tak ada lapisan token untuk dirujuk.

Ini **kebalikan** dari Flowkit (Webflow) dan `settings_schema.json` (Shopify), di mana *semua* gaya mengacu token terpusat.

---

## 7. Rekomendasi Berprioritas

> Format tiap item: **masalah → usulan → file yang kemungkinan disentuh → effort kasar.** Detail desain teknis disusun di sesi implementasi.

### P0 — Tutup visual feedback loop *(leverage tertinggi)*
- **Masalah:** model authoring blind (Gap #1).
- **Usulan:** tambah render **screenshot asli** (headless Chromium atas preview URL, per-viewport desktop/tablet/mobile) yang dikembalikan sebagai **gambar yang bisa dilihat model**, sehingga model bisa self-correct layout/spacing/proporsi. Opsional: sertakan screenshot referensi berdampingan untuk dibandingkan langsung.
- **Sentuh:** `pages_controller.ts` (`render` / tool baru mis. `screenshot_page`), `modules/mcp/mcp_tools.ts` (daftarkan tool + izinkan output image). Perlu dependency headless browser + pertimbangan environment (lihat memory: service edits butuh restart dev-server).
- **Effort:** M–L. **Ini yang paling menggerakkan jarum fidelity.**

### P1 — Perdalam jadi token-first design system
- **Masalah:** token dangkal (Gap #3).
- **Usulan:** perluas `set_appearance` jadi token set nyata — **color roles, spacing scale, type scale, radius, shadow, container width** — dipublish sebagai CSS custom properties (pola `settings_schema.json`). Izinkan `styleProps` mereferensikan token (`var(--space-4)`, `var(--text-2xl)`), dan **steer katalog/recipes agar emit token-ref, bukan px/hex mentah**.
- **Sentuh:** `settings_controller.ts`, `inertia/puck/config.tsx`, emitter katalog (`commands/mcp_catalog.ts`), `design_coverage.ts` (cek "pakai token").
- **Effort:** L.

### P2 — Ekstrak token DARI gambar referensi
- **Masalah:** model mengira palette/spacing secara buta.
- **Usulan:** saat `upload_media(purpose:"reference")`, jalankan ekstraksi palette/kontras (dan kalau bisa, perkiraan spacing/rhythm) untuk **menyeed `set_appearance`** — bukan mengandalkan tebakan model.
- **Sentuh:** `media_controller.ts`, service ekstraksi baru, `set_appearance`.
- **Effort:** M.

### P3 — Nilai coverage vs referensi + vision judge
- **Masalah:** coverage sirkular (Gap #2).
- **Usulan:** setelah P0 ada, tambahkan **LLM-vision judge** yang membandingkan screenshot render vs screenshot referensi → **delta terstruktur** (spacing off, urutan section salah, warna mismatch) yang langsung bisa disuapkan ke `patch_page_content`.
- **Sentuh:** `design_coverage.ts` (atau service baru), `mcp_tools.ts`.
- **Effort:** M (bergantung P0).

### P4 — Recipes → "sections" siap-pakai (ala Flowkit)
- **Masalah:** varian terlalu tinggi karena menyusun 72 primitive dari nol.
- **Usulan:** sediakan **library section token-driven** (hero varian, feature grid, pricing, testimonial, CTA) yang tinggal diisi model — bukan dirakit dari primitive. Varian turun → fidelity & konsistensi naik.
- **Sentuh:** katalog `recipes` / `config.tsx`, emitter katalog.
- **Effort:** M–L (inkremental, bisa ditambah bertahap).

---

## 8. Usulan Urutan Implementasi

1. **P0 (visual loop)** dulu — tanpa mata, semua perbaikan lain mentok di langit-langit ~struktur saja.
2. **P1 (token-first)** — memberi model "kosakata" konsisten untuk spacing/tipografi, mengurangi acak.
3. **P2 (ekstraksi dari referensi)** — memastikan token awal benar, bukan tebakan.
4. **P3 (vision judge)** — mengubah loop koreksi dari "vs brief sendiri" jadi "vs referensi sungguhan".
5. **P4 (section library)** — menurunkan varian secara berkelanjutan.

Setiap fase berdiri sendiri dan sudah memberi perbaikan nyata; tidak perlu menunggu semuanya selesai.

---

## 9. Sumber

- Webflow AI — https://webflow.com/ai
- Webflow AI Site Builder (Flowkit: tokens/utilities/components/layouts) — https://www.appsrow.com/blog/understanding-webflow-ai-site-builder-components-cms-styling-and-performance
- Webflow MCP Server (developer docs) — https://developers.webflow.com/mcp/reference/overview
- Webflow MCP Server (GitHub) — https://github.com/webflow/mcp-server
- Shopify — AI-generated theme blocks (`_blocks.liquid`, schema validation) — https://shopify.dev/docs/storefronts/themes/architecture/blocks/ai-generated-theme-blocks
- Shopify AI Store Builder (landing) — https://www.shopify.com/tools/ai-store-builder
- Design2Code (Stanford) — benchmark screenshot-to-code — https://arxiv.org/html/2410.16232v1
- Screenshot-driven UI dengan vision models — https://www.digitalapplied.com/blog/screenshot-driven-ui-development-vision-models-2026

---

### Lampiran: File kunci MCP Driftless (acuan implementasi)

- `modules/mcp/mcp_tools.ts` — definisi ~86 tool (single source, Zod schema).
- `modules/mcp/controllers/api/pages_controller.ts` — builder-API pages; `render` (`:368`), `trimHtmlForModel` (`:92`), `withAdvisories` (`:108`).
- `modules/mcp/services/puck_content_validator.ts` — gerbang schema struktural.
- `modules/mcp/services/design_coverage.ts` — brief-vs-build (sirkular; `:252-257`).
- `modules/mcp/services/{block_catalog,auto_responsive}.ts` — katalog + responsive otomatis.
- `resources/mcp/catalog.page.json` — 72 block + recipes (di-emit oleh `commands/mcp_catalog.ts` dari `inertia/puck/config.tsx`).
