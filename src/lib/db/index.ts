import { PrismaClient } from '@prisma/client';
import { getEnv } from '@/lib/env';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create a single PrismaClient instance
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: getEnv().DATABASE_URL || 'postgresql://fake:fake@localhost:5432/fake',
    log: getEnv().NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (getEnv().NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
