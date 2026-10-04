import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import pdfParse from "pdf-parse";
import Document from "../models/Document.js";

import { 
  detectFileType, 
  analyzeImage, 
  analyzeAudio, 
  analyzeVideo, 
  analyzeData, 
  analyzeCode 
} from "./multimodalService.js";

// In-memory registry to hold active vector stores per document
// structure: { [documentId]: { vectorStore, chunks, usePinecone, docMeta } }
export const vectorStoreRegistry = {};

// Pinecone is optional. Never call pinecone.Index() with an empty/undefined name.
const getPineconeIndexName = () => (process.env.PINECONE_INDEX_NAME || "").trim();
const isPineconeConfigured = () =>
  process.env.USE_PINECONE === "true" &&
  !!process.env.PINECONE_API_KEY &&
  !!getPineconeIndexName();

/**
 * Rehydrates a document's chunks and vector store from MongoDB if missing from RAM
 */
export async function getOrRehydrateDocument(documentId, needVectorStore = false) {
  let entry = vectorStoreRegistry[documentId];
  if (entry && (!needVectorStore || entry.vectorStore)) {
    return entry;
  }

  // Fetch document from MongoDB
  const doc = await Document.findOne({ id: documentId });
  if (!doc) {
    throw new Error("This document was not found in the database. Please upload it again.");
  }

  if ((!doc.chunks || doc.chunks.length === 0) && (!doc.rawText || doc.rawText.trim().length === 0)) {
    throw new Error("This document was uploaded before persistent vector caching was enabled. Please re-upload it in the left panel to chat.");
  }

  console.log(`[RAG Service] Auto-rehydrating document "${doc.filename}" (${documentId}, ${doc.fileType || "document"}) from MongoDB...`);

  let chunks = doc.chunks;
  if (!chunks || chunks.length === 0) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const splitDocs = await splitter.createDocuments([doc.rawText]);
    chunks = splitDocs.map((c, i) => ({
      pageContent: c.pageContent,
      metadata: { chunkId: i, documentId, length: c.pageContent.length, modality: doc.fileType || "document" }
    }));
  }

  let vectorStore = entry?.vectorStore || null;
  if (needVectorStore && !vectorStore) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing in server .env.");
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      modelName: "gemini-embedding-001",
      maxRetries: 3
    });
    vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
  }

  vectorStoreRegistry[documentId] = {
    vectorStore,
    chunks,
    usePinecone: false,
    docMeta: {
      fileType: doc.fileType || "document",
      mimeType: doc.mimeType || "",
      mediaPath: doc.mediaPath || "",
      mediaMetadata: doc.mediaMetadata || {}
    }
  };

  return vectorStoreRegistry[documentId];
}

/**
 * Extracts text and structured semantic data from any media buffer (Image, Audio, Video, CSV, Code, PDF, TXT, MD),
 * splits it into timestamped/contextual chunks, and stores the embeddings.
 */
export async function processDocument(fileBuffer, documentId, filename = "", mimeType = "") {
  // Use server env API key for embeddings
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Master Gemini API Key is missing on the server. Please check .env config.");
  }

  const { category, mimeType: resolvedMime } = detectFileType(filename, mimeType);
  console.log(`[RAG Service] Processing ${category.toUpperCase()} document: "${filename}" (${fileBuffer.length} bytes)...`);

  let rawText = "";
  let chunks = [];
  let mediaMetadata = {};

  if (category === "image") {
    const res = await analyzeImage(fileBuffer, resolvedMime, filename);
    rawText = res.rawText;
    chunks = res.chunks;
    mediaMetadata = res.mediaMetadata;
  } else if (category === "audio") {
    const res = await analyzeAudio(fileBuffer, resolvedMime, filename);
    rawText = res.rawText;
    chunks = res.chunks;
    mediaMetadata = res.mediaMetadata;
  } else if (category === "video") {
    const res = await analyzeVideo(fileBuffer, resolvedMime, filename);
    rawText = res.rawText;
    chunks = res.chunks;
    mediaMetadata = res.mediaMetadata;
  } else if (category === "data") {
    const res = await analyzeData(fileBuffer, filename);
    rawText = res.rawText;
    chunks = res.chunks;
    mediaMetadata = res.mediaMetadata;
  } else if (category === "code") {
    const res = await analyzeCode(fileBuffer, filename);
    rawText = res.rawText;
    chunks = res.chunks;
    mediaMetadata = res.mediaMetadata;
  } else {
    // Document (PDF, TXT, MD)
    const lowerName = (filename || "").toLowerCase();
    if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
      rawText = fileBuffer.toString("utf-8");
    } else {
      const pdfData = await pdfParse(fileBuffer);
      rawText = pdfData.text;
    }

    if (!rawText || rawText.trim().length === 0) {
      throw new Error("No text could be extracted from this document. It might be scanned, binary, or empty.");
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splitDocs = await splitter.createDocuments([rawText]);
    chunks = splitDocs.map((c, i) => ({
      pageContent: c.pageContent,
      metadata: {
        chunkId: i,
        documentId: documentId,
        length: c.pageContent.length,
        modality: "document"
      }
    }));
  }

  // Ensure metadata has chunkId, documentId, and length
  chunks.forEach((chunk, index) => {
    chunk.metadata = {
      ...(chunk.metadata || {}),
      chunkId: index,
      documentId: documentId,
      length: chunk.pageContent.length,
    };
  });

  // Initialize Embeddings and Vector Store
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: apiKey,
    modelName: "gemini-embedding-001",
    maxRetries: 3
  });

  let vectorStore;
  let usePinecone = isPineconeConfigured();

  if (usePinecone) {
    console.log(`[RAG Service] Indexing document ${documentId} on Pinecone Cloud...`);
    try {
      const pinecone = new PineconeClient({
        apiKey: process.env.PINECONE_API_KEY
      });
      const pineconeIndex = pinecone.Index(getPineconeIndexName());

      const pineconeUploadPromise = PineconeStore.fromDocuments(chunks, embeddings, {
        pineconeIndex,
        namespace: documentId
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Pinecone upload timeout")), 60000)
      );

      vectorStore = await Promise.race([pineconeUploadPromise, timeoutPromise]);
      console.log("[RAG Service] Pinecone Cloud indexing completed successfully!");
    } catch (pineconeError) {
      console.warn(`[RAG Service] Pinecone upload failed or timed out (${pineconeError.message}). Falling back to local RAM MemoryVectorStore!`);
      vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
      usePinecone = false;
    }
  } else {
    console.log("[RAG Service] Storing in local RAM MemoryVectorStore...");
    vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
  }

  // Store in registry
  vectorStoreRegistry[documentId] = {
    vectorStore,
    chunks,
    usePinecone,
    docMeta: {
      fileType: category,
      mimeType: resolvedMime,
      mediaMetadata
    }
  };

  return {
    chunkCount: chunks.length,
    charCount: rawText.length,
    rawText,
    fileType: category,
    mimeType: resolvedMime,
    mediaMetadata,
    chunks: chunks.map(c => ({
      pageContent: c.pageContent,
      metadata: c.metadata
    }))
  };
}

/**
 * Indexes raw text / webpage content into vector memory and registers it
 */
export async function processTextDocument(rawText, documentId, filename = "", fileType = "webpage", mimeType = "text/html", mediaMetadata = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Master Gemini API Key is missing on the server. Please check .env config.");
  }

  if (!rawText || rawText.trim().length === 0) {
    throw new Error("No text content could be extracted from this URL.");
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const splitDocs = await splitter.createDocuments([rawText]);
  const chunks = splitDocs.map((c, i) => ({
    pageContent: c.pageContent,
    metadata: {
      chunkId: i,
      documentId: documentId,
      length: c.pageContent.length,
      modality: fileType
    }
  }));

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: apiKey,
    modelName: "gemini-embedding-001",
    maxRetries: 3
  });

  let vectorStore;
  let usePinecone = isPineconeConfigured();

  if (usePinecone) {
    try {
      const pinecone = new PineconeClient({ apiKey: process.env.PINECONE_API_KEY });
      const pineconeIndex = pinecone.Index(getPineconeIndexName());
      const pineconeUploadPromise = PineconeStore.fromDocuments(chunks, embeddings, {
        pineconeIndex,
        namespace: documentId
      });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Pinecone upload timeout")), 60000)
      );
      vectorStore = await Promise.race([pineconeUploadPromise, timeoutPromise]);
    } catch (pineconeError) {
      console.warn("Pinecone upload error for URL:", pineconeError.message);
      vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
      usePinecone = false;
    }
  } else {
    vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
  }

  vectorStoreRegistry[documentId] = {
    vectorStore,
    chunks,
    usePinecone,
    docMeta: {
      fileType,
      mimeType,
      mediaMetadata    }
  };

  return {
    chunkCount: chunks.length,
    charCount: rawText.length,
    rawText,
    fileType,
    mimeType,
    mediaMetadata,
    chunks: chunks.map(c => ({
      pageContent: c.pageContent,
      metadata: c.metadata
    }))
  };
}

/**
 * Custom Hybrid Search (Dense Vector Similarity + Sparse Keyword Matching)
 */
function performHybridSearch(documentId, query, vectorStoreResults, limit = 4) {
  const registryEntry = vectorStoreRegistry[documentId];
  const chunks = registryEntry ? registryEntry.chunks : vectorStoreResults;
  
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);

  // 1. Calculate keyword score for each chunk (simple frequency density)
  const keywordScores = {};
  chunks.forEach(chunk => {
    const chunkText = chunk.pageContent.toLowerCase();
    let matches = 0;
    
    queryTerms.forEach(term => {
      // Basic count of how many times the query terms appear
      const regex = new RegExp(term.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
      const count = (chunkText.match(regex) || []).length;
      matches += count;
    });

    // Divide by chunk length to normalize density
    keywordScores[chunk.metadata.chunkId] = matches / (chunk.pageContent.split(/\s+/).length || 1);
  });

  // Find max keyword score for normalization
  const maxKeywordScore = Math.max(...Object.values(keywordScores), 0.001);

  // 2. Blend scores: Reciprocal Rank Fusion (RRF) or Weighted Combination
  // We'll normalize and combine: Final = VectorScore * 0.7 + KeywordScore * 0.3
  const blendedResults = vectorStoreResults.map(vectorRes => {
    const chunkId = vectorRes.metadata.chunkId;
    const vectorScore = vectorRes.metadata.score || 0.5; // Similarity score (0 to 1)
    const normalizedKeyword = (keywordScores[chunkId] || 0) / maxKeywordScore;

    const finalScore = (vectorScore * 0.7) + (normalizedKeyword * 0.3);

    return {
      document: vectorRes,
      score: finalScore
    };
  });

  // Sort and select top results
  blendedResults.sort((a, b) => b.score - a.score);
  return blendedResults.slice(0, limit).map(item => item.document);
}

/**
 * Extracts explicit or natural language timestamps from query
 * e.g., "02:15", "2:15", "at 5 minutes", "around 90 seconds", "between 01:00 and 02:00"
 */
export function parseQueryTimestamp(question) {
  if (!question || typeof question !== "string") return null;

  // 1. Explicit MM:SS or HH:MM:SS (e.g. 02:15, 2:15, 1:04:20, [02:15], 02:15 - 02:45)
  const timeRegex = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/;
  const match = question.match(timeRegex);
  if (match) {
    const hrs = match[1] ? parseInt(match[1], 10) : 0;
    const mins = parseInt(match[2], 10);
    const secs = parseInt(match[3], 10);
    const totalSec = (hrs * 3600) + (mins * 60) + secs;
    const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return { targetSec: totalSec, formatted, raw: match[0] };
  }

  // 2. Natural language phrases (e.g. "at 5 minutes", "at 5 mins", "around 90 seconds", "at 3 min mark")
  const natMatch = question.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|seconds?|secs?|min|sec)\b/i);
  if (natMatch) {
    const val = parseFloat(natMatch[1]);
    const isMin = /min/i.test(natMatch[0]);
    const totalSec = Math.round(isMin ? val * 60 : val);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return { targetSec: totalSec, formatted, raw: natMatch[0] };
  }

  return null;
}

/**
 * RAG Query Orchestrator
 * Triggers routing, retrieval, temporal filtering, cross-document comparison, QA response, and self-evaluation.
 */
export async function queryDoc(documentId, question, chatHistory, compareDocIds = null, userId = null) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("Master Groq API Key is missing on the server. Please check .env config.");
  }

  const groqModelName = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  // Initialize Groq model
  const model = new ChatGroq({
    apiKey: groqApiKey,
    model: groqModelName,
    temperature: 0.1,
    maxRetries: 0
  });

  let vectorStore;
  const usePinecone = isPineconeConfigured();
  let registryEntry = vectorStoreRegistry[documentId];

  if (registryEntry && registryEntry.vectorStore) {
    vectorStore = registryEntry.vectorStore;
  } else if (usePinecone) {
    console.log(`[RAG Service] Re-initializing Pinecone retriever for document ${documentId}...`);
    try {
      const pinecone = new PineconeClient({
        apiKey: process.env.PINECONE_API_KEY
      });
      const pineconeIndex = pinecone.Index(getPineconeIndexName());
      
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GEMINI_API_KEY,
        modelName: "gemini-embedding-001",
        maxRetries: 3
      });

      const pineconePromise = PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex,
        namespace: documentId
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Pinecone connection timeout")), 6000)
      );

      vectorStore = await Promise.race([pineconePromise, timeoutPromise]);
    } catch (err) {
      console.warn(`[RAG Service] Pinecone retriever re-initialization failed: ${err.message}. Trying local rehydration...`);
      registryEntry = await getOrRehydrateDocument(documentId, true);
      vectorStore = registryEntry.vectorStore;
    }
  } else {
    // Rehydrate from MongoDB persistence
    registryEntry = await getOrRehydrateDocument(documentId, true);
    vectorStore = registryEntry.vectorStore;
  }

  // --- Step 1: Agentic Query Routing ---
  const routingPrompt = `
You are an AI router. Classify the following user message into one of three categories:
1. "GREET": A general greeting, hello, thanks, or small talk (e.g. "hello", "how are you", "thank you").
2. "SUMMARY": A request to summarize the document (e.g. "give me a summary", "what is this document about?").
3. "QA": A specific factual query seeking information from the document (e.g. "what is the revenue in 2024?", "explain clause 4").

Output ONLY the category name ("GREET", "SUMMARY", or "QA") in uppercase. Do not explain.

User Message: "${question}"
Router Classification:`;

  console.log("[RAG Service] Routing query classification...");
  let intent = "QA";
  try {
    const routeResponse = await model.invoke(routingPrompt);
    intent = routeResponse.content.trim().toUpperCase();
  } catch (err) {
    console.warn("[RAG Service] Groq Router failed, falling back to direct fetch classification...", err.message);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: groqModelName,
          messages: [{ role: "user", content: routingPrompt }],
          temperature: 0.0
        }),
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        intent = data.choices[0].message.content.trim().toUpperCase();
      }
    } catch (fetchErr) {
      console.error("[RAG Service] Direct fetch router fallback failed too:", fetchErr.message);
    }
  }
  
  // Guarantee clean parsing
  if (!["GREET", "SUMMARY", "QA"].includes(intent)) {
    intent = "QA";
  }
  console.log(`[Router] Classified intent for "${question}": ${intent}`);

  if (intent === "GREET") {
    return {
      answer: "Hello! I am PaperPulse AI. I have processed your document and am ready to answer any specific questions you have about it. How can I help you today?",
      intent,
      sources: [],
      evaluation: { score: 100, reasoning: "General greeting, no document lookup needed." },
      suggestedQuestions: [
        "Give me an executive summary of this document with key takeaways.",
        "What are the most critical facts, numbers, and findings in this document?",
        "What risks, constraints, or caveats are highlighted in this document?",
        "What recommendations, action items, or conclusions are provided?"
      ]
    };
  }

  // --- Check Temporal Timestamp in Question (for Videos / Audio) ---
  const timeQuery = parseQueryTimestamp(question);
  if (timeQuery) {
    console.log(`[RAG Service] Detected temporal timestamp query: target=${timeQuery.formatted} (${timeQuery.targetSec}s)`);
  }

  // --- Check Multi-Document Comparison Intent ---
  const isComparisonQuery = (Array.isArray(compareDocIds) && compareDocIds.length > 1) ||
    /\b(compare|contrast|differences?|similarit(y|ies)|versus|vs\.?|across (both|all)|between (the )?documents|between (the )?files|across all uploads)\b/i.test(question);

  // --- Step 2: Context Retrieval & Hybrid Search ---
  let contextDocs = [];
  let comparisonDocHeaders = [];

  if (isComparisonQuery) {
    console.log("[RAG Service] Executing Multi-Document Comparison Retrieval...");
    let targetDocIds = Array.isArray(compareDocIds) && compareDocIds.length > 0 ? compareDocIds : [documentId];

    // If only 1 doc is passed but user explicitly asks to compare library uploads, retrieve user's recent docs
    if (targetDocIds.length === 1 && userId) {
      try {
        const userDocs = await Document.find({ userId }).sort({ uploadedAt: -1 }).limit(4);
        if (userDocs && userDocs.length > 1) {
          targetDocIds = userDocs.map(d => d.id);
        }
      } catch (err) {
        console.warn("[RAG Service] Failed to lookup user documents for auto-compare:", err.message);
      }
    }

    // Retrieve relevant chunks from each target document
    for (const dId of targetDocIds) {
      try {
        const entry = await getOrRehydrateDocument(dId, false);
        const docRecord = await Document.findOne({ id: dId });
        const docName = docRecord?.filename || `Document ${dId}`;
        const docCategory = docRecord?.fileType || "document";

        comparisonDocHeaders.push({ id: dId, filename: docName, fileType: docCategory });

        // Retrieve top chunks from this document
        let docChunks = [];
        if (entry.vectorStore) {
          const raw = await entry.vectorStore.similaritySearch(question, 4);
          docChunks = raw;
        } else if (entry.chunks && entry.chunks.length > 0) {
          docChunks = entry.chunks.slice(0, 4);
        }

        docChunks.forEach((c, idx) => {
          contextDocs.push({
            pageContent: `[Document: "${docName}" (${docCategory}) | Chunk ${idx + 1}]\n${c.pageContent}`,
            metadata: { ...c.metadata, documentId: dId, documentName: docName }
          });
        });
      } catch (err) {
        console.warn(`[RAG Service] Could not rehydrate comparison doc ${dId}:`, err.message);
      }
    }
  } else if (timeQuery && registryEntry?.chunks && registryEntry.chunks.length > 0) {
    // Exact & Proximity Temporal Chunk Search
    console.log(`[RAG Service] Running temporal range filter for target timestamp ${timeQuery.formatted}...`);
    
    // Find chunks that match or surround the target timestamp
    const temporalChunks = registryEntry.chunks.filter(c => {
      const s = c.metadata?.startSec;
      const e = c.metadata?.endSec || (s !== null && s !== undefined ? s + 35 : null);
      if (s !== null && s !== undefined) {
        return (timeQuery.targetSec >= s - 15 && timeQuery.targetSec <= (e || s) + 20) ||
               Math.abs(s - timeQuery.targetSec) <= 45;
      }
      // Fallback text check for timestamp in chunk text
      return c.pageContent.includes(timeQuery.formatted) || c.pageContent.includes(timeQuery.raw);
    });

    if (temporalChunks.length > 0) {
      console.log(`[RAG Service] Found ${temporalChunks.length} matching temporal scene chunks!`);
      contextDocs = temporalChunks.slice(0, 5);
    } else {
      // If direct filter didn't catch, fallback to vector similarity
      const rawMatches = await vectorStore.similaritySearch(question, 6);
      contextDocs = performHybridSearch(documentId, question, rawMatches, 4);
    }
  } else if (intent === "SUMMARY") {
    if (registryEntry) {
      contextDocs = registryEntry.chunks.slice(0, 6);
    } else {
      console.log("[RAG Service] Summary intent fallback. Retrieving top namespace vectors from Pinecone...");
      const rawMatches = await vectorStore.similaritySearch(question || "summary overview document", 6);
      contextDocs = rawMatches;
    }
  } else {
    console.log("[RAG Service] Starting vector similarity search...");
    const rawMatches = await vectorStore.similaritySearch(question, 8);
    console.log(`[RAG Service] Similarity search complete. Found ${rawMatches.length} raw matches.`);
    
    contextDocs = performHybridSearch(documentId, question, rawMatches, 4);
    console.log(`[RAG Service] Hybrid search complete. Retained ${contextDocs.length} top chunks.`);
  }

  const contextText = contextDocs.map((doc, idx) => `[Source ${idx + 1}]:\n${doc.pageContent}`).join("\n\n");

  const formattedHistory = (chatHistory || [])
    .map(msg => `${msg.sender === "user" ? "Human" : "Assistant"}: ${msg.text}`)
    .join("\n");

  // Custom directive depending on query intent
  let specificDirective = "";
  if (timeQuery) {
    specificDirective = `
TEMPORAL TIMESTAMP INSTRUCTION:
- The user is specifically inquiring about timestamp [${timeQuery.formatted}] (around ${timeQuery.targetSec} seconds into the video/audio).
- Detail what is occurring visually on screen (actions, slides, diagrams, code, UI, or text) AND what is spoken in the dialogue at this timestamp.
- Always include the interactive timestamp citation [${timeQuery.formatted}] in your answer so the user can click to jump directly to this moment in the media player.`;
  } else if (isComparisonQuery) {
    specificDirective = `
CROSS-DOCUMENT COMPARISON INSTRUCTION:
- The user is asking to compare multiple uploaded files/documents.
- Provide a structured comparative analysis formatted with these sections:
  1. 📋 **Executive Comparison Summary**: Core similarities and contrasts at a glance.
  2. 🔍 **Key Differences & Divergent Data Points**: Direct comparison of conflicting or unique findings in each document.
  3. 🤝 **Shared Themes & Synergies**: What principles, metrics, or points both files agree on.
  4. 📊 **Comparison Summary Table**: A markdown table comparing key dimensions across the documents.
  5. 🎯 **Conclusion / Key Takeaway**.`;
  }

  // --- Step 3: RAG Response Generation ---
  const ragSystemPrompt = `
You are PaperPulse AI, an advanced universal multimodal intelligence platform. Your goal is to answer the user's question accurately using ONLY the provided document and media context.

CONSTRAINTS:
1. Rely strictly on the facts, visual observations, OCR transcripts, audio segments, and data provided in the Context below. Do not make up facts.
2. If the context does not contain the answer, say: "I cannot find the answer in the uploaded file." Do not try to answer from external knowledge.
3. Be professional, concise, and highlight citations in your answer when referencing specific details.
4. MULTIMODAL CITATIONS:
   - For audio or video context with timestamps, ALWAYS cite the exact timestamp marker (e.g. [01:23] or [04:15]) in your response so the user can click it to jump to that moment in the media player.
   - For images, infographics, and diagrams, explicitly describe the visual elements, detected OCR text, and chart trendlines.
   - For spreadsheets and datasets, reference the column names, sample rows, and computed statistics.
${specificDirective}

Context:
${contextText}

Chat History:
${formattedHistory}

Human Question: ${question}
Assistant Answer:`;


  console.log("[RAG Service] Generating context answer...");
  let answer = "";
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("LangChain Timeout")), 8000));
    
    try {
      const finalResponse = await Promise.race([model.invoke(ragSystemPrompt), timeoutPromise]);
      answer = finalResponse.content;
      console.log("[RAG Service] Answer generated successfully by LangChain Groq.");
    } catch (lcError) {
      console.warn(`[RAG Service] LangChain Groq failed or timed out: ${lcError.message}. Trying Groq direct fetch...`);
      let groqSuccess = false;
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: groqModelName,
            messages: [{ role: "user", content: ragSystemPrompt }],
            temperature: 0.1
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          const data = await res.json();
          answer = data.choices[0].message.content;
          groqSuccess = true;
          console.log("[RAG Service] Answer generated successfully by Fallback Fetch (Groq).");
        }
      } catch (fErr) {
        console.warn("[RAG Service] Groq direct fetch error:", fErr.message);
      }

      // If Groq was not successful, fallback to Gemini 2.5 Flash
      if (!groqSuccess) {
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) throw new Error("Both Groq and Gemini API keys are unavailable.");
        console.log("[RAG Service] Generating answer using Gemini 2.5 Flash fallback...");
        const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: ragSystemPrompt }] }]
          }),
          signal: AbortSignal.timeout(20000)
        });
        if (!gRes.ok) {
          const gErr = await gRes.text();
          throw new Error(`Gemini generation failed: ${gErr}`);
        }
        const gData = await gRes.json();
        answer = gData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log("[RAG Service] Answer generated successfully by Gemini 2.5 Flash.");
      }
    }
  } catch (err) {
    console.log(`[RAG Service] GENERATION ERROR: ${err.message}`);
    throw new Error(`Generation failed: ${err.message}`);
  }

  // --- Step 4: LLM-as-a-Judge Evaluation (Hallucination Detection) ---
  const evalPrompt = `
You are an independent AI QA Auditor. Your task is to rate the truthfulness/groundedness of the generated answer compared to the source context provided.
Answer must be fully supported by the context to get a 100. If it includes facts not explicitly in the context, deduct points.

Context:
${contextText}

Generated Answer:
${answer}

Return your audit in JSON format with two fields:
- "score": A number from 0 to 100 representing how grounded the answer is.
- "reasoning": A single sentence explaining why you gave that score.

JSON output:`;

  const evalModel = new ChatGroq({
    apiKey: groqApiKey,
    model: groqModelName,
    temperature: 0.0,
    maxRetries: 0
  });

  let evaluation = { score: 100, reasoning: "Evaluation bypass." };
  try {
    console.log("[RAG Service] Auditing answer faithfulness...");
    const timeoutPromiseEval = new Promise((_, reject) => setTimeout(() => reject(new Error("Eval Timeout")), 8000));    
    try {
      const evalResponse = await Promise.race([evalModel.invoke(evalPrompt), timeoutPromiseEval]);
      const cleanJson = evalResponse.content.replace(/```json/g, "").replace(/```/g, "").trim();
      evaluation = JSON.parse(cleanJson);
      console.log("[RAG Service] Faithfulness audit completed by LangChain Groq.");
    } catch (evalError) {
      console.warn(`[RAG Service] LangChain Groq eval failed/timed out: ${evalError.message}. Falling back to Groq fetch!`);
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: groqModelName,
          messages: [{ role: "user", content: evalPrompt }],
          temperature: 0.0
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) throw new Error(`Groq fallback eval failed: ${await res.text()}`);
      const data = await res.json();
      const rawResponse = data.choices[0].message.content;
      const cleanJson = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      evaluation = JSON.parse(cleanJson);
      console.log("[RAG Service] Faithfulness audit completed by Fallback Fetch (Groq).");
    }
  } catch (e) {
    console.error("Self-evaluation failed:", e.message);
  }

  // --- Step 5: Document-Grounded Dynamic Follow-Up Suggestions ---
  let suggestedQuestions = [];
  try {
    const contextSnippet = contextDocs.map(d => d.pageContent).join("\n\n").slice(0, 1800);
    const fileCategory = registryEntry?.docMeta?.fileType || "document";
    const followUpPrompt = `You are a strict document intelligence assistant.
Analyze this context excerpt extracted directly from the user's uploaded ${fileCategory}:

DOCUMENT CONTEXT (GROUND TRUTH):
"""
${contextSnippet}
"""

RECENT USER QUESTION:
"${question}"

ANSWER GIVEN:
"${answer.slice(0, 400)}"

TASK:
Formulate 3 to 4 natural follow-up questions that explore ONLY the details, objects, text, and facts contained in THIS specific uploaded file.

CRITICAL RULES (STRICTLY ENFORCED):
1. 100% GROUNDED IN THE UPLOADED FILE: Every question MUST be answerable solely from the uploaded file's content shown in the excerpt above.
2. ABSOLUTELY NO EXTERNAL STUDIES OR GENERAL WORLD TRIVIA: NEVER ask about external academic research, scientific studies, psychological papers, or outside history unless explicitly mentioned in this document excerpt. (For example, if the document describes an image with red background, NEVER ask "What are the seminal studies on red's emotional impact?" — instead ask about the specific visual elements, lighting, pose, watermark, or composition described in this file!).
3. SPECIFIC DETAILS: Focus on specific entities, numbers, visible features, sections, or terminology actually present in the excerpt.
4. NO GENERIC QUESTIONS: Do not ask "Can you elaborate?", "What are the key takeaways?", or "What else can you say?".
5. Keep each question concise and direct (under 12 words).

Return ONLY a valid JSON array of 3-4 string questions. No markdown formatting, backticks, or commentary.`;

    const followUpRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: groqModelName,
        messages: [{ role: "user", content: followUpPrompt }],
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (followUpRes.ok) {
      const fData = await followUpRes.json();
      const rawText = fData.choices?.[0]?.message?.content || "";
      const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        suggestedQuestions = parsed.slice(0, 4).map(q => typeof q === "string" ? q.trim() : String(q));
      }
    }
  } catch (followErr) {
    console.warn("[RAG Service] Dynamic follow-up question generation skipped:", followErr.message);
  }

  if (!suggestedQuestions || suggestedQuestions.length === 0) {
    // Generate context-aware fallback questions from context topics
    const sampleWords = contextDocs[0]?.pageContent?.split(/\s+/).slice(0, 15).join(" ") || "this section";
    suggestedQuestions = [
      `What additional details are provided regarding ${sampleWords.slice(0, 30)}...?`,
      "What are the most critical evidence points or data mentioned?",
      "Are there any constraints, risks, or conditions outlined?",
      "What practical implications or recommendations are given?"
    ];
  }

  return {
    answer,
    intent,
    sources: contextDocs.map(doc => ({
      chunkId: doc.metadata.chunkId,
      text: doc.pageContent,
      length: doc.metadata.length
    })),
    evaluation,
    suggestedQuestions
  };
}

/**
 * Clean up document from in-memory registry and Pinecone if configured.
 */
export async function removeDocumentFromRegistry(documentId) {
  if (vectorStoreRegistry[documentId]) {
    delete vectorStoreRegistry[documentId];
    console.log(`[RAG Service] Cleared memory vector store for document ${documentId}`);
  }
  if (isPineconeConfigured()) {
    try {
      const pinecone = new PineconeClient({ apiKey: process.env.PINECONE_API_KEY });
      const index = pinecone.Index(getPineconeIndexName());
      await index.namespace(documentId).deleteAll();
      console.log(`[RAG Service] Deleted Pinecone namespace for document ${documentId}`);
    } catch (e) {
      console.warn(`[RAG Service] Failed to delete Pinecone namespace ${documentId}:`, e.message);
    }
  }
}

export const processPdf = processDocument;

/**
 * Retrieves raw chunks text for in-app previewer
 */
export async function getDocumentContent(documentId) {
  let entry = vectorStoreRegistry[documentId];
  if (!entry || !entry.chunks) {
    try {
      entry = await getOrRehydrateDocument(documentId, false);
    } catch (e) {
      return { chunks: [], fileType: "document", mediaMetadata: {} };
    }
  }

  const chunks = (entry.chunks || []).map(c => ({
    chunkId: c.metadata.chunkId,
    text: c.pageContent,
    length: c.metadata.length || c.pageContent.length,
    timestamp: c.metadata.timestamp || null,
    startSec: c.metadata.startSec ?? null,
    modality: c.metadata.modality || entry.docMeta?.fileType || "document"
  }));

  return {
    chunks,
    fileType: entry.docMeta?.fileType || "document",
    mimeType: entry.docMeta?.mimeType || "",
    mediaMetadata: entry.docMeta?.mediaMetadata || {},
    mediaPath: entry.docMeta?.mediaPath || ""
  };
}

/**
 * Generates interactive study materials (5 MCQs or 6 Flashcards)
 */
export async function generateStudyMaterials(documentId, type = "quiz") {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) throw new Error("Groq API Key is missing on the server.");

  let entry = vectorStoreRegistry[documentId];
  if (!entry || !entry.chunks || entry.chunks.length === 0) {
    entry = await getOrRehydrateDocument(documentId, false);
  }

  const sampleContext = entry.chunks.slice(0, 8).map(c => c.pageContent).join("\n\n");
  const groqModelName = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const model = new ChatGroq({ apiKey: groqApiKey, model: groqModelName, temperature: 0.2 });

  if (type === "quiz") {
    const prompt = `Based on the following document context, create 5 multiple choice quiz questions to test understanding of the key facts.
Return ONLY valid JSON in this exact structure with no extra text or markdown codeblocks:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answerIndex": 0,
    "explanation": "Brief explanation why this is correct."
  }
]

Document Context:
${sampleContext}`;

    const res = await model.invoke(prompt);
    const cleanJson = res.content.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);
  } else if (type === "cheatsheet") {
    const prompt = `Based on the following document context, generate 4 to 6 high-yield executive cheat sheet topics with critical bullet points.
Return ONLY valid JSON in this exact structure with no extra text or markdown codeblocks:
[
  {
    "title": "Topic or Section Title",
    "takeaways": [
      "Key essential fact, rule, or takeaway 1",
      "Key essential fact, rule, or takeaway 2",
      "Key essential fact, rule, or takeaway 3"
    ],
    "importance": "Critical"
  }
]

Document Context:
${sampleContext}`;

    const res = await model.invoke(prompt);
    const cleanJson = res.content.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);
  } else {
    const prompt = `Based on the following document context, create 6 key concept study flashcards.
Return ONLY valid JSON in this exact structure with no extra text or markdown codeblocks:
[
  {
    "front": "Concept or Question",
    "back": "Clear definition, key fact, or answer",
    "category": "Core Concept"
  }
]

Document Context:
${sampleContext}`;

    const res = await model.invoke(prompt);
    const cleanJson = res.content.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson);
  }
}

/**
 * Calculates document statistics & readability metrics
 */
export async function getDocumentAnalytics(documentId) {
  let entry = vectorStoreRegistry[documentId];
  if (!entry || !entry.chunks || entry.chunks.length === 0) {
    try {
      entry = await getOrRehydrateDocument(documentId, false);
    } catch {
      return {
        wordCount: 0,
        charCount: 0,
        readingTimeMin: 1,
        readabilityScore: 70,
        readabilityGrade: "Standard",
        keyTopics: ["Document Overview"]
      };
    }
  }

  const allText = entry.chunks.map(c => c.pageContent).join(" ");
  const words = allText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const charCount = allText.length;
  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  const sentences = allText.split(/[.!?]+/).filter(Boolean).length || 1;
  const avgWordsPerSentence = wordCount / sentences;
  const avgSyllablesPerWord = 1.5;
  const fleschScore = Math.max(0, Math.min(100, Math.round(206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord))));

  let readabilityGrade = "Standard";
  if (fleschScore >= 80) readabilityGrade = "Easy / Conversational";
  else if (fleschScore >= 60) readabilityGrade = "Standard Reader";
  else if (fleschScore >= 40) readabilityGrade = "Advanced / College Level";
  else readabilityGrade = "Technical / Specialized";

  const sample = entry.chunks.slice(0, 3).map(c => c.pageContent).join(" ");
  let keyTopics = ["Document Context", "Overview", "Analysis"];
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (groqApiKey) {
      const groqModelName = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
      const model = new ChatGroq({ apiKey: groqApiKey, model: groqModelName, temperature: 0.1 });
      const res = await model.invoke(`Extract 5 to 7 key topic entities, concepts, or subjects from this text. Return ONLY a comma-separated list of short phrases.\n\nText: ${sample.slice(0, 1500)}`);
      keyTopics = res.content.split(",").map(t => t.trim().replace(/^[-*•]\s*/, "")).filter(Boolean).slice(0, 6);
    }
  } catch (err) {
    console.warn("Topic extraction fallback:", err.message);
  }

  return {
    wordCount,
    charCount,
    readingTimeMin,
    readabilityScore: fleschScore,
    readabilityGrade,
    keyTopics  };
}

/**
 * Generates 4 high-yield starter questions strictly grounded in the document's actual content
 */
export async function getDocumentStarterQuestions(documentId) {
  let entry = vectorStoreRegistry[documentId];
  if (!entry || !entry.chunks || entry.chunks.length === 0) {
    try {
      entry = await getOrRehydrateDocument(documentId, false);
    } catch {
      return [
        "What is an executive summary of this file?",
        "What are the most critical facts and findings?",
        "What risks or caveats are highlighted?",
        "What action items or next steps are recommended?"
      ];
    }
  }

  // Check if already stored in docMeta
  if (entry.docMeta?.mediaMetadata?.starterQuestions && entry.docMeta.mediaMetadata.starterQuestions.length > 0) {
    return entry.docMeta.mediaMetadata.starterQuestions;
  }

  const sampleText = entry.chunks.slice(0, 5).map(c => c.pageContent).join("\n\n").slice(0, 2200);
  const groqApiKey = process.env.GROQ_API_KEY;
  const groqModelName = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  try {
    if (groqApiKey) {
      const prompt = `You are an expert document researcher. Read this excerpt from the uploaded file:
"""
${sampleText}
"""

TASK:
Generate 4 natural, engaging starter questions that a user would ask about THIS SPECIFIC file's contents.

STRICT REQUIREMENTS:
1. Every question MUST be answerable solely from the uploaded document's contents above.
2. DO NOT ask about external research, outside studies, or world trivia.
3. Every question MUST directly mention specific names, topics, metrics, visual elements, or sections present in this excerpt.
4. Absolutely DO NOT generate generic questions (like "What is this file about?" or "Can you summarize?").
5. Make each question concise and punchy (under 12 words).

Return ONLY a valid JSON array of 4 question strings, with no markdown codeblocks, backticks, or explanation.`;

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: groqModelName,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        const rawJson = data.choices?.[0]?.message?.content || "";
        const clean = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const questions = parsed.slice(0, 4).map(q => String(q).trim());
          if (!entry.docMeta) entry.docMeta = {};
          if (!entry.docMeta.mediaMetadata) entry.docMeta.mediaMetadata = {};
          entry.docMeta.mediaMetadata.starterQuestions = questions;
          Document.updateOne({ id: documentId }, { "mediaMetadata.starterQuestions": questions }).catch(() => {});
          return questions;
        }
      }
    }
  } catch (err) {
    console.warn("Document starter questions generation fallback:", err.message);
  }

  return [
    "What is an executive summary of this file?",
    "What are the most critical facts and findings?",
    "What risks or caveats are highlighted?",
    "What action items or next steps are recommended?"
  ];
}