import { ApplicantStatus, type Prisma } from "@prisma/client";
import { faker } from "@faker-js/faker";

export async function seedApplicants(tx: Prisma.TransactionClient) {
  const applicantsData: Array<{
    fullName: string;
    status: ApplicantStatus;
    withSponsor?: boolean;
    withEmployment?: boolean;
  }> = [
    { fullName: faker.person.fullName(), status: ApplicantStatus.PENDING },
    {
      fullName: faker.person.fullName(),
      status: ApplicantStatus.REVIEWED,
      withEmployment: true,
    },
    {
      fullName: faker.person.fullName(),
      status: ApplicantStatus.APPROVED,
      withSponsor: true,
      withEmployment: true,
    },
    { fullName: faker.person.fullName(), status: ApplicantStatus.REJECTED },
  ];

  for (const a of applicantsData) {
    await tx.applicant.create({
      data: {
        fullName: a.fullName,
        email: faker.internet.email({ firstName: a.fullName.split(" ")[0] }).toLowerCase(),
        phone: faker.phone.number(),
        address: faker.location.streetAddress({ useFullAddress: true }),
        lectureCenter: faker.helpers.arrayElement(["Lagos", "Abuja", "Port Harcourt", null]),
        isNewStudent: faker.datatype.boolean(),
        level: faker.helpers.arrayElement(["Diploma", "Certificate", null]),
        careerChallenges: faker.lorem.sentence(),
        referredBy: faker.helpers.arrayElement([faker.person.fullName(), null]),
        status: a.status,
        ...(a.withEmployment && {
          employment: {
            create: {
              placeOfWork: faker.company.name(),
              position: faker.person.jobTitle(),
            },
          },
        }),
        ...(a.withSponsor && {
          sponsor: {
            create: {
              name: faker.person.fullName(),
              phone: faker.phone.number(),
              email: faker.internet.email(),
              location: faker.location.city(),
              workplace: faker.company.name(),
            },
          },
        }),
      },
    });
  }

  console.log("✅ Applicants seeded");
  return applicantsData.length;
}