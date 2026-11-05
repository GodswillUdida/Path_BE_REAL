import { ChatMessageType, type Prisma } from "@prisma/client";
import type { SeedUsers } from "./users";

export async function seedChat(
  tx: Prisma.TransactionClient,
  users: SeedUsers,
  cohortId: string,
) {
  const { testUser, instructor } = users;

  const room = await tx.chatRoom.create({
    data: {
      cohortId,
      name: "General",
      isReadOnly: false,
      isArchived: false,
      messages: {
        create: [
          {
            senderId: instructor.id,
            type: ChatMessageType.TEXT,
            body: "Welcome to Batch A. Post questions here before live class.",
            clientMessageId: "seed-msg-1",
          },
          {
            senderId: testUser.id,
            type: ChatMessageType.TEXT,
            body: "Looking forward to Week 1.",
            clientMessageId: "seed-msg-2",
          },
          {
            senderId: null,
            type: ChatMessageType.SYSTEM,
            body: "Chat room created",
            clientMessageId: "seed-msg-system-1",
          },
        ],
      },
    },
  });

  await tx.chatReadState.create({
    data: {
      roomId: room.id,
      userId: testUser.id,
      lastReadAt: new Date(),
    },
  });

  console.log("✅ Chat room + messages seeded");
  return room;
}