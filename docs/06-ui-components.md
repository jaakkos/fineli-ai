# 06 — UI Components

## Page Layout

Single-page app with three zones: top bar, chat panel, and meal items panel.

### Desktop (≥ 1024px)

```
┌─────────────────────────────────────────────────────────────────┐
│ TopBar: [Logo/Title]  [◄ DatePicker ►]  [MealTabs]  [Export]   │
├───────────────────────────────────┬─────────────────────────────┤
│                                   │                             │
│         ChatPanel                 │      MealItemsPanel         │
│                                   │                             │
│  ┌─────────────────────────────┐  │  ┌───────────────────────┐  │
│  │ Assistant: Mitä söit?       │  │  │ Aamiainen (3 items)   │  │
│  │ User: Puuroa ja banaanin    │  │  │ ┌───────────────────┐ │  │
│  │ Assistant: Kumpi puuro?     │  │  │ │ Kaurapuuro   200g │ │  │
│  │   [1] [2] [3]              │  │  │ │ Maito, kevyt 2dl  │ │  │
│  │ User: 1                     │  │  │ │ Banaani      125g │ │  │
│  │ Assistant: Kuinka paljon?   │  │  │ └───────────────────┘ │  │
│  │   [pieni] [keski] [iso]    │  │  │                       │  │
│  └─────────────────────────────┘  │  │ ┌─ NutrientSummary ─┐ │  │
│                                   │  │ │ Energia: 1450 kJ   │ │  │
│  ┌─────────────────────────────┐  │  │ │ Proteiini: 12.3g   │ │  │
│  │ [Type what you ate...]  [→] │  │  │ │ Rasva: 4.2g        │ │  │
│  └─────────────────────────────┘  │  │ │ Hiilihyd: 52.1g    │ │  │
│                                   │  │ └─────────────────────┘ │  │
├───────────────────────────────────┴─────────────────────────────┤
```

### Mobile (< 768px)

```
┌─────────────────────────┐
│ [◄] 14.2.2026 [►]      │
│ [Aam] [Lou] [Päiv] [Väl]│
├─────────────────────────┤
│                         │
│   ChatPanel (full)      │
│   - messages            │
│   - quick replies       │
│                         │
│                         │
├─────────────────────────┤
│ [What you ate...]  [→]  │
├─────────────────────────┤
│ ▲ 3 items · 1450 kJ    │  ← Tappable: opens bottom sheet
└─────────────────────────┘
```

### Breakpoints

| Name | Width | Layout |
|------|-------|--------|
| `mobile` | < 640px | Stacked, bottom sheet for items |
| `tablet` | 640–1023px | Stacked, collapsible drawer for items |
| `desktop` | ≥ 1024px | Side-by-side, fixed 320px sidebar |

---

## Component Specifications

### DatePicker

Date navigation for selecting the diary day.

```typescript
interface DatePickerProps {
  value: string;                    // YYYY-MM-DD
  onChange: (date: string) => void;
  locale?: string;                  // default: 'fi-FI'
}
```

**Behavior:**
- Shows current date in `dd.mm.yyyy` format.
- Left/right arrows for previous/next day.
- Click on date opens a calendar dropdown.
- "Tänään" button jumps to today.
- Date is stored in URL: `?date=2026-02-14`.

### MealSelector

Tabs or segmented control for meal types.

```typescript
interface MealSelectorProps {
  value: MealType;
  onChange: (meal: MealType) => void;
  meals: {
    type: MealType;
    label: string;
    itemCount: number;
  }[];
}
```

**Behavior:**
- Shows tabs: `Aamiainen (2)`, `Lounas`, `Päivällinen`, `Välipala`, `+ Muu`.
- Badge shows item count per meal.
- "Muu" opens a text input for custom meal name.
- Switching meal loads that meal's chat and items.
- Selected meal stored in URL: `?meal=breakfast`.

### ChatPanel

The main conversation area.

```typescript
interface ChatPanelProps {
  messages: ChatMessageData[];
  onSendMessage: (text: string) => void;
  onOptionSelect: (messageId: string, optionKey: string) => void;
  isLoading: boolean;
  isDisabled: boolean;
  placeholder?: string;           // default: "Kerro mitä söit..."
}

interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  state?: 'sending' | 'sent' | 'error';
  options?: ChatMessageOption[];  // Interactive elements
}

interface ChatMessageOption {
  type: 'disambiguation' | 'portion' | 'confirmation';
  items: {
    key: string;
    label: string;
    sublabel?: string;            // e.g., "(125g)" for portions
  }[];
  selected?: string;              // Already selected key (for history)
}
```

**Behavior:**
- Auto-scrolls to newest message.
- Shows typing indicator while waiting for response.
- Options (disambiguation, portions) render as clickable buttons below the message.
- Once an option is selected, buttons become disabled and show the selection.
- Input is disabled while a response is loading.
- On send: optimistic append of user message → API call → append assistant response.
- Empty state: welcome message "Kerro mitä söit tällä aterialla."

**Virtualization:** Use `@tanstack/react-virtual` if message count exceeds 50 (unlikely in single meal, but safe).

### ChatMessage

Single message bubble.

```typescript
interface ChatMessageProps {
  message: ChatMessageData;
  onOptionSelect?: (key: string) => void;
  showTimestamp?: boolean;
}
```

**Rendering:**
- User messages: right-aligned, primary color background.
- Assistant messages: left-aligned, gray background.
- System messages: centered, muted text.
- Error state: red border + retry button.
- Options render below the message text as a grid of buttons.

### QuickReplyButtons

Reusable button group for disambiguation and portion selection.

```typescript
interface QuickReplyButtonsProps {
  options: {
    key: string;
    label: string;
    sublabel?: string;
  }[];
  onSelect: (key: string) => void;
  disabled?: boolean;
  selectedKey?: string;           // Highlight selected
  layout?: 'horizontal' | 'vertical'; // default: depends on option count
}
```

**Behavior:**
- ≤ 3 options: horizontal layout (side by side).
- > 3 options: vertical list.
- Keyboard: arrow keys to navigate, Enter to select.
- `aria-role="group"` with labeled buttons.

### MealItemsList

Shows resolved items for the current meal.

```typescript
interface MealItemsListProps {
  items: MealItemDisplay[];
  onEditItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  isLoading: boolean;
}

interface MealItemDisplay {
  id: string;
  foodName: string;
  portionLabel: string;           // e.g., "keskikokoinen" or "2 dl"
  grams: number;
  energyKj: number;
  energyKcal: number;
}
```

**Behavior:**
- Shows each item as a card with food name, portion, and quick energy display.
- Swipe-to-delete on mobile; hover shows delete icon on desktop.
- Tap/click to edit (opens portion edit inline).
- Empty state: "Ei vielä ruokia. Kerro chatissa mitä söit."

### MealItemCard

Single item in the items list.

```typescript
interface MealItemCardProps {
  item: MealItemDisplay;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;              // true on mobile
}
```

**Layout:**
```
┌────────────────────────────────────┐
│ Banaani, kuorittu            [✎][✕]│
│ keskikokoinen · 125g · 457 kJ     │
└────────────────────────────────────┘
```

### NutrientSummary

Collapsible summary of key nutrients for the current meal.

```typescript
interface NutrientSummaryProps {
  nutrients: Record<string, number>;  // Meal totals
  expanded?: boolean;
  onToggle?: () => void;
}
```

**Default visible nutrients (collapsed):**
- Energia (kJ / kcal)
- Proteiini (g)
- Rasva (g)
- Hiilihydraatit (g)
- Kuitu (g)

**Expanded:** Shows all 55 nutrients grouped by category (energy, macros, fat details, sugars, minerals, vitamins).

### ExportButton

Triggers xlsx download with optional date range picker.

```typescript
interface ExportButtonProps {
  defaultDate: string;            // Current diary date
  onExport: (from: string, to: string) => Promise<void>;
  isExporting: boolean;
}
```

**Behavior:**
- Default: export current day.
- Click opens a dropdown/dialog with date range picker.
- Shows progress indicator during generation.
- Downloads file: `ruokapaivakirja_YYYY-MM-DD_YYYY-MM-DD.xlsx`.

---

## State Management

### Where State Lives

| State | Location | Rationale |
|-------|----------|-----------|
| Selected date | URL param `?date=` | Shareable, back/forward, bookmark |
| Selected meal | URL param `?meal=` | Same |
| Chat messages | Server → React Query cache | Source of truth on server |
| Meal items | Server → React Query cache | Derived from conversation |
| Conversation state | Server (DB) | Persists across refreshes |
| UI state (drawer open, etc.) | React local state | Ephemeral |
| Export dialog state | React local state | Ephemeral |

### React Query Setup

```typescript
// Query keys
const queryKeys = {
  day: (date: string) => ['diary', 'day', date] as const,
  meals: (date: string) => ['diary', 'meals', date] as const,
  chatMessages: (mealId: string) => ['chat', 'messages', mealId] as const,
  chatState: (mealId: string) => ['chat', 'state', mealId] as const,
  fineliSearch: (q: string) => ['fineli', 'search', q] as const,
};
```

### Optimistic Updates

- **Send message:** Append user message immediately, show typing indicator, then append assistant response.
- **Delete item:** Remove from list immediately, rollback on error.
- **Add item (via resolution):** Append to items list when `resolvedItems` comes back in chat response.

---

## Accessibility

| Feature | Implementation |
|---------|----------------|
| Chat messages | `role="log"`, `aria-live="polite"` |
| Disambiguation buttons | `role="listbox"`, arrow key navigation |
| Portion buttons | `role="group"`, `aria-label="Valitse annoskoko"` |
| New message announcement | `aria-live="polite"` on message container |
| Focus after send | Returns to input field |
| Focus after response | Optionally moves to first button option |
| Keyboard shortcuts | Enter to send, Escape to cancel edit |
| Color contrast | WCAG AA minimum (4.5:1 for text) |

---

## Loading & Error States

| Scenario | UI Treatment |
|----------|-------------|
| Sending message | Input disabled, typing indicator in chat |
| Waiting for Fineli search | Skeleton cards in message options |
| Network error on send | Error banner on message, retry button |
| Fineli API down | "Hakupalvelu ei ole käytettävissä. Yritä hetken kuluttua." |
| Export generating | Button shows spinner + "Luodaan..." |
| Empty meal | Friendly empty state with hint text |
| Empty day | Show meal tabs normally (user can start any meal) |
