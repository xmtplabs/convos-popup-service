export class PopupServiceError extends Error {
  constructor(status, body) {
    super(body.error_description || body.error || `HTTP ${status}`);
    this.name = 'PopupServiceError';
    this.status = status;
    this.error = body.error;
    this.body = body;
    // Surface extra fields (e.g. redirectUrl on 409)
    for (const [k, v] of Object.entries(body)) {
      if (!(k in this)) this[k] = v;
    }
  }
}

export class ConvosPopupClient {
  #baseUrl;
  #namespace;
  #clientId;
  #clientSecret;
  #accessToken = null;
  #tokenExpiresAt = 0;

  constructor({ baseUrl, namespace, clientId, clientSecret } = {}) {
    if (!baseUrl) throw new Error('baseUrl is required');
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#namespace = namespace ?? null;
    this.#clientId = clientId ?? null;
    this.#clientSecret = clientSecret ?? null;
  }

  get namespace() { return this.#namespace; }
  get clientId() { return this.#clientId; }
  get clientSecret() { return this.#clientSecret; }

  // ── Private helpers ──────────────────────────────────────────────

  async #getToken() {
    // Reuse if within 80% of TTL
    if (this.#accessToken && Date.now() < this.#tokenExpiresAt) {
      return this.#accessToken;
    }

    if (!this.#clientId || !this.#clientSecret) {
      throw new Error('Client credentials not set. Call register() or pass clientId/clientSecret to constructor.');
    }

    const res = await fetch(`${this.#baseUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(this.#clientId)}&client_secret=${encodeURIComponent(this.#clientSecret)}`,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new PopupServiceError(res.status, body);
    }

    const data = await res.json();
    this.#accessToken = data.access_token;
    // Refresh at 80% of TTL
    this.#tokenExpiresAt = Date.now() + data.expires_in * 1000 * 0.8;
    return this.#accessToken;
  }

  async #request(method, path, { body, auth = true } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers['Authorization'] = `Bearer ${await this.#getToken()}`;

    const res = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const responseBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new PopupServiceError(res.status, responseBody);
    }

    return responseBody;
  }

  // ── Public API ───────────────────────────────────────────────────

  async register({ namespace, displayName, verificationEndpoint, appIconUrl, contactEmail }) {
    const result = await this.#request('POST', '/connect/register', {
      body: { namespace, displayName, verificationEndpoint, appIconUrl, contactEmail },
      auth: false,
    });

    this.#namespace = namespace;
    this.#clientId = result.clientId;
    this.#clientSecret = result.clientSecret;

    return result;
  }

  async createGroup({ title, pairingIdentifiers }) {
    return this.#request('POST', `/api/v1/namespaces/${this.#namespace}/groups`, {
      body: { title, pairingIdentifiers },
    });
  }

  async verifyUser({ pairingIdentifier, inviteId }) {
    return this.#request('POST', `/api/v1/namespaces/${this.#namespace}/verify`, {
      body: { pairingIdentifier, inviteId },
    });
  }

  async getGroup(groupId) {
    return this.#request('GET', `/api/v1/namespaces/${this.#namespace}/groups/${groupId}`);
  }

  async isGroupReady(groupId) {
    return this.#request('GET', `/api/v1/namespaces/${this.#namespace}/groups/${groupId}/ready`);
  }

  async rotateSecret() {
    const result = await this.#request('POST', '/connect/rotate-secret');
    this.#clientSecret = result.clientSecret;
    // Invalidate cached token so next call uses new credentials
    this.#accessToken = null;
    this.#tokenExpiresAt = 0;
    return result;
  }

  async updateNamespace(fields) {
    return this.#request('PATCH', '/connect/namespace', { body: fields });
  }
}
