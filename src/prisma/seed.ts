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

      // Create credentials
      for (const user of [testUser, instructor, admin]) {
        await tx.account.upsert({
          where: { provider_providerId: { provider: 'credentials', providerId: user.email } },
          update: {},
          create: {
            userId: user.id,
            provider: 'credentials',
            providerId: user.email,
            password: await bcrypt.hash('Password123!', 12),
          },
        });
      }

      console.log('✅ Users seeded');

      // ====================== 2. MULTIPLE PROGRAMS (5 Programs) ======================
      const programs = await Promise.all([
        tx.program.upsert({ where: { slug: 'diploma-in-accounting' }, update: {}, create: { title: 'Diploma in Accounting', description: 'Professional accounting diploma with industry-ready skills.', slug: 'diploma-in-accounting', status: CourseStatus.PUBLISHED, image: 'https://picsum.photos/id/1015/800/600' } }),
        tx.program.upsert({ where: { slug: 'ats-professional' }, update: {}, create: { title: 'ATS Professional Series', description: 'Advanced Training Solutions for accounting professionals.', slug: 'ats-professional', status: CourseStatus.PUBLISHED, image: 'https://picsum.photos/id/237/800/600' } }),
        tx.program.upsert({ where: { slug: 'business-finance' }, update: {}, create: { title: 'Business & Finance Mastery', description: 'Strategic financial management and decision making.', slug: 'business-finance', status: CourseStatus.PUBLISHED, image: 'https://picsum.photos/id/180/800/600' } }),
        tx.program.upsert({ where: { slug: 'taxation-specialization' }, update: {}, create: { title: 'Taxation Specialization', description: 'Comprehensive Nigerian tax laws and compliance.', slug: 'taxation-specialization', status: CourseStatus.PUBLISHED, image: 'https://picsum.photos/id/201/800/600' } }),
        tx.program.upsert({ where: { slug: 'audit-and-assurance' }, update: {}, create: { title: 'Audit & Assurance', description: 'Internal and external auditing principles.', slug: 'audit-and-assurance', status: CourseStatus.PUBLISHED, image: 'https://picsum.photos/id/133/800/600' } }),
      ]);

      console.log('✅ Programs seeded (5 programs)');

      // ====================== 3. COURSES (10 Courses) ======================
      const coursesData = [
        { title: 'Accounting Basics Mastery', slug: 'accounting-basics-mastery', programIndex: 0, level: 'BEGINNER', duration: 2400, price90: 30000 },
        { title: 'Intermediate Financial Accounting', slug: 'intermediate-financial-accounting', programIndex: 0, level: 'INTERMEDIATE', duration: 3600, price90: 35000 },
        { title: 'Advanced Financial Reporting', slug: 'advanced-financial-reporting', programIndex: 0, level: 'ADVANCED', duration: 4200, price90: 45000 },
        { title: 'Cost Accounting & Control', slug: 'cost-accounting-control', programIndex: 1, level: 'INTERMEDIATE', duration: 2800, price90: 40000 },
        { title: 'Managerial Accounting', slug: 'managerial-accounting', programIndex: 2, level: 'INTERMEDIATE', duration: 3100, price90: 45000 },
        { title: 'Financial Management', slug: 'financial-management', programIndex: 2, level: 'ADVANCED', duration: 3800, price90: 50000 },
        { title: 'Nigerian Taxation Law', slug: 'nigerian-taxation-law', programIndex: 3, level: 'INTERMEDIATE', duration: 4500, price90: 48000 },
        { title: 'Audit Principles & Practices', slug: 'audit-principles-practices', programIndex: 4, level: 'ADVANCED', duration: 3900, price90: 55000 },
        { title: 'Forensic Accounting', slug: 'forensic-accounting', programIndex: 1, level: 'ADVANCED', duration: 3300, price90: 50000 },
        { title: 'Corporate Finance', slug: 'corporate-finance', programIndex: 2, level: 'ADVANCED', duration: 4000, price90: 55000 },
      ];

      const createdCourses: any[] = [];

      for (let i = 0; i < coursesData.length; i++) {
        const c = coursesData[i];
        const course = await tx.course.create({
          data: {
            title: c.title,
            slug: c.slug,
            description: `Master ${c.title.toLowerCase()} with practical examples and real-world applications.`,
            thumbnail: `https://picsum.photos/id/${200 + i}/800/450`,
            videoPreview: 'https://example.com/preview.mp4',
            level: c.level as any,
            tags: ['accounting', 'finance', c.slug.split('-')[0]],
            duration: c.duration,
            status: CourseStatus.PUBLISHED,
            instructorId: instructor.id,
            programId: programs[c.programIndex].id,
            pricings: {
              create: [
                { name: '1-Day Access', price: Math.floor(c.price90 * 0.1), durationDays: 1 },
                { name: '30-Days Access', price: Math.floor(c.price90 * 0.6), durationDays: 30 },
                { name: '90-Days Access', price: c.price90, durationDays: 90 },
              ],
            },
          },
          include: { pricings: true },
        });
        createdCourses.push(course);
      }

      console.log(`✅ Courses & Pricings seeded (${createdCourses.length} courses)`);

      // ====================== 4. SAMPLE ORDER & ENROLLMENT ======================
      const premiumPricing = createdCourses[0].pricings.find((p: any) => p.durationDays === 90)!;

      const order = await tx.order.create({
        data: {
          userId: testUser.id,
          email: testUser.email,
          name: testUser.name,
          totalAmount: premiumPricing.price,
          currency: 'NGN',
          status: PaymentStatus.PAID,
        },
      });

      const orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          pricingId: premiumPricing.id,
          unitPrice: premiumPricing.price,
          quantity: 1,
        },
      });

      await tx.enrollment.create({
        data: {
          userId: testUser.id,
          courseId: createdCourses[0].id,
          pricingId: premiumPricing.id,
          orderItemId: orderItem.id,
          orderId: order.id,
          paymentStatus: PaymentStatus.PAID,
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          progressPercentage: 45,
        },
      });

      console.log('✅ Order & Enrollment seeded');

      // ====================== 5. MODULES & TOPICS (Unique IDs) ======================
      for (let i = 0; i < createdCourses.length; i++) {
        await createCourseContent(tx, createdCourses[i], i);
      }

      console.log('✅ Modules & Topics seeded');

      console.log('\n🎉 Seed completed successfully!');
      console.table({
        Users: 3,
        Programs: programs.length,
        Courses: createdCourses.length,
        Enrollments: 1,
      });
    },
    { timeout: 120000 }
  );
}

// Helper with unique bunnyVideoId
async function createCourseContent(tx: any, course: any, courseIndex: number) {
  const baseModules = [
    { title: 'Foundations', topics: ['Introduction to Accounting', 'Accounting Equation', 'Double Entry System'] },
    { title: 'Financial Statements', topics: ['Balance Sheet', 'Income Statement', 'Cash Flow Statement'] },
    { title: 'Advanced Topics', topics: ['Adjusting Entries', 'Financial Analysis', 'Budgeting Basics'] },
  ];

  for (let m = 0; m < baseModules.length; m++) {
    const mod = baseModules[m];
    const moduleSlug = `${course.slug}-module-${m + 1}`;

    await tx.module.create({
      data: {
        title: mod.title,
        description: `Module ${m + 1} of ${course.title}`,
        slug: moduleSlug,
        courseId: course.id,
        position: m + 1,
        topics: {
          create: mod.topics.map((topicTitle, t) => ({
            title: topicTitle,
            slug: `${moduleSlug}-${topicTitle.toLowerCase().replace(/\s+/g, '-')}`,
            bunnyVideoId: `vid_${courseIndex}_${m}_${t}`,   // ← UNIQUE per topic
            durationSeconds: 300 + Math.floor(Math.random() * 600),
            thumbnailUrl: `https://picsum.photos/id/${300 + courseIndex + m + t}/400/225`,
            position: t + 1,
          })),
        },
      },
    });
  }
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });