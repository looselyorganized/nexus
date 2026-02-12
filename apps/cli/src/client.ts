import { loadGlobalConfigOrThrow, loadProjectConfigOrThrow, getServerUrl } from './config';

export class NexusApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'NexusApiError';
  }
}

export class NexusClient {
  private serverUrl: string;
  private token?: string;
  private projectId?: string;

  constructor(opts: { serverUrl: string; token?: string; projectId?: string }) {
    this.serverUrl = opts.serverUrl.replace(/\/$/, '');
    this.token = opts.token;
    this.projectId = opts.projectId;
  }

  static authenticated(): NexusClient {
    const config = loadGlobalConfigOrThrow();
    return new NexusClient({ serverUrl: config.serverUrl, token: config.token });
  }

  static withProject(): NexusClient {
    const global = loadGlobalConfigOrThrow();
    const project = loadProjectConfigOrThrow();
    return new NexusClient({
      serverUrl: global.serverUrl,
      token: global.token,
      projectId: project.projectId,
    });
  }

  static unauthenticated(): NexusClient {
    return new NexusClient({ serverUrl: getServerUrl() });
  }

  private async request<T>(path: string, options: RequestInit = {}, requireAuth = true): Promise<T> {
    if (requireAuth && !this.token) {
      throw new NexusApiError('Not authenticated', 401);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const url = `${this.serverUrl}${path}`;
    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      let body: Record<string, any> | undefined;
      try {
        body = await response.json() as Record<string, any>;
      } catch {
        // Response may not be JSON
      }
      throw new NexusApiError(
        body?.error?.message ?? body?.message ?? `Request failed: ${response.status}`,
        response.status,
        body?.error?.code,
        body?.error?.details
      );
    }

    const json = await response.json() as any;
    return json.data as T;
  }

  private projectPath(path: string): string {
    if (!this.projectId) throw new NexusApiError('No project context', 400);
    return `/api/projects/${this.projectId}${path}`;
  }

  // ─── Auth ───

  async register(params: { name: string; email: string }) {
    return this.request<{ engineer: any; apiKey: string }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(params) },
      false
    );
  }

  async getMe() {
    return this.request<any>('/api/auth/me');
  }

  // ─── Projects ───

  async createProject(params: { name: string; slug: string; repoUrl?: string; repoPath?: string }) {
    return this.request<any>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async listProjects() {
    return this.request<any[]>('/api/projects');
  }

  async getProject(projectId: string) {
    return this.request<any>(`/api/projects/${projectId}`);
  }

  async addMember(projectId: string, params: { engineerId: string; role?: string }) {
    return this.request<any>(`/api/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // ─── Features ───

  async createFeature(params: {
    slug: string;
    title: string;
    spec: string;
    lane?: string;
    priority?: number;
    touches?: string[];
  }) {
    return this.request<any>(this.projectPath('/features'), {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async listFeatures(query?: { status?: string; lane?: string; limit?: number; cursor?: string }) {
    const qs = buildQuery(query);
    return this.request<any>(this.projectPath(`/features${qs}`));
  }

  async getFeature(slug: string) {
    return this.request<any>(this.projectPath(`/features/${slug}`));
  }

  async updateFeature(slug: string, updates: Record<string, unknown>) {
    return this.request<any>(this.projectPath(`/features/${slug}`), {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteFeature(slug: string) {
    return this.request<any>(this.projectPath(`/features/${slug}`), {
      method: 'DELETE',
    });
  }

  // ─── Feature Lifecycle ───

  async markReady(slug: string) {
    return this.request<any>(this.projectPath(`/features/${slug}/ready`), { method: 'POST' });
  }

  async pickFeature(slug: string) {
    return this.request<any>(this.projectPath(`/features/${slug}/pick`), { method: 'POST' });
  }

  async releaseFeature(slug: string) {
    return this.request<any>(this.projectPath(`/features/${slug}/release`), { method: 'POST' });
  }

  async markDone(slug: string) {
    return this.request<any>(this.projectPath(`/features/${slug}/done`), { method: 'POST' });
  }

  async cancelFeature(slug: string) {
    return this.request<any>(this.projectPath(`/features/${slug}/cancel`), { method: 'POST' });
  }

  async getAvailableFeatures() {
    return this.request<any[]>(this.projectPath('/features/available'));
  }

  // ─── Roadmap ───

  async getRoadmap() {
    return this.request<any>(this.projectPath('/roadmap'));
  }

  async reorderRoadmap(input: Record<string, string[]>) {
    return this.request<any>(this.projectPath('/roadmap/reorder'), {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async moveToLane(slug: string, lane: string, priority?: number) {
    return this.request<any>(this.projectPath(`/roadmap/${slug}/lane`), {
      method: 'PATCH',
      body: JSON.stringify({ lane, priority }),
    });
  }

  // ─── Learnings ───

  async addLearning(featureSlug: string, content: string) {
    return this.request<any>(this.projectPath(`/features/${featureSlug}/learnings`), {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async listLearnings(featureSlug: string) {
    return this.request<any>(this.projectPath(`/features/${featureSlug}/learnings`));
  }

  // ─── Decisions ───

  async addDecision(params: {
    title: string;
    decision: string;
    rationale?: string;
    alternatives?: string;
    featureSlug?: string;
    supersedes?: string;
  }) {
    return this.request<any>(this.projectPath('/decisions'), {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async listDecisions(featureSlug?: string) {
    const qs = featureSlug ? `?feature=${featureSlug}` : '';
    return this.request<any>(this.projectPath(`/decisions${qs}`));
  }

  // ─── Claims ───

  async getProjectClaims() {
    return this.request<any[]>(this.projectPath('/claims'));
  }

  async getMyClaims() {
    return this.request<any[]>(this.projectPath('/claims/mine'));
  }

  async refreshClaims() {
    return this.request<any>(this.projectPath('/claims/refresh'), { method: 'POST' });
  }

  // ─── Sessions ───

  async createSession(params?: { featureId?: string; metadata?: Record<string, unknown> }) {
    return this.request<any>(this.projectPath('/sessions'), {
      method: 'POST',
      body: JSON.stringify(params ?? {}),
    });
  }

  async getActiveSessions() {
    return this.request<any[]>(this.projectPath('/sessions/active'));
  }

  async sendHeartbeat(sessionId: string) {
    return this.request<any>(this.projectPath(`/sessions/${sessionId}/heartbeat`), {
      method: 'POST',
    });
  }

  // ─── Checkpoints ───

  async createCheckpoint(params: {
    sessionId: string;
    featureId: string;
    context?: Record<string, unknown>;
    type?: string;
    notes?: string;
  }) {
    return this.request<any>(this.projectPath('/sessions/checkpoints'), {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getLatestCheckpoint(featureId: string) {
    return this.request<any>(this.projectPath(`/sessions/checkpoints/latest?featureId=${featureId}`));
  }

  // ─── Status ───

  async getStatus() {
    return this.request<any>(this.projectPath('/status'));
  }
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}
