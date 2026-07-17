import { config } from 'dotenv';

config();

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseWebOrigins(value: string | undefined) {
  if (!value?.trim()) {
    return [];
  }

  return value.split(',').map((origin) => {
    const normalizedOrigin = origin.trim();

    try {
      return new URL(normalizedOrigin).origin;
    } catch {
      throw new Error(
        'WEB_ORIGIN must contain one or more comma-separated absolute origins',
      );
    }
  });
}

export const environment = {
  databaseUrl: requiredEnvironmentVariable('DATABASE_URL'),
  jwtSecret: requiredEnvironmentVariable('JWT_SECRET'),
  webOrigins: parseWebOrigins(process.env.WEB_ORIGIN),
};
