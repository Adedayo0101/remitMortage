import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting DB performance test...');
  
  // 1. Seed 100k mock applicants and loans
  const applicantCount = await prisma.applicant.count();
  if (applicantCount < 100000) {
    console.log('Seeding 100k records. This may take a moment...');
    
    // We use a raw query for bulk insert because createMany with 100k records might be slow
    // Generate values
    const BATCH_SIZE = 10000;
    for (let i = 0; i < 10; i++) {
      const applicantValues: string[] = [];
      const loanValues: string[] = [];
      
      for (let j = 0; j < BATCH_SIZE; j++) {
        const id = `test-${i}-${j}-${Date.now()}`;
        const wallet = `G${id.substring(0, 50).padEnd(55, 'A')}`;
        applicantValues.push(`('${id}', '${wallet}', 'Test User', 'USD', NOW(), NOW())`);
        loanValues.push(`('${id}-loan', '${id}', '5000', 'Disbursing', NOW(), NOW())`);
      }
      
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Applicant" ("id", "stellarAddress", "fullName", "displayCurrency", "createdAt", "updatedAt") 
        VALUES ${applicantValues.join(',')}
        ON CONFLICT ("stellarAddress") DO NOTHING
      `);
      
      await prisma.$executeRawUnsafe(`
        INSERT INTO "LoanApplication" ("id", "applicantId", "principal", "status", "createdAt", "updatedAt") 
        VALUES ${loanValues.join(',')}
        ON CONFLICT DO NOTHING
      `);
      console.log(`Seeded batch ${i+1}/10`);
    }
  }

  console.log('Running EXPLAIN ANALYZE on Analytics Queries...');

  // The query used by listApplications: findMany with include
  // Prisma generates two queries usually for include, or a join depending on relation mode. 
  // We'll test a direct join query representing the worst case or standard Prisma behavior
  const explainResult: any = await prisma.$queryRaw`
    EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT "LoanApplication"."id", "Applicant"."stellarAddress" 
    FROM "LoanApplication" 
    LEFT JOIN "Applicant" ON "LoanApplication"."applicantId" = "Applicant"."id"
  `;

  const plan = explainResult[0]['QUERY PLAN'][0]['Plan'];
  const execTime = explainResult[0]['QUERY PLAN'][0]['Execution Time'];
  const planningTime = explainResult[0]['QUERY PLAN'][0]['Planning Time'];

  console.log(`Planning Time: ${planningTime}ms`);
  console.log(`Execution Time: ${execTime}ms`);

  const THRESHOLD_MS = 50;

  if (execTime > THRESHOLD_MS) {
    console.error(`❌ FAILURE: Query execution time (${execTime}ms) exceeded threshold (${THRESHOLD_MS}ms). Possible N+1 or missing index.`);
    process.exit(1);
  }

  console.log('✅ SUCCESS: Query execution time is within threshold.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
