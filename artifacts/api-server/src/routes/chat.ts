import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import {
  db,
  chatMessagesTable,
} from "@workspace/db";
import {
  GetChatSummaryResponse,
  ListChatMessagesQueryParams,
  ListChatMessagesResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/chat/messages", async (req, res): Promise<void> => {
  const params = ListChatMessagesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(chatMessagesTable)
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(params.data.limit);

  const messages = rows.reverse().map((message) => ({
    ...message,
    createdAt: message.createdAt.toISOString(),
  }));

  res.json(ListChatMessagesResponse.parse(messages));
});

router.post("/chat/messages", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const authorName = parsed.data.authorName.trim();
  const content = parsed.data.content.trim();
  if (!authorName || !content) {
    res.status(400).json({ error: "Name and message cannot be blank." });
    return;
  }

  const [message] = await db
    .insert(chatMessagesTable)
    .values({ authorName, content })
    .returning();

  res
    .status(201)
    .json(
      SendChatMessageResponse.parse({
        ...message,
        createdAt: message.createdAt.toISOString(),
      }),
    );
});

router.get("/chat/summary", async (_req, res): Promise<void> => {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [summary] = await db
    .select({
      messageCount: sql<number>`count(*)::int`,
      participantCount: sql<number>`count(distinct ${chatMessagesTable.authorName})::int`,
      todayMessageCount: sql<number>`count(*) filter (where ${chatMessagesTable.createdAt} >= ${startOfToday})::int`,
      lastActivity: sql<Date | null>`max(${chatMessagesTable.createdAt})`,
    })
    .from(chatMessagesTable);

  const lastActivity =
    summary.lastActivity instanceof Date
      ? summary.lastActivity.toISOString()
      : summary.lastActivity
        ? new Date(summary.lastActivity).toISOString()
        : null;

  res.json(
    GetChatSummaryResponse.parse({
      messageCount: summary.messageCount,
      participantCount: summary.participantCount,
      todayMessageCount: summary.todayMessageCount,
      lastActivity,
    }),
  );
});

export default router;
