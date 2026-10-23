export function createMysqlSslConfig({ production = false, ca } = {}) {
  if (!production && !ca) return undefined;
  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
}
