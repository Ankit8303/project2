import path from "path";
import fs from "fs";
import * as cheerio from "cheerio";
import { processDocument, processTextDocument } from "./ragService.js";
import { detectFileType } from "./multimodalService.js";
import Document from "../models/Document.js";

const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Universally ingests any Webpage, Article, Documentation, Wikipedia, YouTube, or direct media URL
 */
export async function ingestUrl(rawUrl, documentId, userId) {
  let targetUrl = (rawUrl || "").trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = "https://" + targetUrl;
  }

  let urlObj;
  try {
    urlObj = new URL(targetUrl);
  } catch (err) {
    throw new Error(`Invalid URL format: "${rawUrl}". Please enter a full valid HTTP/HTTPS link.`);
  }

  console.log(`[URL Ingestion] Starting ingestion for "${targetUrl}" (DocID: ${documentId})`);

  // Fetch target resource with browser headers
  let res;
  try {
    res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000)
    });
  } catch (fetchErr) {
    throw new Error(`Could not connect to URL "${targetUrl}": ${fetchErr.message}`);
  }

  const isYouTube = urlObj.hostname.includes("youtube.com") || urlObj.hostname.includes("youtu.be");

  // YouTube frequently returns HTTP 429 to cloud/server-side fetchers.
  // YouTube ingestion only needs metadata here, so do not fail the entire
  // ingestion pipeline when the page itself rate-limits the server.
  if (!res.ok && !(isYouTube && res.status === 429)) {
    throw new Error(`Server returned HTTP ${res.status} (${res.statusText}) when accessing ${targetUrl}`);
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const pathname = urlObj.pathname.toLowerCase();

  // Check if URL points directly to a downloadable document, media, or data file
  const isDirectFile = 
    pathname.endsWith(".pdf") ||
    pathname.endsWith(".png") || pathname.endsWith(".jpg") || pathname.endsWith(".jpeg") || 
    pathname.endsWith(".webp") || pathname.endsWith(".gif") || pathname.endsWith(".svg") ||
    pathname.endsWith(".mp3") || pathname.endsWith(".wav") || pathname.endsWith(".m4a") || 
    pathname.endsWith(".ogg") || pathname.endsWith(".aac") || pathname.endsWith(".flac") ||
    pathname.endsWith(".mp4") || pathname.endsWith(".webm") || pathname.endsWith(".mov") || 
    pathname.endsWith(".mkv") || pathname.endsWith(".avi") ||
    pathname.endsWith(".csv") || pathname.endsWith(".tsv") || pathname.endsWith(".json") ||
    pathname.endsWith(".txt") || pathname.endsWith(".md") || pathname.endsWith(".py") || 
    pathname.endsWith(".js") || pathname.endsWith(".ts") ||
    contentType.includes("application/pdf") ||
    contentType.startsWith("image/") ||
    contentType.startsWith("audio/") ||
    contentType.startsWith("video/");

  if (isDirectFile) {
    console.log(`[URL Ingestion] Detected direct downloadable file stream at ${targetUrl}`);
    const arrayBuffer = await res.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    let filename = path.basename(urlObj.pathname) || "downloaded-file";
    if (!filename.includes(".")) {
      if (contentType.includes("pdf")) filename += ".pdf";
      else if (contentType.includes("image/jpeg") || contentType.includes("image/jpg")) filename += ".jpg";
      else if (contentType.includes("image/png")) filename += ".png";
      else if (contentType.includes("audio/mpeg")) filename += ".mp3";
      else if (contentType.includes("video/mp4")) filename += ".mp4";
      else if (contentType.includes("csv")) filename += ".csv";
      else filename += ".dat";
    }

    const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const savedFilePath = path.join(uploadsDir, `${Date.now()}-${documentId}-${safeName}`);
    fs.writeFileSync(savedFilePath, fileBuffer);

    const { category, mimeType } = detectFileType(filename, contentType);
    const stats = await processDocument(fileBuffer, documentId, filename, mimeType);

    const doc = new Document({
      id: documentId,
      userId,
      filename: `${filename} (${urlObj.hostname})`,
      fileType: stats.fileType || category,
      mimeType: stats.mimeType || mimeType,
      mediaPath: savedFilePath,
      mediaMetadata: {
        ...(stats.mediaMetadata || {}),
        sourceUrl: targetUrl,
        downloadedAt: new Date().toISOString()
      },
      size: fileBuffer.length,
      chunkCount: stats.chunkCount,
      charCount: stats.charCount,
      rawText: stats.rawText,
      chunks: stats.chunks
    });

    await doc.save();
    return doc;
  }

  // Check if it's YouTube
  if (isYouTube) {
    console.log(`[URL Ingestion] Detected YouTube video: ${targetUrl}`);
    let ytTitle = "YouTube Video";
    let ytAuthor = "YouTube Creator";
    let ytThumb = "";

    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`);
      if (oembedRes.ok) {
        const oeData = await oembedRes.json();
        ytTitle = oeData.title || ytTitle;
        ytAuthor = oeData.author_name || ytAuthor;
        ytThumb = oeData.thumbnail_url || "";
      }
    } catch (e) {
      console.warn("YouTube oEmbed fetch error:", e.message);
    }

    const html = res.ok ? await res.text() : "";
    const ch = cheerio.load(html);
    let fullDesc = "";
    const descMatch = html.match(/"description":\s*{"simpleText":\s*"([^"]+)"}/);
    if (descMatch) {
      fullDesc = descMatch[1].replace(/\\n/g, "\n");
    } else {
      fullDesc = ch('meta[name="description"]').attr("content") ||
                 ch('meta[property="og:description"]').attr("content") || "";
    }

    // Generate Deep Multimodal Video Timeline & Scene Breakdown using Gemini 2.5 Flash
    let videoAnalysisText = "";
    let scenes = [];
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      try {
        console.log(`[URL Ingestion] Running deep video semantic & timeline analysis via Gemini for "${ytTitle}"...`);
        const prompt = `You are a world-class video intelligence engine. Analyze this YouTube video:
Title: "${ytTitle}"
Creator / Channel: "${ytAuthor}"
URL: ${targetUrl}
Description & Video Details:
${fullDesc || "Video document"}

Produce a comprehensive, highly detailed chronological breakdown in structured markdown with these exact section headers:

# [YOUTUBE VIDEO OVERVIEW]
Provide a thorough executive summary of what this video depicts, the creator's journey, topics covered, location, historical/cultural context, and core narrative.

# [CHRONOLOGICAL SCENE & TIMELINE BREAKDOWN]
Provide a detailed chronological timeline breakdown across the video with explicit timestamps [MM:SS - MM:SS] at 1 to 2 minute intervals (e.g. [00:00 - 01:30], [01:30 - 03:00], [03:00 - 04:30], [04:30 - 06:00], [06:00 - 08:00], etc.):
- [MM:SS - MM:SS] Scene Title: Detailed description of what happens at this timestamp, visual events on screen, actions, landmarks, camera perspective, and topics discussed.

# [KEY TOPICS, DIALOGUE & ON-SCREEN OBSERVATIONS]
Detail specific statements, spoken dialogue, people encountered, on-screen text, and geographic/cultural observations.

# [KEY TAKEAWAYS & CONCLUSIONS]
List 5 to 8 high-yield takeaways and conclusions.`;

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          }),
          signal: AbortSignal.timeout(25000)
        });

        if (geminiRes.ok) {
          const gData = await geminiRes.json();
          videoAnalysisText = gData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
      } catch (geminiErr) {
        console.warn("[URL Ingestion] Gemini video breakdown warning:", geminiErr.message);
      }
    }

    const structuredText = `# [YOUTUBE VIDEO] ${ytTitle}
Channel / Creator: ${ytAuthor}
Source URL: ${targetUrl}
Thumbnail URL: ${ytThumb}

${videoAnalysisText || `## Video Description:\n${fullDesc || "Video stream sourced from YouTube."}`}`;

    // Extract discrete scene objects from the TIMELINE section
    const timelineMatch = structuredText.match(/#\s*\[CHRONOLOGICAL SCENE & TIMELINE BREAKDOWN\]([\s\S]*?)(?=#\s*\[|$)/);
    if (timelineMatch) {
      const sceneLines = timelineMatch[1].split("\n").filter(l => l.trim().startsWith("- [") || l.trim().startsWith("* [") || l.trim().startsWith("- **["));
      scenes = sceneLines.map((line, idx) => {
        const match = line.match(/\[(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\]\s*(.*?):\s*(.*)/);
        if (match) {
          const startParts = match[1].split(":").map(Number);
          const endParts = match[2].split(":").map(Number);
          const startSec = (startParts[0] * 60) + startParts[1];
          const endSec = (endParts[0] * 60) + endParts[1];
          return {
            id: idx,
            timestamp: `[${match[1]} - ${match[2]}]`,
            startSec,
            endSec,
            title: match[3].replace(/\*\*/g, "").trim(),
            description: match[4].trim()
          };
        }
        return {
          id: idx,
          timestamp: `[Scene ${idx + 1}]`,
          startSec: idx * 60,
          endSec: (idx + 1) * 60,
          title: `Scene ${idx + 1}`,
          description: line.replace(/^[-*]\s*(\*\*)?/, "").trim()
        };
      });
    }

    const mediaMetadata = {
      sourceUrl: targetUrl,
      url: targetUrl,
      title: ytTitle,
      author: ytAuthor,
      thumbnail: ytThumb,
      isYouTube: true,
      domain: urlObj.hostname,
      scenes: scenes.slice(0, 30)
    };

    const stats = await processTextDocument(
      structuredText,
      documentId,
      ytTitle,
      "video",
      "video/youtube",
      mediaMetadata
    );

    // Ensure all chunks have explicit timestamp metadata
    if (scenes.length > 0) {
      scenes.forEach((scene, sIdx) => {
        stats.chunks.push({
          pageContent: `[Video Scene at ${scene.timestamp}] ${scene.title}: ${scene.description}`,
          metadata: {
            chunkId: stats.chunks.length,
            modality: "video",
            timestamp: scene.timestamp,
            startSec: scene.startSec,
            endSec: scene.endSec,
            filename: ytTitle
          }
        });
      });
    }

    const doc = new Document({
      id: documentId,
      userId,
      filename: `🎬 ${ytTitle.length > 55 ? ytTitle.slice(0, 55) + "..." : ytTitle}`,
      fileType: "video",
      mimeType: "video/youtube",
      mediaPath: "",
      mediaMetadata,
      size: Buffer.byteLength(structuredText),
      chunkCount: stats.chunks.length,
      charCount: stats.charCount,
      rawText: stats.rawText,
      chunks: stats.chunks
    });

    await doc.save();
    return doc;
  }

  // Standard Webpage / Article / Documentation / Wiki
  console.log(`[URL Ingestion] Parsing HTML webpage: ${targetUrl}`);
  const html = await res.text();
  const ch = cheerio.load(html);

  // Extract Title
  let pageTitle = ch('meta[property="og:title"]').attr("content") || 
                  ch('title').text().trim() || 
                  urlObj.hostname;
  pageTitle = pageTitle.replace(/\s+/g, " ").trim();

  // Extract Meta description
  const metaDesc = ch('meta[name="description"]').attr("content") || 
                   ch('meta[property="og:description"]').attr("content") || 
                   "";

  // Remove noise elements
  ch("script, style, noscript, nav, footer, header, aside, iframe, svg, [role='alert'], .ad, .advertisement, .cookie-banner, .popup").remove();

  // Extract primary content container
  let mainContent = "";
  const articleEl = ch("article, main, [role='main'], .article-body, .post-content, #content, .content, .entry-content, .wiki-content");
  if (articleEl.length > 0) {
    mainContent = articleEl.text();
  } else {
    mainContent = ch("body").text();
  }

  // Clean and normalize whitespace
  mainContent = mainContent.replace(/\t+/g, " ").replace(/[ \u00A0]{2,}/g, " ").replace(/\n\s*\n\s*\n/g, "\n\n").trim();

  if (!mainContent || mainContent.length < 40) {
    throw new Error("Unable to extract sufficient readable article text from this webpage. The URL may require JavaScript or authentication.");
  }

  const structuredText = `# [WEBPAGE] ${pageTitle}
Source URL: ${targetUrl}
Domain: ${urlObj.hostname}
Summary / Description: ${metaDesc}

## Extracted Article Content:
${mainContent.slice(0, 30000)}
`;

  // Save snapshot HTML in uploads for preview or offline caching
  const snapshotPath = path.join(uploadsDir, `${Date.now()}-${documentId}-webpage.html`);
  fs.writeFileSync(snapshotPath, html.slice(0, 300000), "utf-8");

  const mediaMetadata = {
    sourceUrl: targetUrl,
    url: targetUrl,
    title: pageTitle,
    description: metaDesc,
    domain: urlObj.hostname,
    ingestedAt: new Date().toISOString()
  };

  const stats = await processTextDocument(
    structuredText,
    documentId,
    pageTitle,
    "webpage",
    "text/html",
    mediaMetadata
  );

  const doc = new Document({
    id: documentId,
    userId,
    filename: `🌐 ${pageTitle.length > 55 ? pageTitle.slice(0, 55) + "..." : pageTitle}`,
    fileType: "webpage",
    mimeType: "text/html",
    mediaPath: snapshotPath,
    mediaMetadata,
    size: Buffer.byteLength(structuredText),
    chunkCount: stats.chunkCount,
    charCount: stats.charCount,
    rawText: stats.rawText,
    chunks: stats.chunks
  });

  await doc.save();
  return doc;
}
