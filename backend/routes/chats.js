import express from "express";
import authMiddleware from "../middleware/auth.js";
import { queryDoc } from "../services/ragService.js";
import Chat from "../models/Chat.js";

const router = express.Router();

// Route: POST /api/query
// Queries the active document, generates a response, and saves the conversation history.
router.post("/query", authMiddleware, async (req, res) => {
  try {
    const { documentId, question, chatHistory, compareDocIds } = req.body;
    const userId = req.user.id;

    if (!documentId || !question) {
      return res.status(400).json({ error: "Missing documentId or query question." });
    }

    console.log(`[Query] User ${userId} querying document ${documentId}: "${question}" (compare: ${compareDocIds ? compareDocIds.join(",") : "none"})`);

    // Run RAG pipeline with temporal and cross-comparison support
    const ragResult = await queryDoc(documentId, question, chatHistory, compareDocIds, userId);

    // Save user chat logs to MongoDB
    const chatLog = new Chat({
      userId,
      documentId,
      question,
      answer: ragResult.answer,
      intent: ragResult.intent,
      sources: ragResult.sources,
      evaluation: ragResult.evaluation,
      suggestedQuestions: ragResult.suggestedQuestions || []
    });

    await chatLog.save();

    res.status(200).json(ragResult);
  } catch (error) {
    console.error("Query error:", error);
    if (error.message && error.message.includes("429")) {
      return res.status(429).json({ 
        error: "Google API Rate Limit Exceeded", 
        details: "You are sending messages too quickly for the Google Free Tier (Limit: 15 req/min). Please wait 30 seconds and try again!" 
      });
    }
    res.status(500).json({ error: "RAG query failed.", details: error.message });
  }
});

// Route: GET /api/chats/:documentId
// Fetches chat history for the specified document and authenticated user.
router.get("/chats/:documentId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { documentId } = req.params;

    const chats = await Chat.find({ userId, documentId }).sort({ createdAt: 1 });

    res.status(200).json({ chats });
  } catch (error) {
    console.error("Get chats error:", error);
    res.status(500).json({ error: "Failed to retrieve chat history.", details: error.message });
  }
});

// Route: DELETE /api/chats/:documentId
// Clears chat logs for this document to start a clean new thread.
router.delete("/chats/:documentId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { documentId } = req.params;

    await Chat.deleteMany({ userId, documentId });
    res.status(200).json({ message: "Chat thread cleared successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear chat thread.", details: error.message });
  }
});

export default router;
