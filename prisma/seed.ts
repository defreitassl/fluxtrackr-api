import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';

config();

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const databaseUrl = requiredEnvironmentVariable('DATABASE_URL');

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({ adapter });

const defaultCategories = [
  'Alimentacao',
  'Transporte',
  'Mercado',
  'Lazer',
  'Saude',
  'Educacao',
  'Assinaturas',
  'Outros',
];

async function main() {
  const name = requiredEnvironmentVariable('BOOTSTRAP_USER_NAME');
  const email = requiredEnvironmentVariable('BOOTSTRAP_USER_EMAIL').toLowerCase();
  const passwordHash = await bcrypt.hash(
    requiredEnvironmentVariable('BOOTSTRAP_USER_PASSWORD'),
    10,
  );

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
    },
    create: {
      name,
      email,
      passwordHash,
    },
  });

  for (const name of defaultCategories) {
    await prisma.category.upsert({
      where: {
        userId_name: {
          userId: user.id,
          name,
        },
      },
      update: {},
      create: {
        userId: user.id,
        name,
        type: 'both',
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
