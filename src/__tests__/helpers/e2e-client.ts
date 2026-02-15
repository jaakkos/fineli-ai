/**
 * E2E test HTTP client with cookie management.
 *
 * Wraps fetch() to:
 * - Track Set-Cookie headers from the server
 * - Send stored cookies on subsequent requests
 * - Provide typed JSON helpers for each API route
 *
 * Usage:
 *   const client = new E2EClient('http://localhost:3000');
 *   await client.createAnonymousSession();
 *   const meal = await client.createMeal('2026-02-15', 'breakfast');
 *   const chat = await client.sendMessage(meal.id, 'kaurapuuroa');
 */

export interface E2EResponse<T = unknown> {
  status: number;
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  raw: Response;
}

export class E2EClient {
  private baseUrl: string;
  private cookies: Map<string, string> = new Map();

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  // -------------------------------------------------------------------------
  // Cookie management
  // -------------------------------------------------------------------------

  private extractCookies(response: Response): void {
    const setCookie = response.headers.getSetCookie?.();
    if (setCookie) {
      for (const header of setCookie) {
        const [nameValue] = header.split(';');
        const eqIdx = nameValue.indexOf('=');
        if (eqIdx > 0) {
          const name = nameValue.slice(0, eqIdx).trim();
          const value = nameValue.slice(eqIdx + 1).trim();
          this.cookies.set(name, value);
        }
      }
    }
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  // -------------------------------------------------------------------------
  // Raw HTTP
  // -------------------------------------------------------------------------

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<E2EResponse<T>> {
    const headers: Record<string, string> = {};
    if (this.cookies.size > 0) {
      headers['Cookie'] = this.cookieHeader();
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });

    this.extractCookies(res);

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return { status: res.status, ok: res.ok, raw: res };
    }

    const json = await res.json();
    return {
      status: res.status,
      ok: res.ok,
      data: json.data as T,
      error: json.error,
      raw: res,
    };
  }

  async get<T = unknown>(path: string): Promise<E2EResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<E2EResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<E2EResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async del<T = unknown>(path: string): Promise<E2EResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  async createAnonymousSession(): Promise<{ userId: string; anonymousId: string }> {
    const res = await this.post<{ userId: string; anonymousId: string }>(
      '/api/auth/anonymous'
    );
    if (!res.ok || !res.data) {
      throw new Error(`Failed to create session: ${res.status} ${res.error?.message}`);
    }
    return res.data;
  }

  // -------------------------------------------------------------------------
  // Diary
  // -------------------------------------------------------------------------

  async getDiaryDay(date: string) {
    return this.get<{
      id: string | null;
      date: string;
      meals: Array<{
        id: string;
        mealType: string;
        items: Array<{
          id: string;
          fineliNameFi: string;
          portionGrams: number;
          computedNutrients: Record<string, number>;
        }>;
        totals: Record<string, number>;
      }>;
      dayTotals: Record<string, number>;
    }>(`/api/diary/days/${date}`);
  }

  async createMeal(date: string, mealType: string, customName?: string) {
    const res = await this.post<{
      id: string;
      diaryDayId: string;
      mealType: string;
    }>(`/api/diary/days/${date}/meals`, { mealType, customName });
    if (!res.ok || !res.data) {
      throw new Error(`Failed to create meal: ${res.status} ${res.error?.message}`);
    }
    return res.data;
  }

  async deleteItem(itemId: string) {
    return this.del(`/api/diary/items/${itemId}`);
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  async sendMessage(mealId: string, message: string) {
    return this.post<{
      assistantMessage: string;
      questionMetadata?: {
        type: string;
        options?: Array<{ key: string; label: string; value: unknown }>;
      };
      ai?: {
        parsed: boolean;
        responded: boolean;
        suggestions: unknown[];
      };
    }>('/api/chat/message', { mealId, message });
  }

  async getChatState(mealId: string) {
    return this.get<{
      state: unknown;
      messages: Array<{
        id: string;
        role: string;
        content: string;
        metadata: unknown;
        createdAt: string;
      }>;
    }>(`/api/chat/state/${mealId}`);
  }

  // -------------------------------------------------------------------------
  // Fineli
  // -------------------------------------------------------------------------

  async searchFineli(query: string) {
    return this.get<Array<{ id: number; nameFi: string }>>(
      `/api/fineli/search?q=${encodeURIComponent(query)}`
    );
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  async exportXlsx(from: string, to: string) {
    return this.request(
      'GET',
      `/api/export/xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
  }

  // -------------------------------------------------------------------------
  // Util
  // -------------------------------------------------------------------------

  clearCookies(): void {
    this.cookies.clear();
  }

  hasCookie(name: string): boolean {
    return this.cookies.has(name);
  }
}
