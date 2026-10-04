<p align="center">
  <h1 align="center">⚡ PaperPulse AI – Agentic RAG Document Intelligence</h1>
  <p align="center">
    <strong>Chat, Study, Analyze, and Compare Documents using Agentic RAG — powered by Groq, Gemini Embeddings, and Multi-Format Ingestion</strong>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white" alt="LangChain" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" />
</p>

---

## 📖 Overview

**PaperPulse AI** is a full-stack **MERN** Retrieval-Augmented Generation (RAG) platform that lets users upload PDF, TXT, and Markdown documents, chat with them, generate interactive study quizzes and flashcards, inspect semantic chunks, and compare multiple documents. It combines **Google Gemini embeddings**, **Groq's ultra-fast inference**, and **Pinecone / in-memory vector storage** to deliver accurate, sub-second answers grounded in your documents.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **JWT Authentication** | Secure user registration and login with JWT and bcrypt password hashing |
| 📄 **Multi-Format Ingestion** | Drag-and-drop support for **PDF, TXT, and Markdown (.md)** files |
| ⚡ **Agentic RAG Pipeline** | Dynamic intent routing (Greeting, Summary, QA), semantic chunking, and Gemini embeddings |
| 🗑️ **Hover-to-Delete** | Instant document removal with synchronous vector memory & chat cleanup |
| 📖 **In-App Semantic Previewer** | Inspect raw extracted semantic chunks with built-in instant search |
| 🎓 **Interactive Study Mode** | AI-generated 5-question MCQ quizzes with live scoring and 3D flip concept flashcards |
| 📊 **Document Analytics** | Flesch-Kincaid readability scoring, word count, reading time, and key topic extraction |
| 🎨 **Theme Customizer** | 3 rich color palettes: **Cosmic Amethyst**, **Aurora Emerald**, and **Obsidian Rose** |
| ⚖️ **Cross-Doc Comparison** | Multi-select 2 documents to compare differences, synergies, and core findings |
| 🌐 **Multilingual & Tone Switcher**| Translate answers into Spanish, French, German, Hindi, etc., with customizable response tones |
| 🎙️ **Voice & Audio Controls** | Speech-to-text dictation and text-to-speech voice read-aloud |
| 📝 **Chat Management** | Start fresh conversation threads and export conversations to formatted Markdown (`.md`) |

---

## 🛠️ Tech Stack

<table>
  <tr>
    <th>Layer</th>
    <th>Technologies</th>
  </tr>
  <tr>
    <td><strong>Frontend</strong></td>
    <td>React, Vite, Axios, Lucide React Icons, CSS</td>
  </tr>
  <tr>
    <td><strong>Backend</strong></td>
    <td>Node.js, Express.js, MongoDB Atlas, Mongoose, JWT, bcryptjs, Multer</td>
  </tr>
  <tr>
    <td><strong>AI / RAG</strong></td>
    <td>LangChain.js, Google Gemini Embeddings (<code>gemini-embedding-001</code>), Groq (<code>llama-3.3-70b-versatile</code>)</td>
  </tr>
  <tr>
    <td><strong>Vector Database</strong></td>
    <td>Pinecone, MemoryVectorStore (fallback)</td>
  </tr>
  <tr>
    <td><strong>Deployment</strong></td>
    <td>Vercel, Render</td>
  </tr>
</table>

---

## ⚙️ Architecture

```text
                        DocuMind AI Architecture

                    ┌──────────────────────────┐
                    │     React Frontend       │
                    │  Authentication & Chat   │
                    └────────────┬─────────────┘
                                 │
                          HTTP / REST API
                                 │
                    ┌────────────▼─────────────┐
                    │     Express Backend      │
                    │ JWT Auth & Document APIs │
                    └───────┬─────────┬────────┘
                            │         │
          ┌─────────────────▼───┐     │
          │   MongoDB Atlas      │     │
          │ Users │ Docs │ Chats │     │
          └──────────────────────┘     │
                                       ▼
                            ┌──────────────────┐
                            │    RAG Service   │
                            ├──────────────────┤
                            │ Intent Routing   │
                            │ Document Parsing │
                            │ Embeddings       │
                            │ Retrieval        │
                            │ Re-ranking       │
                            │ Answer Generation│
                            │ Groundedness Eval│
                            └───────┬──────────┘
                                    │
          ┌───────────────┬─────────┴──────────┬──────────────┐
          ▼               ▼                    ▼              ▼
 Google Gemini      Pinecone Vector DB    Groq LLaMA     Memory Store
  Embeddings       (Semantic Retrieval)   3.3 70B        (Fallback)
```

### 🔄 RAG Pipeline

```text
                    PDF Upload
                        │
                        ▼
                Extract PDF Text
                        │
                        ▼
      Recursive Text Chunking (1000 / 200)
                        │
                        ▼
      Generate Embeddings (Gemini)
                        │
                        ▼
 Store Embeddings (Pinecone)
        │
        └──► Fallback: MemoryVectorStore
────────────────────────────────────────────────

                   User Question
                        │
                        ▼
        Intent Classification (LLM)
        ├── Greeting
        ├── Summary
        └── Question Answering
                        │
                        ▼
     Semantic Similarity Search (Pinecone)
                        │
                        ▼
 Keyword-based Re-ranking (70% Semantic +
       30% Keyword Relevance)
                        │
                        ▼
      Build RAG Prompt + Chat History
                        │
                        ▼
     Generate Answer (Groq LLaMA 3.3)
                        │
                        ▼
      Groundedness Evaluation (LLM)
                        │
                        ▼
 Return Answer + Source Chunks + Audit Score
```

## 📋 Prerequisites

- Node.js 18+
- MongoDB Atlas
- Google AI Studio API Key
- Groq API Key
- Pinecone Account & Index

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/kanav19jain/Documind-AI.git
cd Documind-AI
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Configure the `.env` file with your MongoDB, Gemini, Groq, and Pinecone credentials, then start the server:

```bash
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Set:

```env
VITE_API_URL=http://localhost:5000
```

Start the frontend:

```bash
npm run dev
```

Open **http://localhost:5173**.

---

## 🌐 Deployment

- **Backend:** Deploy `backend/` to Render and configure the environment variables from `.env.example`.
- **Frontend:** Deploy `frontend/` to Vercel and set `VITE_API_URL` to your Render backend URL.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
