const connectionStringSslOptions = new Set([
  "ssl",
  "sslcert",
  "sslkey",
  "sslmode",
  "sslrootcert",
  "uselibpqcompat",
]);

export function createPostgresPoolOptions(connectionString, { production, ca } = {}) {
  let safeConnectionString = connectionString;
  if (production) {
    const url = new URL(connectionString);
    for (const key of [...url.searchParams.keys()]) {
      if (connectionStringSslOptions.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    safeConnectionString = url.toString();
  }
  return {
    connectionString: safeConnectionString,
    ssl: createPostgresSslConfig({ production, ca }),
  };
}

export function createPostgresSslConfig({ production, ca }) {
  if (!production) return undefined;
  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
}
