# 05 — Conversation Engine

## Overview

The conversation engine is a **deterministic state machine** that manages the flow of resolving natural-language food descriptions into structured Fineli entries with exact gram amounts. No LLM is required for the conversation logic itself.

---

## Item Resolution Pipeline

### State Diagram

```
                    ┌─────────────────────────────────────┐
                    │          USER MESSAGE                │
                    └─────────────────────────────────────┘
                                    │
                              parseMealText()
                                    │
                                    ▼
┌──────────┐    2+ matches    ┌────────────────┐   food+grams known    ┌──────────┐
│  PARSED  │ ───────────────► │ DISAMBIGUATING │ ────────────────────► │ RESOLVED │
└──────────┘                  └────────────────┘                       └──────────┘
     │                               │                                      ▲
     │ 0 matches                     │ user selects food                    │
     ▼                               ▼                                      │
┌──────────┐                  ┌────────────────┐   user gives amount        │
│ NO_MATCH │                  │  PORTIONING    │ ───────────────────────────┘
└──────────┘                  └────────────────┘
     │                               │
     │ retry / rephrase              │ user corrects food
     └───────────────────────────────┘
```

### State Definitions

| State | Entry Condition | Data Collected | Exit |
|-------|----------------|----------------|------|
| **PARSED** | Text parsed into item | `rawText`, optional `inferredAmount` | → DISAMBIGUATING (2+ matches) or PORTIONING (1 match) or RESOLVED (1 match + grams known) or NO_MATCH (0 matches) |
| **DISAMBIGUATING** | 2+ Fineli candidates | `candidates[]` | → PORTIONING (user selects) or RESOLVED (user selects + grams known) |
| **PORTIONING** | Food chosen, need grams | `selectedFood`, `availableUnits[]` | → RESOLVED (user provides amount) |
| **RESOLVED** | Food + grams known | `fineliFoodId`, `grams`, `nutrients` | Terminal state |
| **NO_MATCH** | 0 Fineli results | `rawText`, `searchAttempts` | → PARSED (user rephrases) or skipped |

### Transition Rules

| From | To | Trigger |
|------|----|---------|
| PARSED | DISAMBIGUATING | Fineli search returns 2+ results |
| PARSED | PORTIONING | Fineli search returns exactly 1 result |
| PARSED | RESOLVED | 1 result + amount already parsed in grams |
| PARSED | NO_MATCH | Fineli search returns 0 results |
| DISAMBIGUATING | PORTIONING | User selects a candidate |
| DISAMBIGUATING | RESOLVED | User selects + grams were already provided |
| DISAMBIGUATING | PARSED | User says "none of these" or provides new description |
| PORTIONING | RESOLVED | User provides amount (converted to grams) |
| PORTIONING | PARSED | User says "wrong food" / corrects the food |
| NO_MATCH | PARSED | User rephrases |

---

## Conversation Manager

### Unresolved Queue

Items are processed one at a time in FIFO order:

```
Queue: [Item_A (PORTIONING), Item_B (DISAMBIGUATING), Item_C (PARSED)]
             ↑ ACTIVE
```

- The **active item** is the one currently being asked about.
- When an item reaches RESOLVED, it's removed from the queue and the next item becomes active.
- New items are appended to the end of the queue.

### Question Priority (for the active item)

1. **Disambiguation** — if item is in DISAMBIGUATING state
2. **Portion** — if item is in PORTIONING state
3. **No-match retry** — if item is in NO_MATCH state
4. **Completion check** — when queue is empty (all resolved or none left)

### Adding Items Mid-Conversation

When a user sends new food items while previous items are still being resolved:

```
State: Active = "oatmeal" (PORTIONING)
User:  "oh and also some coffee"

Result:
  1. Parse "coffee" → new PARSED item
  2. Append to queue: [..., Coffee (PARSED)]
  3. Continue asking about oatmeal (still active)
  4. Assistant says: "Lisäsin kahvin listalle. Palaan siihen seuraavaksi.
     Kuinka paljon kaurapuuroa söit?"
```

### "Done" / "That's All" Handling

| Situation | Behavior |
|-----------|----------|
| All items RESOLVED | Confirm: "Kaikki tallennettu! Söitkö muuta?" |
| Unresolved items remain | "Sinulla on vielä X ratkaisematta. Haluatko jatkaa vai ohittaa?" |
| User says "skip" for an item | Remove from queue, log as skipped |
| User says "done" with unresolved | Save resolved items, discard unresolved |

### Unclear Answer Re-prompting

- Track `retryCount` per question (max 2 retries).
- On unclear answer: rephrase the question with more specific guidance.
- After 2 retries: offer to skip the item or show default options as buttons.

---

## Message Parsing

### parseMealText(text) → ParsedItem[]

Extracts food items from a user's natural language message.

#### Splitting Strategy

```typescript
// Split on Finnish and English conjunctions/separators
const ITEM_SPLITTERS = /(?:\s*,\s*|\s+ja\s+|\s+sekä\s+|\s+and\s+|\s+with\s+|\s*\+\s*)/i;

// Extract inline amounts
const AMOUNT_PATTERN = /^(\d+(?:[.,]\d+)?)\s*(g|kg|dl|ml|l|kpl|rkl|tl|annos|viipale(?:tta)?)?\s+(.+)$/i;
const AMOUNT_SUFFIX_PATTERN = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(g|kg|dl|ml|l)$/i;
```

#### Examples

| Input | Parsed Output |
|-------|---------------|
| `"kaurapuuroa maidolla ja banaani"` | `[{text: "kaurapuuroa"}, {text: "maitoa"}, {text: "banaani"}]` |
| `"120g kanaa ja riisiä"` | `[{text: "kanaa", amount: 120, unit: "g"}, {text: "riisiä"}]` |
| `"2 dl maitoa"` | `[{text: "maitoa", amount: 2, unit: "dl"}]` |
| `"leipä, juusto, kahvi"` | `[{text: "leipä"}, {text: "juusto"}, {text: "kahvi"}]` |
| `"banaani"` | `[{text: "banaani"}]` |

### parseAnswer(text, expectedType) → ParsedAnswer

Interprets user responses to specific question types.

#### Disambiguation Answers

| Input | Parsed As |
|-------|-----------|
| `"1"`, `"eka"`, `"ensimmäinen"` | `{ type: 'selection', index: 0 }` |
| `"2"`, `"toka"`, `"toinen"` | `{ type: 'selection', index: 1 }` |
| `"3"` – `"5"` | `{ type: 'selection', index: N-1 }` |
| `"raaka banaani"` | `{ type: 'clarification', text: 'raaka banaani' }` → new search |
| `"ei mikään näistä"` | `{ type: 'reject' }` |

#### Portion Answers

| Input | Parsed As |
|-------|-----------|
| `"120g"`, `"120 g"`, `"120 grammaa"` | `{ type: 'weight', grams: 120 }` |
| `"keskikokoinen"`, `"medium"` | `{ type: 'portion_size', key: 'KPL_M' }` |
| `"pieni"`, `"small"` | `{ type: 'portion_size', key: 'KPL_S' }` |
| `"iso"`, `"large"` | `{ type: 'portion_size', key: 'KPL_L' }` |
| `"2 dl"`, `"2dl"` | `{ type: 'volume', value: 2, unit: 'dl' }` |
| `"puolikas"`, `"puoli"` | `{ type: 'fraction', value: 0.5 }` → applied to reference portion |
| `"1.5 kpl"` | `{ type: 'count', value: 1.5, unit: 'kpl' }` |

#### Correction Detection

| Input | Parsed As |
|-------|-----------|
| `"ei, tarkoitin X"`, `"actually X"` | `{ type: 'correction', newText: 'X' }` |
| `"poista banaani"`, `"remove banana"` | `{ type: 'remove', targetText: 'banaani' }` |
| `"vaihda 150g"`, `"change to 150g"` | `{ type: 'update_portion', grams: 150 }` |

#### Intent Classification Priority

When a message could be interpreted multiple ways:

1. Check if it matches expected answer format (disambiguation number, portion)
2. Check if it's a correction keyword ("ei", "vaihda", "poista")
3. Check if it contains new food items (has food-like nouns)
4. Default: treat as answer to the pending question

---

## Question Templates

All questions are in Finnish (primary) with English as a configurable fallback.

### Disambiguation

```
"Löysin useita vaihtoehtoja hakusanalle '{item}':
  1) {candidate1.nameFi}
  2) {candidate2.nameFi}
  3) {candidate3.nameFi}
Kumman tarkoitat? Vastaa numerolla 1–{n}."
```

Rendered as a message with clickable numbered buttons.

### Portion — When piece sizes available

```
"Kuinka paljon: {food.nameFi}?
  • pieni ({units.KPL_S.mass}g)
  • keskikokoinen ({units.KPL_M.mass}g)
  • iso ({units.KPL_L.mass}g)
  • tai grammoina (esim. 120g)"
```

Rendered with quick-reply buttons for each size + free text input.

### Portion — When volume units available

```
"Kuinka paljon: {food.nameFi}?
Vastaa tilavuutena (esim. 2 dl) tai grammoina."
```

### Portion — Weight only

```
"Kuinka monta grammaa: {food.nameFi}?"
```

### No Match

```
"En löytänyt '{item}' Fineli-tietokannasta.
Voisitko tarkentaa? Kokeile esimerkiksi tuotteen suomenkielistä nimeä."
```

### Completion Check

```
"Lisätty: {food.nameFi} ({portion}). Söitkö muuta tällä aterialla?"
```

### Confirmation (item added)

```
"✓ {food.nameFi}, {portionLabel} ({grams}g)"
```

(shown inline, not as a question)

---

## Missing Items Detection

Common food pairings where the system proactively asks about likely companions:

```typescript
const FOOD_COMPANIONS: Record<string, string[]> = {
  'puuro': ['maito', 'marja', 'hunaja'],          // porridge → milk, berries, honey
  'kaurapuuro': ['maito', 'marja', 'hunaja'],
  'kahvi': ['maito', 'sokeri'],                     // coffee → milk, sugar
  'tee': ['hunaja', 'sokeri'],                      // tea → honey, sugar
  'leipä': ['voi', 'juusto', 'leikkele'],           // bread → butter, cheese, cold cuts
  'salaatti': ['kastike', 'öljy'],                   // salad → dressing, oil
  'pasta': ['kastike'],                              // pasta → sauce
  'riisi': ['kastike', 'liha'],                      // rice → sauce, meat
};
```

**Logic:** After the primary items are resolved, if any match a key in `FOOD_COMPANIONS`, ask:
```
"Käytitkö {companion} {primaryFood} kanssa?"
```
Only ask once per companion per meal. User can say "ei" to skip.

---

## State Data Structures

```typescript
type ItemState = 'PARSED' | 'DISAMBIGUATING' | 'PORTIONING' | 'RESOLVED' | 'NO_MATCH';

type QuestionType = 'disambiguation' | 'portion' | 'no_match_retry' | 'completion' | 'companion';

interface ParsedItem {
  id: string;                    // UUID
  rawText: string;               // Original user text for this item
  inferredAmount?: {
    value: number;
    unit: string;                // 'g', 'dl', 'kpl', etc.
  };
  state: ItemState;
  fineliCandidates?: FineliFood[];  // Set during DISAMBIGUATING
  selectedFood?: FineliFood;        // Set after disambiguation
  portionGrams?: number;            // Set after PORTIONING → RESOLVED
  portionUnitCode?: string;
  portionUnitLabel?: string;
  createdAt: number;
  updatedAt: number;
}

interface PendingQuestion {
  id: string;                    // UUID
  itemId: string;                // Which ParsedItem this is about
  type: QuestionType;
  templateKey: string;           // e.g., 'disambiguation', 'portion_pieces'
  templateParams: Record<string, string | number>;
  options?: QuestionOption[];    // For button rendering
  retryCount: number;
  askedAt: number;
}

interface QuestionOption {
  key: string;                   // e.g., '1', 'KPL_M', 'skip'
  label: string;                 // Display text
  value: unknown;                // Structured data (food ID, grams, etc.)
}

interface ConversationState {
  sessionId: string;             // UUID
  mealId: string;
  items: ParsedItem[];           // All items (any state)
  unresolvedQueue: string[];     // ParsedItem IDs in resolution order
  activeItemId: string | null;   // Currently being questioned
  pendingQuestion: PendingQuestion | null;
  companionChecks: string[];     // Already-asked companion food keys
  isComplete: boolean;           // User said "done" or all resolved
  language: 'fi' | 'en';
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  parsedIntent?: {
    type: 'add_items' | 'answer' | 'correction' | 'removal' | 'done' | 'unclear';
    data: unknown;
  };
}
```

---

## Engine Step Function

The core function that processes each user message:

```typescript
interface EngineStepResult {
  assistantMessage: string;
  updatedState: ConversationState;
  resolvedItems: ResolvedItem[];  // Items that just became RESOLVED
  questionMetadata?: {
    type: QuestionType;
    options?: QuestionOption[];
  };
}

async function processMessage(
  userMessage: string,
  currentState: ConversationState,
  fineliClient: FineliClient,
  portionConverter: PortionConverter
): Promise<EngineStepResult> {
  // 1. Determine intent
  const intent = classifyIntent(userMessage, currentState.pendingQuestion);

  // 2. Based on intent:
  switch (intent.type) {
    case 'add_items':
      // Parse new items, search Fineli for each, add to queue
      break;
    case 'answer':
      // Apply answer to active item (disambiguation selection or portion)
      break;
    case 'correction':
      // Find target item, revert state, re-search or update
      break;
    case 'removal':
      // Remove item from queue
      break;
    case 'done':
      // Mark conversation complete
      break;
    case 'unclear':
      // Re-ask with clearer phrasing
      break;
  }

  // 3. Advance queue: resolve any auto-resolvable items
  // 4. Generate next question for active item (or completion check)
  // 5. Return response
}
```

---

## Conversation Flow Example

```
User: "Söin aamiaisella puuroa maidolla ja banaanin"

Engine:
  1. parseMealText → ["puuro", "maito", "banaani"]
  2. Search each:
     - "puuro" → 8 results → DISAMBIGUATING
     - "maito" → 12 results → DISAMBIGUATING
     - "banaani" → 15 results → DISAMBIGUATING
  3. Active: puuro (first in queue)