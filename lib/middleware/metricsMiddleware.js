export function createMetricsMiddleware(metrics) {
  if (!metrics) return (_req, _res, next) => next();

  return (req, res, next) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const labels = {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode,
      };

      metrics.requestDuration.observe(labels, durationMs / 1000);
      metrics.requestCount.inc(labels);
    });

    next();
  };
}
