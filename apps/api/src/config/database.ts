import { PrismaClient } from '.prisma/client';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.error({ msg: 'database health check failed', err: (err as Error).message });
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
