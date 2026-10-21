export function createPostgresSslConfig({ production, ca }) {
  if (!production) return undefined;
  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
}
