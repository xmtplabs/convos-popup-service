export function errorHandler(config) {
  return (err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const body = {
      error: err.code || 'internal_error',
      error_description: err.message || 'An unexpected error occurred',
    };

    if (config.nodeEnv === 'development') {
      body.stack = err.stack;
    }

    if (req.log) {
      req.log.error({ err, status }, 'Request error');
    }

    res.status(status).json(body);
  };
}
