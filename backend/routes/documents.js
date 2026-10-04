import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { verifyToken } from "@clerk/express";
import authMiddleware from "../middleware/auth.js";
import { 
  processDocument, 
  removeDocumentFromRegistry, 
  getDocumentContent, 
  generateStudyMaterials, 
  getDocumentAnalytics,
  getDocumentStarterQuestions
} from "../services/ragService.js";
import { detectFileType } from "../services/multimodalService.js";
import { ingestUrl } from "../services/urlIngestionService.js";
import Document from "../models/Document.js";
import Chat from "../models/Chat.js";

const router = express.Router();

// Ensure local uploads directory exists
const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer disk storage for seamless media streaming & large file support
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${uniqueSuffix}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit for rich media, audio & video
});

// Route: POST /api/upload
// Universal Omnimodal Ingestion: accepts PDF, Images, Audio, Video, CSV, Code, Markdown, TXT
router.post("/upload", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file was uploaded." });
    }

    const { category, mimeType } = detectFileType(file.originalname, file.mimetype);
    const documentId = req.body.documentId || Math.random().toString(36).substring(7);
    const userId = req.user.id;

    console.log(`[Upload] Processing ${category.toUpperCase()} "${file.originalname}" (${file.size} bytes) for user ${userId}`);

    // Read buffer from disk storage
    const fileBuffer = fs.readFileSync(file.path);

    // Process file through multimodal RAG pipeline
    const stats = await processDocument(fileBuffer, documentId, file.originalname, mimeType);

    // Save document metadata, chunks, and media path to MongoDB
    const docMeta = new Document({
      id: documentId,
      userId: userId,
      filename: file.originalname,
      fileType: stats.fileType || category,
      mimeType: stats.mimeType || mimeType,
      mediaPath: file.path,
      mediaMetadata: stats.mediaMetadata || {},
      size: file.size,
      chunkCount: stats.chunkCount,
      charCount: stats.charCount,
      rawText: stats.rawText,
      chunks: stats.chunks
    });

    await docMeta.save();

    res.status(200).json({
      message: `${category.toUpperCase()} file successfully analyzed and indexed into vector memory.`,
      document: {
        id: docMeta.id,
        userId: docMeta.userId,
        filename: docMeta.filename,
        fileType: docMeta.fileType,
        mimeType: docMeta.mimeType,
        mediaMetadata: docMeta.mediaMetadata,
        size: docMeta.size,
        chunkCount: docMeta.chunkCount,
        charCount: docMeta.charCount,
        uploadedAt: docMeta.uploadedAt.toISOString()
      }
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to process file.", details: error.message });
  }
});

// Route: GET /api/documents
// Fetches all document metadata uploaded by the authenticated user
router.get("/documents", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const documents = await Document.find({ userId }).sort({ uploadedAt: -1 });

    res.status(200).json({ 
      documents: documents.map(d => ({
        id: d.id,
        userId: d.userId,
        filename: d.filename,
        fileType: d.fileType || "document",
        mimeType: d.mimeType || "",
        mediaMetadata: d.mediaMetadata || {},
        size: d.size,
        chunkCount: d.chunkCount,
        charCount: d.charCount,
        uploadedAt: d.uploadedAt.toISOString()
      }))
    });
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({ error: "Failed to retrieve documents.", details: error.message });
  }
});

// Route: GET /api/documents/:id/media
// Streams original image, audio, or video with HTTP 206 Partial Content support for seeking
router.get("/documents/:id/media", async (req, res) => {
  try {
    // Authenticate via Authorization header OR ?token= query parameter (for standard HTML5 audio/video/img tags)
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Authentication token missing." });
    }

    let authenticatedUserId = null;
    try {
      if (process.env.CLERK_SECRET_KEY) {
        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
          clockSkewInMs: 300000 // 5 minutes tolerance
        });
        if (payload?.sub) {
          authenticatedUserId = payload.sub;
        }
      }
    } catch {
      try {
        const unverified = jwt.decode(token);
        if (unverified?.sub && unverified?.iss?.includes("clerk")) {
          authenticatedUserId = unverified.sub;
        }
      } catch {}
    }

    if (!authenticatedUserId) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "documind_master_secret_jwt_key_1234");
        authenticatedUserId = decoded.id;
      } catch {
        return res.status(401).json({ error: "Invalid or expired token." });
      }
    }

    const documentId = req.params.id;
    const doc = await Document.findOne({ id: documentId, userId: authenticatedUserId });
    if (!doc || !doc.mediaPath || !fs.existsSync(doc.mediaPath)) {
      return res.status(404).json({ error: "Media file not found on server storage." });
    }

    const filePath = doc.mediaPath;
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const mimeType = doc.mimeType || "application/octet-stream";

    // Handle HTTP Range header for Audio & Video scrubbing / seeking
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": mimeType,
      };
      res.writeHead(206, head);
      fileStream.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": mimeType,
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error("Media stream error:", err);
    res.status(500).json({ error: "Failed to stream media file." });
  }
});

// Route: DELETE /api/documents/:id
// Deletes a document, purges vector cache, removes media file from disk, and purges chat history
router.delete("/documents/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const documentId = req.params.id;

    console.log(`[Delete] Removing document ${documentId} for user ${userId}`);

    const doc = await Document.findOneAndDelete({ id: documentId, userId });
    if (!doc) {
      return res.status(404).json({ error: "Document not found or unauthorized." });
    }

    // Clean up disk media file
    if (doc.mediaPath && fs.existsSync(doc.mediaPath)) {
      try {
        fs.unlinkSync(doc.mediaPath);
      } catch (e) {
        console.warn(`[Delete] Could not delete disk media file ${doc.mediaPath}:`, e.message);
      }
    }

    // Clean up in-memory vector cache & Pinecone namespace
    await removeDocumentFromRegistry(documentId);

    // Delete associated chat history
    await Chat.deleteMany({ documentId, userId });

    res.status(200).json({ 
      message: "Document and media deleted successfully.",
      documentId 
    });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({ error: "Failed to delete document.", details: error.message });
  }
});

// Route: GET /api/documents/:id/content
// Returns document chunks and multimodal metadata for in-app previewer
router.get("/documents/:id/content", authMiddleware, async (req, res) => {
  try {
    const documentId = req.params.id;
    const doc = await Document.findOne({ id: documentId, userId: req.user.id });
    const contentData = await getDocumentContent(documentId);

    res.status(200).json({ 
      chunks: contentData.chunks || [],
      fileType: doc?.fileType || contentData.fileType || "document",
      mimeType: doc?.mimeType || contentData.mimeType || "",
      mediaMetadata: doc?.mediaMetadata || contentData.mediaMetadata || {},
      filename: doc?.filename || "",
      hasMedia: Boolean(doc?.mediaPath && fs.existsSync(doc.mediaPath))
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load document content.", details: error.message });
  }
});

// Route: GET /api/documents/:id/analytics
// Returns document stats, readability score, and extracted topics
router.get("/documents/:id/analytics", authMiddleware, async (req, res) => {
  try {
    const documentId = req.params.id;
    const analytics = await getDocumentAnalytics(documentId);
    res.status(200).json({ analytics });
  } catch (error) {
    res.status(500).json({ error: "Failed to compute analytics.", details: error.message });
  }
});

// Route: POST /api/documents/:id/study
// Generates 5 MCQs, 6 concept flashcards, or cheatsheet
router.post("/documents/:id/study", authMiddleware, async (req, res) => {
  try {
    const documentId = req.params.id;
    const { type } = req.body; // 'quiz', 'flashcards', 'cheatsheet'
    const data = await generateStudyMaterials(documentId, type || "quiz");
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate study materials.", details: error.message });
  }
});

// Route: GET /api/documents/:id/starter-questions
// Returns 4 document-specific starter questions grounded in the document content
router.get("/documents/:id/starter-questions", authMiddleware, async (req, res) => {
  try {
    const documentId = req.params.id;
    const questions = await getDocumentStarterQuestions(documentId);
    res.status(200).json({ questions });
  } catch (error) {
    res.status(500).json({ error: "Failed to load starter questions.", details: error.message });
  }
});

// Route: POST /api/upload-url
// Ingests any Webpage, Article, Documentation, Wikipedia, YouTube, or direct media URL
router.post("/upload-url", authMiddleware, async (req, res) => {
  try {
    const { url, documentId } = req.body;
    if (!url || typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ error: "Please enter a valid webpage or media URL." });
    }

    const docId = documentId || Math.random().toString(36).substring(7);
    const docMeta = await ingestUrl(url, docId, req.user.id);

    res.status(200).json({
      message: "URL successfully fetched, analyzed, and indexed into vector memory.",
      document: {
        id: docMeta.id,
        userId: docMeta.userId,
        filename: docMeta.filename,
        fileType: docMeta.fileType,
        mimeType: docMeta.mimeType,
        mediaMetadata: docMeta.mediaMetadata,
        size: docMeta.size,
        chunkCount: docMeta.chunkCount,
        charCount: docMeta.charCount,
        uploadedAt: docMeta.uploadedAt.toISOString()
      }
    });
  } catch (error) {
    console.error("URL Ingestion Error:", error);
    res.status(500).json({ 
      error: "Failed to process URL.", 
      details: error.message 
    });
  }
});

export default router;
