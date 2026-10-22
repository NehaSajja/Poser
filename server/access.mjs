// Explicit origins, never values inferred from untrusted request headers.
export function allowedOrigins(port, env = process.env) {
  const values = [env.PUBLIC_ORIGIN, env.RAILWAY_PUBLIC_DOMAIN && `https://${env.RAILWAY_PUBLIC_DOMAIN}`, env.FLY_APP_NAME && `https://${env.FLY_APP_NAME}.fly.dev`].filter(Boolean);
  if (env.NODE_ENV !== 'production') values.push(`http://127.0.0.1:${port}`, `http://localhost:${port}`);
  return [...new Set(values.map(value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path.');
    }
    return url.origin;
  }))];
}
export function isAllowedRequest(req, origins) {
  return origins.some(origin => new URL(origin).host === req.headers.host)
    && req.headers['sec-fetch-site'] !== 'cross-site'
    && (!req.headers.origin || origins.includes(req.headers.origin));
}
