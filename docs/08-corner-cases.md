# 08 — Corner Cases

Comprehensive corner cases organized by subsystem. Each entry includes the scenario, expected behavior, and implementation approach.

---

## 1. Food Search & Matching

### 1.1 No Fineli matches

**Scenario:** User types a food name with zero results (e.g., "açaí bowl", brand name, very specific dish).

**Behavior:**
- Show: "En löytänyt '{item}' Fineli-tietokannasta."
- Suggest: "Kokeile tarkentaa hakua suomenkielisellä nimellä."
- Offer: "Voit myös syöttää painon grammoina ilman ravintoarvoja."
- Future: allow custom food entry with manual nutrients.

**Implementation:** `NO_MATCH` state in conversation engine; max 2 retries, then skip or custom entry.

### 1.2 Brand names not in Fineli

**Scenario:** User says "Valio kevytmaito" or "Fazer ruisleipä".

**Behavior:**
- Strip known brand prefixes before searching.
- Search "kevytmaito" instead of "Valio kevytmaito".
- If the branded search fails, try the generic term.

**Implementation:** Maintain a `BRAND_STRIP_LIST` of known Finnish food brands to remove before Fineli search.

### 1.3 Compound/mixed foods

**Scenario:** User says "chicken salad" or "pasta bolognese".

**Behavior:**
- First: search as a complete phrase (Fineli has some compound foods like "kanarisotto").
- If no match: ask "Haluatko lisätä ainesosat erikseen (kana, salaatti, kastike)?"
- If user says yes: split and resolve individually.

**Implementation:** Search full phrase first. On failure, apply noun-phrase splitting as fallback.

### 1.4 Ambiguous short names

**Scenario:** User says "maito" — could be rasvaton, kevyt, täysi, UHT, etc.

**Behavior:**
- Always go to DISAMBIGUATING if 2+ results.
- Pre-sort by popularity (kevytmaito is most common in Finland).
- Show top 5 with clear distinguishing info (fat percentage).

### 1.5 Mixed languages

**Scenario:** User types "banana" (English) but Fineli defaults to Finnish.

**Behavior:**
- Search with `lang=fi` first.
- If zero results, retry with `lang=en`.
- If still zero, retry with `lang=sv` (some Swedish terms are close to English).

### 1.6 Misspellings

**Scenario:** "bananni" instead of "banaani".

**Behavior:**
- Fineli's search does substring matching, which may still catch it.
- If zero results: suggest "Tarkoititko: banaani?"
- Future: add fuzzy matching layer.

**Implementation:** MVP relies on Fineli's built-in search. Post-MVP: Levenshtein distance for suggestions.

### 1.7 Food ID removed from Fineli

**Scenario:** A food that was in Fineli when the user logged it gets removed later.

**Behavior:**
- Not a problem: `nutrients_per_100g` is stored as a snapshot in `meal_items`.
- Export uses the snapshot, not a live lookup.
- Display uses `fineli_name_fi` from the stored row.

---

## 2. Portion & Unit Conversion

### 2.1 "A handful" / unmeasurable portions

**Scenario:** User says "kourallinen mustikoita" (a handful of blueberries).

**Behavior:**
- Map "kourallinen" to a default: ~30g for berries/nuts.
- Show: "Kourallinen on noin 30g. Onko se oikein?"
- User can accept or override with grams.

**Implementation:** `HOUSEHOLD_MEASURES` table mapping descriptive terms to approximate grams by food category.

### 2.2 "Half a plate" / relative portions

**Scenario:** User says "puoli lautasellista riisiä".

**Behavior:**
- Ask: "Paljonko arvioisit grammoina? Lautasellinen riisiä on tyypillisesti 200–300g."
- Offer default: "Puolikas = noin 150g. Onko ok?"

### 2.3 Fractions of units

**Scenario:** User says "puoli banaania" or "1.5 kappaletta".

**Behavior:**
- `0.5 * KPL_M.mass` → e.g., 0.5 * 125g = 62.5g.
- Handle: "puoli" (0.5), "kolmasosa" (0.33), "neljäsosa" (0.25).

### 2.4 Cooked vs. raw weight

**Scenario:** "200g riisiä" — does the user mean dry or cooked?

**Behavior:**
- If Fineli has both raw and cooked variants, disambiguation catches this.
- If user says "keitettyä riisiä 200g" → search "riisi, keitetty".
- If ambiguous: ask "Tarkoitatko kuivaa vai keitettyä riisiä?"

### 2.5 Volume-to-weight for dry goods

**Scenario:** "2 dl kauraa" — need density for conversion.

**Behavior:**
- Check Fineli units for DL unit first (mass already provided).
- Fallback: use `DENSITY_TABLE` (rolled oats: 0.40 g/ml → 2dl = 80g).
- If no density: ask for grams directly.

### 2.6 Zero or negative amounts

**Scenario:** User types "0g" or a negative number.

**Behavior:**
- Reject: "Määrän pitää olla suurempi kuin 0."
- Re-ask the portion question.

### 2.7 Extremely large amounts

**Scenario:** "5000g maitoa" (5 liters).

**Behavior:**
- Warn: "5000g on melko paljon (5 litraa). Onko se oikein?"
- Accept if user confirms.

**Implementation:** Per-food-type sanity thresholds. Example: if grams > 10x the largest portion size, warn.

### 2.8 Unit not available for food

**Scenario:** User says "2 dl banaania" — DL doesn't make sense for banana.

**Behavior:**
- Check if `DL` is in the food's available units.
- If not: "Banaanille ei ole dl-yksikköä. Kuinka monta kappaletta tai grammoina?"

---

## 3. Conversation Flow

### 3.1 User changes mind mid-conversation

**Scenario:** User is answering portion for oatmeal but says "ei oikeastaan en syönyt puuroa".

**Behavior:**
- Detect correction intent ("ei", "en syönyt", "poista").
- Remove oatmeal from queue.
- Confirm: "Poistettu puuro. Jatketaan seuraavaan."
- Move to next item in queue.

### 3.2 User adds items while resolving previous

**Scenario:** While answering about oatmeal, user says "ja kahvia myös".

**Behavior:**
- Parse "kahvia" as new item.
- Add to queue end.
- Acknowledge: "Lisäsin kahvin. Palataan siihen kohta."
- Continue current question about oatmeal.

### 3.3 User answers wrong question

**Scenario:** System asks about portion but user gives a number that looks like disambiguation (e.g., "2").

**Behavior:**
- Context-sensitive: if pending question is PORTIONING and "2" could mean "2 pieces" or "2 dl", try to interpret as portion.
- If truly ambiguous: "Tarkoitatko 2 kappaletta, 2 dl, vai 2 grammaa?"
- If pending question was DISAMBIGUATION and user answers "2", it's clear.

### 3.4 Very long initial message

**Scenario:** "Söin aamiaisella kaurapuuron maidolla ja banaanin ja leipää voilla ja juustoa ja kahvia maidolla ja mehua ja jogurttia marjoilla" (8+ items).

**Behavior:**
- Parse all items into queue.
- Acknowledge: "Havainnoin 8 ruokaa. Käydään ne läpi yksi kerrallaan."
- Process queue normally.
- Consider: batch disambiguation if many items match well (auto-select top-1 if score > threshold).

### 3.5 User says nothing useful

**Scenario:** Empty message, just emojis, or "hmm".

**Behavior:**
- Re-ask current question: "En ymmärtänyt. {rephrase current question}"
- If no pending question: "Kerro mitä söit tällä aterialla."

### 3.6 User says "same as yesterday"

**Scenario:** "Sama kuin eilen" / "copy from yesterday's breakfast".

**Behavior:**
- MVP: not supported. Respond: "En vielä osaa kopioida edellisiä aterioita. Kerro mitä söit."
- Post-MVP: look up previous day's matching meal, pre-fill items.

### 3.7 Conversation timeout / abandonment

**Scenario:** User starts a meal, adds 1 item, never finishes.

**Behavior:**
- State persists in `conversation_state` table.
- When user returns to this meal: restore state, show recap.
- "Viimeksi lisäsit kaurapuuron. Haluatko jatkaa?"

### 3.8 Duplicate items

**Scenario:** User says "banana" twice, or "2 bananas" then "another banana".

**Behavior:**
- If same Fineli ID already exists in meal: "Banaani on jo listalla (125g). Haluatko lisätä toisen annoksen?"
- User can add another or increase the existing one's amount.

---

## 4. Data & Storage

### 4.1 Concurrent editing (two tabs)

**Scenario:** User has the same meal open in two browser tabs.

**Behavior:**
- `version` column on `meals` prevents conflicting updates.
- If version mismatch on write: 409 error.
- UI: "Ateria on muuttunut toisessa välilehdessä. Lataa uudelleen?"
- MVP: accept this limitation. Post-MVP: polling or WebSocket for live sync.

### 4.2 Anonymous user data retention

**Scenario:** Anonymous user's data sitting in DB indefinitely.

**Behavior:**
- Cleanup job: delete anonymous users inactive for 90+ days.
- On first visit: inform user that anonymous data is temporary.
- Encourage account creation for persistence.

### 4.3 Account linking (anonymous → email)

**Scenario:** Anonymous user adds email later.

**Behavior:**
- All data stays on the same `users` row.
- `anonymous_id` remains (for backward compat); `email` is added.
- No data migration needed.

### 4.4 Timezone edge case: midnight

**Scenario:** User logs food at 23:55, but the server is in a different timezone.

**Behavior:**
- Date comes from the frontend (user's local date as `YYYY-MM-DD`).
- Server never computes "today" — the client sends the date.
- No timezone conversion issues.

### 4.5 Very old diary entries

**Scenario:** User exports data from months ago. Fineli may have updated nutrient values.

**Behavior:**
- Export uses `nutrients_per_100g` snapshot stored with the item.
- No re-fetch from Fineli.
- Consistent and reproducible exports.

---

## 5. Export

### 5.1 Export with no data

**Scenario:** User exports a date range with no diary entries.

**Behavior:**
- Generate xlsx with header row only.
- Add info row: "Ei dataa valitulla aikavälillä (14.02.2026 – 28.02.2026)".

### 5.2 Export with partial data

**Scenario:** Day has breakfast (2 items) and lunch (0 items).

**Behavior:**
- Only write breakfast items + subtotal.
- Skip lunch entirely (no empty subtotal row).
- Day total includes only breakfast.

### 5.3 Very large export

**Scenario:** 90 days, 4 meals/day, 5 items/meal = ~1800 rows.

**Behavior:**
- Should be fine for exceljs (can handle 100k+ rows).
- Set a max date range (90 days) to prevent abuse.
- Streaming: generate in memory, send as response.

### 5.4 Nutrient precision

**Scenario:** Computed nutrient has many decimal places (e.g., 457.523809...).

**Behavior:**
- Round to template-specified decimals when writing to Excel.
- Subtotals sum the unrounded values, then round the sum.

### 5.5 Special characters in food names

**Scenario:** Food names with quotes, ampersands, or special chars.

**Behavior:**
- exceljs handles this natively. No escaping needed.
- Test with: `Sieni "shiitake"`, `Maitojuoma & kaurajuoma`.

---

## 6. Fineli API

### 6.1 Fineli API downtime

**Scenario:** `fineli.fi` returns 5xx or times out.

**Behavior:**
- Serve from cache if available (stale data).
- Show: "Hakupalvelu on tilapäisesti pois käytöstä. Yritetään välimuistista."
- If no cache: "Hakupalvelu ei ole käytettävissä. Yritä myöhemmin."
- Retry with exponential backoff (max 3 attempts).

### 6.2 Fineli API rate limiting

**Scenario:** We send too many requests and get 429.

**Behavior:**
- Respect `Retry-After` header if present.
- Client-side rate limiter: max 60 requests/minute.
- Queue excess requests.

### 6.3 Fineli API response changes

**Scenario:** Fineli updates their API, changes field names or structure.

**Behavior:**
- FineliClient maps raw responses to our internal types.
- Changes in raw format only affect the client's mapping layer.
- Stored data (snapshots) is in our format, unaffected.

### 6.4 Fineli search returns too many results

**Scenario:** Generic search like "maito" returns 100+ results.

**Behavior:**
- Our proxy limits to top 5 ranked results.
- Ranking algorithm handles prioritization.
- User can refine: "rasvaton maito" for fewer, better results.

### 6.5 Fineli food has no units

**Scenario:** A food entry in Fineli only has `G` (grams) as a unit.

**Behavior:**
- Only offer gram input: "Kuinka monta grammaa?"
- No piece sizes or volume options shown.

---

## 7. Auth & Security

### 7.1 Session expiry during active conversation

**Scenario:** User's session expires while they're in the middle of logging food.

**Behavior:**
- API returns 401.
- Frontend detects, shows: "Istunto vanhentunut. Kirjaudu sisään jatkaaksesi."
- For anonymous users: try to restore from `anonymousId` in localStorage.
- Conversation state preserved in DB — user resumes after re-auth.

### 7.2 Magic link used from different device

**Scenario:** User requests magic link on phone, clicks it on laptop.

**Behavior:**
- Token is valid regardless of device.
- Account is linked to email, not device.
- Anonymous data from original device needs manual linking (by logging in on that device too).

### 7.3 Personal data (GDPR)

**Scenario:** Food diary is personal health data.

**Behavior:**
- Minimal data collection: only food entries, no health metrics.
- Encryption at rest (database-level).
- User can delete all their data (account deletion endpoint).
- Data export (GDPR Article 15) via the xlsx export.
- Clear privacy policy stating what's stored and for how long.

---

## 8. UI/UX

### 8.1 Slow network

**Scenario:** User on poor mobile connection.

**Behavior:**
- Optimistic message append (show user message immediately).
- Show typing indicator for assistant response.
- If response takes > 5s: show "Haetaan tietoja..." with spinner.
- If > 15s: show retry button.

### 8.2 Browser back/forward

**Scenario:** User hits back button.

**Behavior:**
- Date and meal are in URL params → restored correctly.
- Chat messages reload from server (React Query cache if fresh).
- No data loss.

### 8.3 Screen reader

**Scenario:** Visually impaired user.

**Behavior:**
- Chat uses `role="log"` for message history.
- New messages announced via `aria-live="polite"`.
- Quick reply buttons have clear `aria-label`.
- Food names read correctly (Finnish).

### 8.4 Rapid message sending

**Scenario:** User sends multiple messages quickly before responses arrive.

**Behavior:**
- Queue messages on client side.
- Process sequentially (wait for response before sending next).
- Or: send all, but only last response triggers UI update (batch resolution).

**Implementation:** Disable send button while awaiting response (simpler for MVP).
