import { LiveSessionProvider, type Prisma } from "@prisma/client";

export async function seedMeetingAccounts(tx: Prisma.TransactionClient) {
  const accounts = await Promise.all(
    [
      { provider: LiveSessionProvider.ZOOM, label: "Zoom Licence 1", accountEmail: "zoom1@academy.com" },
      { provider: LiveSessionProvider.ZOOM, label: "Zoom Licence 2", accountEmail: "zoom2@academy.com" },
      {
        provider: LiveSessionProvider.GOOGLE_MEET,
        label: "Meet Primary",
        accountEmail: "meet@academy.com",
      },
    ].map((a) =>
      tx.meetingAccount.upsert({
        where: { provider_label: { provider: a.provider, label: a.label } },
        update: {},
        create: { ...a, isActive: true },
      }),
    ),
  );

  console.log("✅ MeetingAccounts seeded");
  return accounts;
}