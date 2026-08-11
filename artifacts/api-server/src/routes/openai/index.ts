import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { runDroneAgent } from "../../lib/agent";

const router: IRouter = Router();

// ─── Conversations ────────────────────────────────────────────────────────────

router.get("/openai/conversations", async (req, res): Promise<void> => {
  const all = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt));
  res.json(all);
});

router.post("/openai/conversations", async (req, res): Promise<void> => {
  const { title } = req.body as { title?: string };
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const [conv] = await db
    .insert(conversations)
    .values({ title })
    .returning();
  res.status(201).json(conv);
});

router.get("/openai/conversations/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  res.json({ ...conv, messages: msgs });
});

router.delete("/openai/conversations/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  const [deleted] = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.sendStatus(204);
});

// ─── Messages ─────────────────────────────────────────────────────────────────

router.get("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const conversationId = parseInt(rawId, 10);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  res.json(msgs);
});

router.post(
  "/openai/conversations/:id/messages",
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const conversationId = parseInt(rawId, 10);
    if (isNaN(conversationId)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }

    const { content } = req.body as { content?: string };
    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    // Verify conversation exists
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const emit = (event: object) =>
      res.write(`data: ${JSON.stringify(event)}\n\n`);

    // Acknowledge immediately so the UI shows activity
    emit({ type: "status", message: "Connecting to drone consultant..." });

    // Save user message
    await db.insert(messages).values({
      conversationId,
      role: "user",
      content,
    });

    // Build history for agent
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    const chatHistory: ChatCompletionMessageParam[] = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    emit({ type: "status", message: "Analyzing your request..." });

    // Run agent — emits tool-progress status events via callback
    const { text, invoice } = await runDroneAgent(chatHistory, (msg) =>
      emit({ type: "status", message: msg })
    );

    // Stream text in small chunks for a typing effect
    const CHUNK = 4;
    for (let i = 0; i < text.length; i += CHUNK) {
      res.write(
        `data: ${JSON.stringify({ type: "text", content: text.slice(i, i + CHUNK) })}\n\n`
      );
    }

    // Emit composition invoice if present
    if (invoice) {
      res.write(
        `data: ${JSON.stringify({ type: "composition", data: invoice })}\n\n`
      );
    }

    // Persist assistant response (with optional invoice metadata)
    await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content: text,
      metadata: invoice ?? null,
    });

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  }
);

export default router;
