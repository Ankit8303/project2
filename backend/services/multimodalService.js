import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

/**
 * Detects category and specific file type from filename and MIME type
 */
export function detectFileType(filename = "", mimeType = "") {
  const lower = filename.toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  // Images
  if (
    mime.startsWith("image/") ||
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".bmp") ||
    lower.endsWith(".svg")
  ) {
    return { category: "image", mimeType: mime || getMimeFromExtension(lower) };
  }

  // Audio
  if (
    mime.startsWith("audio/") ||
    lower.endsWith(".mp3") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".ogg") ||
    lower.endsWith(".aac") ||
    lower.endsWith(".flac") ||
    (lower.endsWith(".webm") && mime.includes("audio"))
  ) {
    return { category: "audio", mimeType: mime || getMimeFromExtension(lower) };
  }

  // Video
  if (
    mime.startsWith("video/") ||
    lower.endsWith(".mp4") ||
    lower.endsWith(".webm") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".mkv") ||
    lower.endsWith(".avi") ||
    lower.endsWith(".3gp")
  ) {
    return { category: "video", mimeType: mime || getMimeFromExtension(lower) };
  }

  // Data / Tabular
  if (
    mime === "text/csv" ||
    mime === "text/tab-separated-values" ||
    mime === "application/json" ||
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv") ||
    lower.endsWith(".json")
  ) {
    return { category: "data", mimeType: mime || getMimeFromExtension(lower) };
  }

  // Code
  const codeExts = [".js", ".jsx", ".ts", ".tsx", ".py", ".html", ".css", ".sql", ".java", ".cpp", ".c", ".rs", ".go", ".sh"];
  if (codeExts.some(ext => lower.endsWith(ext))) {
    return { category: "code", mimeType: mime || "text/plain" };
  }

  // Document (PDF, TXT, MD, etc.)
  return { category: "document", mimeType: mime || getMimeFromExtension(lower) };
}

function getMimeFromExtension(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    mp3: "audio/mp3",
    wav: "audio/wav",
    m4a: "audio/m4a",
    ogg: "audio/ogg",
    aac: "audio/aac",
    flac: "audio/flac",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    json: "application/json",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown"
  };
  return map[ext] || "application/octet-stream";
}

function formatSeconds(seconds) {
  const total = Math.floor(seconds || 0);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Analyzes an Image buffer using Gemini 2.5 Flash Vision
 */
export async function analyzeImage(fileBuffer, mimeType, filename) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing for image analysis.");

  const base64Data = fileBuffer.toString("base64");
  const targetMime = mimeType && mimeType.startsWith("image/") ? mimeType : "image/jpeg";

  const prompt = `You are a world-class multimodal visual intelligence engine. Thoroughly analyze this image (${filename}). Provide a comprehensive, structured response formatted in standard markdown with these exact section headers:

# [IMAGE OVERVIEW]
Provide a detailed executive description of what this image depicts, its style, context, and purpose.

# [OPTICAL CHARACTER RECOGNITION (OCR)]
Transcribe EVERY piece of visible text, number, label, badge, sign, mathematical formula, code snippet, and caption in this image with high fidelity. If there is no text, state "No text detected."

# [VISUAL ELEMENTS & DIAGRAM STRUCTURE]
Describe all visual components in detail:
- Any charts, bar graphs, pie charts, line plots (specify axes, legend values, trendlines, and metrics)
- Diagrams, flowcharts, architectures, UI mockups, or tables
- Objects, people, environment, colors, layout, and visual relationships

# [KEY INSIGHTS & TAKEAWAYS]
List 4 to 8 high-yield takeaways, conclusions, data trends, or observations drawn from this visual.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: targetMime, data: base64Data } },
          { text: prompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Vision API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!rawText || rawText.trim().length === 0) {
    throw new Error("Gemini Vision returned an empty analysis for this image.");
  }

  // Parse structured report sections
  const visualReport = {
    overview: extractSection(rawText, "IMAGE OVERVIEW"),
    extractedText: extractSection(rawText, "OPTICAL CHARACTER RECOGNITION (OCR)"),
    visualElements: extractSection(rawText, "VISUAL ELEMENTS & DIAGRAM STRUCTURE"),
    keyInsights: extractSection(rawText, "KEY INSIGHTS & TAKEAWAYS")
  };

  // Chunk the detailed visual report for vector embedding
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 900,
    chunkOverlap: 180
  });

  const chunks = await splitter.createDocuments([rawText]);

  return {
    rawText,
    mediaMetadata: {
      visualReport,
      aspectRatio: "auto"
    },
    chunks: chunks.map((c, i) => ({
      pageContent: c.pageContent,
      metadata: {
        chunkId: i,
        modality: "image",
        filename
      }
    }))
  };
}

/**
 * Analyzes an Audio buffer using Groq Whisper (with fallback to Gemini Multimodal)
 */
export async function analyzeAudio(fileBuffer, mimeType, filename) {
  const groqApiKey = process.env.GROQ_API_KEY;
  let segments = [];
  let fullTranscript = "";
  let duration = 0;

  // 1. Primary: Groq Whisper Large V3 Turbo for ultra-fast timestamped transcription
  if (groqApiKey) {
    try {
      console.log(`[Audio Service] Transcribing audio with Groq Whisper (${filename})...`);
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType || "audio/mp3" });
      formData.append("file", blob, filename || "audio.mp3");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("response_format", "verbose_json");

      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqApiKey}` },
        body: formData
      });

      if (res.ok) {
        const json = await res.json();
        fullTranscript = json.text || "";
        duration = json.duration || 0;
        if (json.segments && json.segments.length > 0) {
          segments = json.segments.map(s => ({
            id: s.id,
            start: Math.round(s.start * 10) / 10,
            end: Math.round(s.end * 10) / 10,
            timestamp: `[${formatSeconds(s.start)} - ${formatSeconds(s.end)}]`,
            text: s.text.trim()
          }));
        }
      } else {
        const err = await res.text();
        console.warn("[Audio Service] Groq Whisper returned non-OK:", err);
      }
    } catch (e) {
      console.warn("[Audio Service] Groq Whisper error, falling back to Gemini:", e.message);
    }
  }

  // 2. Fallback to Gemini 2.5 Flash if Whisper yielded nothing
  if (!fullTranscript) {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) throw new Error("Neither Groq nor Gemini API keys are available for audio transcription.");

    console.log(`[Audio Service] Transcribing audio via Gemini 2.5 Flash (${filename})...`);
    const base64Data = fileBuffer.toString("base64");
    const targetMime = mimeType && mimeType.startsWith("audio/") ? mimeType : "audio/mp3";

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: targetMime, data: base64Data } },
            { text: "Transcribe this audio recording completely and accurately. Include timestamp markers like [00:15 - 00:30] for key transitions or speaker turns." }
          ]
        }]
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Audio processing error: ${errText}`);
    }

    const data = await geminiRes.json();
    fullTranscript = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  if (!fullTranscript || fullTranscript.trim().length === 0) {
    throw new Error("No speech or audio transcript could be generated from this file.");
  }

  // 3. Generate Audio Summary & Action Items using Groq or Gemini
  let audioSummary = "Audio recording transcript indexed.";
  let keyTopics = ["Audio Recording", "Spoken Dialogue"];

  try {
    const summaryPrompt = `Analyze this spoken audio transcript (${filename}) and produce:
1. A concise 3-4 sentence Executive Summary.
2. 5 key discussion topics or takeaways.
3. Any notable action items or decisions mentioned.

Transcript:
${fullTranscript.slice(0, 4000)}`;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: summaryPrompt }] }]
      })
    });
    if (res.ok) {
      const sJson = await res.json();
      audioSummary = sJson.candidates?.[0]?.content?.parts?.[0]?.text || audioSummary;
    }
  } catch (err) {
    console.warn("Audio summary generation warning:", err.message);
  }

  // 4. Construct Timestamped Semantic Chunks
  let chunks = [];
  if (segments.length > 0) {
    // Group segments into chunks of ~3-5 sentences each (approx 40-60 seconds)
    const groupSize = 4;
    for (let i = 0; i < segments.length; i += groupSize) {
      const group = segments.slice(i, i + groupSize);
      const startTime = group[0].start;
      const endTime = group[group.length - 1].end;
      const timeBadge = `[${formatSeconds(startTime)} - ${formatSeconds(endTime)}]`;
      const chunkText = `${timeBadge} ${group.map(g => g.text).join(" ")}`;

      chunks.push({
        pageContent: chunkText,
        metadata: {
          chunkId: Math.floor(i / groupSize),
          modality: "audio",
          timestamp: formatSeconds(startTime),
          startSec: startTime,
          endSec: endTime,
          filename
        }
      });
    }
  } else {
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 150 });
    const splitDocs = await splitter.createDocuments([fullTranscript]);
    chunks = splitDocs.map((c, i) => ({
      pageContent: c.pageContent,
      metadata: { chunkId: i, modality: "audio", filename }
    }));
  }

  const rawTextWithMetadata = `# Audio Recording: ${filename}\n\n## Executive Summary\n${audioSummary}\n\n## Full Timestamped Transcript\n${segments.length > 0 ? segments.map(s => `${s.timestamp} ${s.text}`).join("\n") : fullTranscript}`;

  return {
    rawText: rawTextWithMetadata,
    mediaMetadata: {
      duration,
      segments: segments.slice(0, 200), // Limit segment payload
      audioSummary
    },
    chunks
  };
}

/**
 * Analyzes a Video buffer using Gemini 2.5 Flash Multimodal
 */
export async function analyzeVideo(fileBuffer, mimeType, filename) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing for video analysis.");

  console.log(`[Video Service] Processing video "${filename}" (${fileBuffer.length} bytes)...`);
  const base64Data = fileBuffer.toString("base64");
  const targetMime = mimeType && mimeType.startsWith("video/") ? mimeType : "video/mp4";

  const prompt = `You are a state-of-the-art video understanding intelligence engine. Thoroughly analyze this video (${filename}). Output structured markdown with these exact section headers:

# [VIDEO OVERVIEW]
Provide a clear executive summary of the video topic, context, speakers, visuals, and purpose.

# [TIMELINE & SCENE BREAKDOWN]
Provide a detailed chronological breakdown of scenes and visual milestones. Format every scene on its own bullet with explicit timestamps:
- [MM:SS - MM:SS] Scene Title: Description of visual events, slides, actions, code shown, or topics discussed.

# [SPOKEN TRANSCRIPT & DIALOGUE]
Transcribe the spoken narration, dialogue, explanations, and key statements throughout the video.

# [ON-SCREEN TEXT & SLIDES]
Transcribe all text displayed on screen, presentation slides, diagrams, code snippets, or software demos.

# [KEY TAKEAWAYS & HIGHLIGHTS]
List 5 to 8 essential takeaways, decisions, instructions, or conclusions.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: targetMime, data: base64Data } },
          { text: prompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Video Analysis API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!rawText || rawText.trim().length === 0) {
    throw new Error("Gemini Video Understanding returned an empty analysis for this video.");
  }

  // Extract scenes from the TIMELINE section
  const timelineSection = extractSection(rawText, "TIMELINE & SCENE BREAKDOWN");
  const sceneLines = timelineSection.split("\n").filter(l => l.trim().startsWith("- [") || l.trim().startsWith("* ["));
  
  const scenes = sceneLines.map((line, idx) => {
    const match = line.match(/\[(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\]\s*(.*?):\s*(.*)/);
    if (match) {
      const startParts = match[1].split(":").map(Number);
      const startSec = (startParts[0] * 60) + startParts[1];
      return {
        id: idx,
        timestamp: `[${match[1]} - ${match[2]}]`,
        startTime: match[1],
        startSec,
        title: match[3].trim(),
        description: match[4].trim()
      };
    }
    return {
      id: idx,
      timestamp: `[Scene ${idx + 1}]`,
      startTime: "00:00",
      startSec: idx * 30,
      title: `Scene ${idx + 1}`,
      description: line.replace(/^[-*]\s*/, "").trim()
    };
  });

  // Split video report into semantic chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 900,
    chunkOverlap: 180
  });

  const splitDocs = await splitter.createDocuments([rawText]);

  const chunks = splitDocs.map((c, i) => {
    // Check if chunk contains a timestamp range or single marker
    const tsRangeMatch = c.pageContent.match(/\[(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\]/);
    let startSec = null;
    let endSec = null;
    let timestamp = null;

    if (tsRangeMatch) {
      const p1 = tsRangeMatch[1].split(":").map(Number);
      const p2 = tsRangeMatch[2].split(":").map(Number);
      startSec = (p1[0] * 60) + p1[1];
      endSec = (p2[0] * 60) + p2[1];
      timestamp = `[${tsRangeMatch[1]} - ${tsRangeMatch[2]}]`;
    } else {
      const singleMatch = c.pageContent.match(/\[(\d{1,2}:\d{2})/);
      if (singleMatch) {
        const p = singleMatch[1].split(":").map(Number);
        startSec = (p[0] * 60) + p[1];
        endSec = startSec + 30;
        timestamp = `[${singleMatch[1]}]`;
      }
    }

    return {
      pageContent: c.pageContent,
      metadata: {
        chunkId: i,
        modality: "video",
        timestamp,
        startSec,
        endSec,
        filename
      }
    };
  });

  // Also include discrete scene milestone chunks if available
  if (scenes && scenes.length > 0) {
    scenes.forEach((scene, sIdx) => {
      chunks.push({
        pageContent: `[Video Scene ${sIdx + 1} at ${scene.timestamp}] ${scene.title}: ${scene.description}`,
        metadata: {
          chunkId: chunks.length,
          modality: "video",
          timestamp: scene.timestamp,
          startSec: scene.startSec,
          endSec: scene.startSec + 30,
          filename
        }
      });
    });
  }

  return {
    rawText,
    mediaMetadata: {
      scenes: scenes.slice(0, 30),
      videoOverview: extractSection(rawText, "VIDEO OVERVIEW"),
      takeaways: extractSection(rawText, "KEY TAKEAWAYS & HIGHLIGHTS")
    },
    chunks
  };
}

/**
 * Analyzes Tabular Data (CSV, TSV, JSON)
 */
export async function analyzeData(fileBuffer, filename) {
  const content = fileBuffer.toString("utf-8");
  const isJson = filename.toLowerCase().endsWith(".json");

  let headers = [];
  let rows = [];
  let totalRows = 0;
  let formattedMarkdown = "";

  if (isJson) {
    try {
      const parsed = JSON.parse(content);
      const arrayData = Array.isArray(parsed) ? parsed : [parsed];
      totalRows = arrayData.length;
      if (totalRows > 0 && typeof arrayData[0] === "object") {
        headers = Object.keys(arrayData[0]);
        rows = arrayData.slice(0, 50).map(item => headers.map(h => String(item[h] ?? "")));
      }
      formattedMarkdown = `# JSON Dataset: ${filename}\n\nTotal records: ${totalRows}\n\n\`\`\`json\n${JSON.stringify(arrayData.slice(0, 10), null, 2)}\n\`\`\``;
    } catch {
      formattedMarkdown = `# JSON File: ${filename}\n\n${content.slice(0, 5000)}`;
    }
  } else {
    // CSV / TSV parsing
    const delimiter = filename.toLowerCase().endsWith(".tsv") ? "\t" : ",";
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    totalRows = Math.max(0, lines.length - 1);

    if (lines.length > 0) {
      headers = parseCsvLine(lines[0], delimiter);
      rows = lines.slice(1, 100).map(line => parseCsvLine(line, delimiter));

      // Build structured markdown table for chunking
      const tableHeader = `| ${headers.join(" | ")} |`;
      const tableDivider = `| ${headers.map(() => "---").join(" | ")} |`;
      const tableRows = rows.slice(0, 25).map(r => `| ${r.join(" | ")} |`).join("\n");

      formattedMarkdown = `# Dataset: ${filename}\n\nTotal Rows: ${totalRows} | Total Columns: ${headers.length}\n\n### Column Schema\n${headers.map((h, i) => `- **${h}** (Column #${i + 1})`).join("\n")}\n\n### Sample Data Preview\n${tableHeader}\n${tableDivider}\n${tableRows}\n\n### Complete Records\n${lines.slice(1, 500).join("\n")}`;
    } else {
      formattedMarkdown = `# Empty Dataset: ${filename}`;
    }
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 950,
    chunkOverlap: 150
  });

  const splitDocs = await splitter.createDocuments([formattedMarkdown]);

  return {
    rawText: formattedMarkdown,
    mediaMetadata: {
      headers,
      rows: rows.slice(0, 50),
      totalRows,
      columnCount: headers.length
    },
    chunks: splitDocs.map((c, i) => ({
      pageContent: c.pageContent,
      metadata: {
        chunkId: i,
        modality: "data",
        filename
      }
    }))
  };
}

/**
 * Analyzes Source Code files
 */
export async function analyzeCode(fileBuffer, filename) {
  const content = fileBuffer.toString("utf-8");
  const ext = filename.split(".").pop().toLowerCase();

  const lines = content.split(/\r?\n/);
  const lineCount = lines.length;

  const rawText = `# Source Code: ${filename} (${ext.toUpperCase()})\n\nTotal Lines: ${lineCount}\n\n\`\`\`${ext}\n${content}\n\`\`\``;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 180
  });

  const splitDocs = await splitter.createDocuments([rawText]);

  return {
    rawText,
    mediaMetadata: {
      language: ext,
      lineCount
    },
    chunks: splitDocs.map((c, i) => ({
      pageContent: c.pageContent,
      metadata: {
        chunkId: i,
        modality: "code",
        filename
      }
    }))
  };
}

// Helper: Extract markdown section by header name
function extractSection(text, headerName) {
  const regex = new RegExp(`(?:#+\\s*\\[?${headerName}\\]?)([\\s\\S]*?)(?=(?:#+\\s*\\[?[A-Z\\s]{3,}\\]?)|$)`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

// Helper: CSV line parser handling quotes
function parseCsvLine(line, delimiter = ",") {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === delimiter && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
