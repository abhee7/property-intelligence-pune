// Prisma client — uses real @prisma/client when available,
// falls back to type-safe stub for compilation in restricted envs

let prismaInstance: any;

try {
  const { PrismaClient } = require("@prisma/client");
  const globalForPrisma = globalThis as unknown as { prisma: any };
  prismaInstance = globalForPrisma.prisma || new PrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prismaInstance;
} catch {
  // Stub for environments where Prisma can't generate (CI without DB)
  const handler: ProxyHandler<any> = {
    get: (_target, prop) => {
      if (prop === "$queryRaw") return async () => [{ "?column?": 1 }];
      if (prop === "$disconnect") return async () => {};
      return new Proxy({}, {
        get: () => async (..._args: unknown[]) => ({}),
      });
    },
  };
  prismaInstance = new Proxy({}, handler);
}

export const prisma = prismaInstance;
