// prisma/seed.ts
import { PrismaClient, CourseStatus, PaymentStatus, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  await prisma.$transaction(
    async (tx) => {
      // ====================== 1. USERS ======================
      const testUser = await tx.user.upsert({
        where: { email: 'test@example.com' },
        update: {},
        create: {
          name: 'Test Student',
          email: 'test@example.com',
          emailVerified: true,
          role: Role.student,
          profileImage: 'https://randomuser.me/api/portraits/men/32.jpg',
        },
      });

      const instructor = await tx.user.upsert({
        where: { email: 'instructor@academy.com' },
        update: {},
        create: {
          name: 'Adebayo Okafor',
          email: 'instructor@academy.com',
          emailVerified: true,
          role: Role.instructor,
        },
      });

      const admin = await tx.user.upsert({
        where: { email: 'admin@academy.com' },
        update: {},
        create: {
          name: 'Admin User',
          email: 'admin@academy.com',
          emailVerified: true,
          role: Role.admin,
        },
      });

      // Create local account with hashed password
      await tx.account.upsert({
        where: {
          provider_providerId: {
            provider: 'credentials',
            providerId: 'test@example.com',
          },
        },
        update: {},
        create: {
          userId: testUser.id,
          provider: 'credentials',
          providerId: 'test@example.com',
          password: await bcrypt.hash('Password123', 12),
        },
      });

      console.log('✅ Users seeded');

      // ====================== 2. PROGRAM ======================
      const program = await tx.program.upsert({
        where: { slug: 'diploma-programs' },
        update: {},
        create: {
          title: 'Diploma Programs',
          description:
            'Comprehensive professional diploma programs designed to give you industry-ready skills.',
          slug: 'diploma-programs',
          status: CourseStatus.PUBLISHED,
          image: 'https://picsum.photos/id/1015/800/600',
        },
      });

      // ====================== 3. COURSE + PRICINGS ======================
      const course = await tx.course.create({
        data: {
          title: 'Accounting Basics Mastery',
          slug: 'accounting-basics',
          description:
            'Master the fundamentals of financial accounting with practical examples and real-world applications.',
          thumbnail: 'https://picsum.photos/id/201/800/450',
          videoPreview: 'https://example.com/preview.mp4',
          level: 'BEGINNER',
          tags: ['accounting', 'finance', 'bookkeeping'],
          duration: 2400, // in minutes
          status: CourseStatus.PUBLISHED,
          instructorId: instructor.id,
          programId: program.id,
          pricings: {
            create: [
              {
                name: '1-Day Access',
                price: 2500,
                durationDays: 1,
              },
              {
                name: '7-Day Access',
                price: 7500,
                durationDays: 7,
              },
              {
                name: '30-Day Access',
                price: 18500,
                durationDays: 30,
              },
              {
                name: '60-Day Access',
                price: 32000,
                durationDays: 60,
              },
              {
                name: '90-Day Access',
                price: 45000,
                durationDays: 90,
              },
            ],
          },
        },
        include: {
          pricings: true,
        },
      });

      const threeMonthPricing = course.pricings.find((p) => p.durationDays === 90)!;

      console.log('✅ Course & Pricings seeded');

      // ====================== 4. ORDER + ORDER ITEM ======================
      const order = await tx.order.create({
        data: {
          userId: testUser.id,
          email: testUser.email,
          name: testUser.name,
          totalAmount: threeMonthPricing.price,
          currency: 'NGN',
          status: PaymentStatus.PAID,
        },
      });

      const orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          pricingId: threeMonthPricing.id,
          unitPrice: threeMonthPricing.price,
          quantity: 1,
        },
      });

      // ====================== 5. ENROLLMENT ======================
      await tx.enrollment.create({
        data: {
          userId: testUser.id,
          courseId: course.id,
          pricingId: threeMonthPricing.id,
          orderItemId: orderItem.id,
          orderId: order.id,
          paymentStatus: PaymentStatus.PAID,
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + threeMonthPricing.durationDays * 24 * 60 * 60 * 1000),
          progressPercentage: 45,
        },
      });

      console.log('✅ Order & Enrollment seeded');

      // ====================== 6. MODULES & TOPICS ======================
      const module1 = await tx.module.create({
        data: {
          title: 'Foundations of Accounting',
          description: 'Understanding the core principles and concepts.',
          slug: 'foundations-of-accounting',
          courseId: course.id,
          position: 1,
          topics: {
            create: [
              {
                title: 'What is Accounting?',
                slug: 'what-is-accounting',
                bunnyVideoId: 'bvid_001',
                durationSeconds: 420,
                thumbnailUrl: 'https://picsum.photos/id/237/400/225',
                position: 1,
              },
              {
                title: 'The Accounting Equation',
                slug: 'accounting-equation',
                bunnyVideoId: 'bvid_002',
                durationSeconds: 680,
                thumbnailUrl: 'https://picsum.photos/id/201/400/225',
                position: 2,
              },
            ],
          },
        },
      });

      const module2 = await tx.module.create({
        data: {
          title: 'Financial Statements',
          description: 'Reading and interpreting key financial reports.',
          slug: 'financial-statements',
          courseId: course.id,
          position: 2,
          topics: {
            create: [
              {
                title: 'Balance Sheet Basics',
                slug: 'balance-sheet-basics',
                bunnyVideoId: 'bvid_003',
                durationSeconds: 540,
                thumbnailUrl: 'https://picsum.photos/id/202/400/225',
                position: 1,
              },
              {
                title: 'Income Statement Insights',
                slug: 'income-statement-insights',
                bunnyVideoId: 'bvid_004',
                durationSeconds: 600,
                thumbnailUrl: 'https://picsum.photos/id/203/400/225',
                position: 2,
              },
            ],
          },
        },
      });

      const module3 = await tx.module.create({
        data: {
          title: 'Recording Transactions',
          description: 'How to journalize and post transactions correctly.',
          slug: 'recording-transactions',
          courseId: course.id,
          position: 3,
          topics: {
            create: [
              {
                title: 'Journal Entries Explained',
                slug: 'journal-entries-explained',
                bunnyVideoId: 'bvid_005',
                durationSeconds: 480,
                thumbnailUrl: 'https://picsum.photos/id/204/400/225',
                position: 1,
              },
              {
                title: 'Posting to the Ledger',
                slug: 'posting-to-ledger',
                bunnyVideoId: 'bvid_006',
                durationSeconds: 720,
                thumbnailUrl: 'https://picsum.photos/id/205/400/225',
                position: 2,
              },
            ],
          },
        },
      });

      console.log('✅ Modules & Topics seeded');

      // Log summary
      console.log('\n🎉 Seed completed successfully!');
      console.table({
        TestUser: testUser.email,
        Instructor: instructor.email,
        Course: course.title,
        Program: program.title,
        PricingOptions: course.pricings.length,
      });
    },
    {
      timeout: 60000, // 60 seconds
    },
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });