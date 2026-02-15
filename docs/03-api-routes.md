# 03 — API Routes

All routes are Next.js App Router API routes under `src/app/api/`.

## Shared Types

```typescript
interface ApiSuccess<T> {
  data: T;
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Auth context extracted from session cookie/header
interface AuthContext {
  userId: string;
  anonymousId?: string;
  email?: string;
  isAnonymous: boolean;
}
```

---

## Auth Routes

### POST `/api/auth/anonymous`

Create an anonymous session. Called on first visit.

```typescript
// No auth required
// Request
interface CreateAnonymousRequest {
  deviceId?: string; // Optional: for linking across tabs
}

// Response 201
interface CreateAnonymousResponse {
  sessionToken: string;
  userId: string;
  anonymousId: string;
}
```

**Behavior:**
- Creates a `users` row with `anonymous_id = uuid_generate_v4()`.
- Returns a signed JWT session token (stored in httpOnly cookie).
- If `deviceId` matches an existing anonymous user, returns existing session.

### POST `/api/auth/magic-link`

Send a magic link email. Can be called by anonymous users to "upgrade" their account.

```typescript
// Auth: optional (anonymous or authenticated)
// Request
interface SendMagicLinkRequest {
  email: string;
}

// Response 202
interface SendMagicLinkResponse {
  message: string; // "Check your email"
}
```

**Behavior:**
- Creates an `auth_tokens` row with a random token, expires in 15 minutes.
- Sends email with link: `{BASE_URL}/api/auth/verify?token={token}`.
- If user is anonymous, the token is linked to the anonymous user's ID (for account merging).

### POST `/api/auth/verify`

Verify a magic link token.

```typescript
// No auth required
// Request
interface VerifyTokenRequest {
  token: string;
}

// Response 200
interface VerifyTokenResponse {
  sessionToken: string;
  userId: string;
  email: string;
}

// Errors
// 400: { code: "TOKEN_EXPIRED", message: "Token has expired" }
// 400: { code: "TOKEN_USED", message: "Token already used" }
// 404: { code: "TOKEN_NOT_FOUND", message: "Invalid token" }
```

---

## Diary Routes

### GET `/api/diary/days`

List diary days in a date range.

```typescript
// Auth: required
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
// Both params required

// Response 200
interface ListDaysResponse {
  days: {
    id: string;
    date: string;
    mealCount: number;
    itemCount: number;
    createdAt: string;
  }[];
}

// Errors
// 400: invalid date format or range
// 401: not authenticated
```

### GET `/api/diary/days/:date`

Get a single day with all meals and items.

```typescript
// Auth: required
// Params: date = YYYY-MM-DD

// Response 200
interface GetDayResponse {
  day: {
    id: string;
    date: string;
    meals: {
      id: string;
      mealType: MealType;
      customName: string | null;
      sortOrder: number;
      version: number;
      items: {
        id: string;
        fineliFoodId: number;
        fineliNameFi: string;
        fineliNameEn: string | null;
        portionAmount: number;
        portionUnitCode: string | null;
        portionUnitLabel: string | null;
        portionGrams: number;
        computedNutrients: Record<string, number>;
        sortOrder: number;
      }[];
      totals: Record<string, number>;
    }[];
    dayTotals: Record<string, number>;
  };
}

// If day doesn't exist, returns empty structure (not 404)
// Response 200 (empty day)
// { day: { id: null, date: "2026-02-14", meals: [], dayTotals: {} } }
```

### POST `/api/diary/days/:date/meals`

Create a new meal for a day. Auto-creates the diary_day if needed.

```typescript
// Auth: required
// Request
interface CreateMealRequest {
  mealType: MealType;
  customName?: string; // Required when mealType = 'other'
}

// Response 201
interface CreateMealResponse {
  meal: {
    id: string;
    diaryDayId: string;
    mealType: MealType;
    customName: string | null;
    sortOrder: number;
    version: number;
  };
}

// Errors
// 400: invalid meal type, or 'other' without customName
```

### PUT `/api/diary/meals/:id`

Update meal metadata.

```typescript
// Auth: required
// Request
interface UpdateMealRequest {
  mealType?: MealType;
  customName?: string;
  version: number; // Must match current version (optimistic lock)
}

// Response 200: updated meal
// Errors
// 404: meal not found or not owned by user
// 409: { code: "VERSION_CONFLICT", message: "Meal was modified" }
```

### DELETE `/api/diary/meals/:id`

Soft-delete a meal and all its items.

```typescript
// Auth: required
// Response 204 (no content)
// Errors: 404 if not found/owned
```

---

## Meal Item Routes

### POST `/api/diary/meals/:id/items`

Add a resolved food item to a meal. Called by the conversation engine after resolution.

```typescript
// Auth: required
// Request
interface AddMealItemRequest {
  fineliFoodId: number;
  fineliNameFi: string;
  fineliNameEn?: string;
  userText?: string;
  portionAmount: number;
  portionUnitCode?: string;
  portionUnitLabel?: string;
  portionGrams: number;
  nutrientsPer100g: Record<string, number>;
}

// Response 201
interface AddMealItemResponse {
  item: {
    id: string;
    fineliFoodId: number;
    fineliNameFi: string;
    portionAmount: number;
    portionUnitCode: string | null;
    portionUnitLabel: string | null;
    portionGrams: number;
    computedNutrients: Record<string, number>;
    sortOrder: number;
  };
}
```

### PUT `/api/diary/items/:id`

Update an item (typically to change portion).

```typescript
// Auth: required
// Request
interface UpdateMealItemRequest {
  portionAmount?: number;
  portionUnitCode?: string;
  portionUnitLabel?: string;
  portionGrams?: number; // If grams changes, recompute nutrients
}

// Response 200: updated item with recomputed nutrients
```

### DELETE `/api/diary/items/:id`

Soft-delete a meal item.

```typescript
// Auth: required
// Response 204
```

---

## Chat Routes

### POST `/api/chat/message`

Send a user message and receive the assistant's response. This is the main conversation endpoint.

```typescript
// Auth: required
// Request
interface SendChatMessageRequest {
  mealId: string;
  message: string;
}

// Response 200
interface SendChatMessageResponse {
  assistantMessage: {
    content: string;
    metadata?: {
      questionType?: 'disambiguation' | 'portion' | 'preparation' | 'completion';
      options?: {
        // For disambiguation
        foods?: { id: number; nameFi: string; nameEn?: string }[];
        // For portion selection
        portions?: { key: string; label: string; grams: number }[];
      };
    };
  };
  /** Current conversation state summary */
  state: {
    unresolvedCount: number;
    resolvedCount: number;
    activeItemText: string | null;
    isComplete: boolean;
  };
  /** Items resolved by this message (to add to items list) */
  resolvedItems?: {
    id: string;
    fineliFoodId: number;
    fineliNameFi: string;
    portionGrams: number;
    computedNutrients: Record<string, number>;
  }[];
}

// Errors
// 400: empty message
// 404: meal not found
```

**Behavior:**
1. Load current `conversation_state` for this meal (or create new).
2. Parse user message (intent detection: new items, answer, correction, done).
3. Run conversation engine step (resolve items, generate next question).
4. Store updated state, store both messages.
5. If items were resolved, insert into `meal_items` and return them.

### GET `/api/chat/state/:mealId`

Get current conversation state for a meal.

```typescript
// Auth: required
// Response 200
interface GetChatStateResponse {
  mealId: string;
  messages: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }[];
  state: {
    unresolvedCount: number;
    resolvedCount: number;
    activeItemText: string | null;
    isComplete: boolean;
  };
}
```

---

## Fineli Routes

### GET `/api/fineli/search`

Proxy Fineli food search with caching and result ranking.

```typescript
// Auth: required
// Query: ?q=banaani&lang=fi&limit=10

// Response 200
interface FineliSearchResponse {
  foods: {
    id: number;
    nameFi: string;
    nameEn: string | null;
    type: string;      // 'FOOD' | 'DISH'
    units: {
      code: string;    // 'KPL_S', 'KPL_M', 'KPL_L', 'DL', 'G', etc.
      labelFi: string;
      labelEn: string;
      massGrams: number;
    }[];
    // Summary nutrients for quick display
    energyKj: number;
    fat: number;
    protein: number;
    carbohydrate: number;
  }[];
  query: string;
  cached: boolean;
}

// Errors
// 400: missing q parameter
// 502: Fineli API unavailable (returns stale cache if available)
```

### GET `/api/fineli/food/:id`

Get full food details with all 55 nutrient values.

```typescript
// Auth: required

// Response 200
interface FineliGetFoodResponse {
  food: {
    id: number;
    nameFi: string;
    nameEn: string | null;
    type: string;
    units: {
      code: string;
      labelFi: string;
      labelEn: string;
      massGrams: number;
    }[];
    /** All 55 nutrients, keyed by component code */
    nutrients: Record<string, number>;
  };
  cached: boolean;
}
```

---

## Export Routes

### GET `/api/export/xlsx`

Generate and download a Fineli-style `.xlsx` export.

```typescript
// Auth: required
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD

// Response 200
// Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// Content-Disposition: attachment; filename="ruokapaivakirja_2026-02-01_2026-02-14.xlsx"
// Body: binary xlsx data

// Errors
// 400: invalid date range (from > to, or range > 90 days)
// 404: no data in range (returns empty xlsx with header row + info message)
```

---

## Error Response Convention

All error responses follow this structure:

```typescript
// HTTP 4xx or 5xx
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable description",
    "details": { /* optional structured data */ }
  }
}
```

Common error codes:

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Not your resource |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Invalid request body/params |
| `VERSION_CONFLICT` | 409 | Optimistic lock failure |
| `FINELI_UNAVAILABLE` | 502 | Fineli API down, no cache |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
