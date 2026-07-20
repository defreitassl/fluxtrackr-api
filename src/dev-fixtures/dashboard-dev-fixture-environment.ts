type Environment = Record<string, string | undefined>;

export type DashboardFixtureEnvironment = {
  emptyEmail: string;
  password: string;
  populatedEmail: string;
  userNamePrefix: string;
};

export function readDashboardFixtureEnvironment(
  environment: Environment = process.env,
): DashboardFixtureEnvironment {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Dashboard development fixtures cannot run in production.');
  }

  if (environment.ALLOW_DEV_FIXTURES !== 'true') {
    throw new Error('Set ALLOW_DEV_FIXTURES=true to run dashboard development fixtures.');
  }

  const populatedEmail = readFixtureEmail(environment, 'DEV_FIXTURE_POPULATED_EMAIL');
  const emptyEmail = readFixtureEmail(environment, 'DEV_FIXTURE_EMPTY_EMAIL');
  const password = required(environment, 'DEV_FIXTURE_PASSWORD');
  const userNamePrefix = required(environment, 'DEV_FIXTURE_USER_NAME_PREFIX');
  const bootstrapEmail = environment.BOOTSTRAP_USER_EMAIL?.trim().toLowerCase();

  if (populatedEmail === emptyEmail) {
    throw new Error('Dashboard fixture emails must be different.');
  }

  if (bootstrapEmail && [populatedEmail, emptyEmail].includes(bootstrapEmail)) {
    throw new Error('Dashboard fixture emails must not match BOOTSTRAP_USER_EMAIL.');
  }

  return { populatedEmail, emptyEmail, password, userNamePrefix };
}

function required(environment: Environment, name: string) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readFixtureEmail(environment: Environment, name: string) {
  const rawValue = environment[name];

  if (!rawValue || rawValue.trim() !== rawValue) {
    throw new Error(`${name} must be a fixture email ending in @fluxtrackr.test.`);
  }

  const email = rawValue.toLowerCase();

  if (!/^[^\s@]+@fluxtrackr\.test$/.test(email)) {
    throw new Error(`${name} must be a fixture email ending in @fluxtrackr.test.`);
  }

  return email;
}
