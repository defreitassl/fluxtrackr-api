import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';

config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
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
  const passwordHash = await bcrypt.hash('123456', 10);

  const user = await prisma.user.upsert({
    where: { email: 'dev@fluxtrackr.local' },
    update: {
      passwordHash,
    },
    create: {
      name: 'Dev User',
      email: 'dev@fluxtrackr.local',
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
