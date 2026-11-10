// Límite de peticiones en memoria con ventana deslizante. Suficiente para un
// único proceso; si algún día hay varias instancias, mover esto a Redis.
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();

  function prune(key, current) {
    const recent = (hits.get(key) || []).filter((time) => current - time < windowMs);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
    return recent;
  }

  const cleanup = setInterval(() => {
    const current = now();
    for (const key of [...hits.keys()]) prune(key, current);
  }, Math.min(windowMs, 10 * 60 * 1000));
  cleanup.unref();

  return {
    take(key) {
      const current = now();
      const recent = prune(key, current);
      if (recent.length >= limit) {
        const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - current) / 1000));
        return { allowed: false, retryAfterSec };
      }
      recent.push(current);
      hits.set(key, recent);
      return { allowed: true, retryAfterSec: 0 };
    },
    stop() {
      clearInterval(cleanup);
    },
  };
}
