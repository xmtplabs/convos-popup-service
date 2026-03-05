export class HealthChecker {
  constructor(storage, logger, config) {
    this.storage = storage;
    this.logger = logger;
    this.intervalMs = config.healthCheckIntervalMs;
    this.timeoutMs = config.healthCheckTimeoutMs;
    this._timer = null;
  }

  start() {
    this._timer = setInterval(() => this.checkAll(), this.intervalMs);
    this._timer.unref?.();
    this.logger.info({ intervalMs: this.intervalMs }, 'Health checker started');
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async checkAll() {
    // Get all active namespaces with verification endpoints
    // For MemoryStorage, iterate the map
    const namespaces = this.storage.namespaces
      ? [...this.storage.namespaces.values()]
      : [];

    for (const ns of namespaces) {
      if (ns.status !== 'active' || !ns.verificationEndpoint) continue;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const res = await fetch(ns.verificationEndpoint, {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const healthy = res.status >= 200 && res.status < 400;
        await this.storage.setHealthCheckResult(ns.namespace, healthy);
      } catch {
        await this.storage.setHealthCheckResult(ns.namespace, false);
      }
    }
  }
}
