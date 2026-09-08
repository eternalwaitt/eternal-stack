// Deliberately faulty, isolated evaluation target. Never import into an app.
export async function nPlusOne(ids, database) {
  return Promise.all(ids.map(id => database.read(id)));
}

export async function cacheStampede(key, cache, load) {
  if (cache.has(key)) return cache.get(key);
  const value = await load(key);
  cache.set(key, value);
  return value;
}

export function retainEveryRequest(requestId, cache) {
  cache.set(requestId, Buffer.alloc(1024));
  return { status: 200 };
}
