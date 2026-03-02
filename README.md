# ContractScan AI 🔍

> AI-powered contract risk analysis for procurement and legal teams. Upload any vendor PDF and get a full structured risk report in under 60 seconds.

![ContractScan AI](https://img.shields.io/badge/Powered%20by-Gemini%202.0%20Flash-blue?style=flat-square)
![Stack](https://img.shields.io/badge/Stack-React%20%2B%20Node.js%20%2B%20Python-green?style=flat-square)
![Database](https://img.shields.io/badge/Database-PostgreSQL%20%28Supabase%29-orange?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-purple?style=flat-square)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [AI Service](#ai-service)
- [Database Schema](#database-schema)
- [Screenshots](#screenshots)
- [Team](#team)

---

## Overview

ContractScan AI solves a real problem for procurement and legal teams — reviewing vendor contracts is slow, expensive, and error-prone. Outside counsel charges $300–$500/hour for routine contract reviews.

ContractScan AI analyzes any vendor PDF in under 60 seconds, identifies 17+ clause types, scores risk on a 0–100 scale, and provides specific negotiation language for every risky clause.

---

## Features

### For Companies
- Single shared workspace for the entire company
- All contracts stored and searchable in one place
- Role-based access control — ADMIN and MEMBER roles
- Multi-member collaboration with unlimited teammate invites
- Flat $299/month pricing with no per-analysis fees
- Encrypted storage — never trains on your data

### For Users
- Upload any vendor PDF — results in under 60 seconds
- Plain-English summaries — no legal background needed
- Know instantly if a contract is safe to sign
- See exactly which clauses are risky and why
- Get specific negotiation language to send back to vendors
- Copy redline recommendations to clipboard in one click
- Search and reopen any past contract analysis

### Dashboard
- Overall risk score gauge (0–100)
- Risk distribution donut chart
- Clause-by-clause risk bar chart
- Executive summary and red flags
- Full clause table with filter by risk level
- Slide-in clause drawer with negotiation recommendations

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS v4, Recharts |
| Backend | Node.js, Express, Prisma ORM |
| AI Service | Python, FastAPI, Gemini 2.0 Flash |
| Database | PostgreSQL (Supabase) |
| File Storage | Cloudinary |
| Auth | JWT (JSON Web Tokens) |

---

## Project Structure

```
contractscan/
├── frontend/                  # React + Vite frontend
│   ├── src/
│   │   ├── api/
│   │   │   └── axios.js       # Axios instance with auth interceptors
│   │   ├── components/
│   │   │   └── Layout.jsx     # Sidebar + topbar shell
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── AuthPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── UploadPage.jsx
│   │   │   ├── HistoryPage.jsx
│   │   │   ├── TeamPage.jsx
│   │   │   └── ProfilePage.jsx
│   │   └── App.jsx
│   ├── .env
│   └── package.json
│
├── backend/                   # Node.js + Express API
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── contract.controller.js
│   │   │   └── team.controller.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── contract.routes.js
│   │   │   └── team.routes.js
│   │   ├── services/
│   │   │   ├── ai.service.js
│   │   │   └── storage.service.js
│   │   └── index.js
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── .env
│   └── package.json
│
└── ai-service/                # Python FastAPI AI service
    ├── main.py
    ├── requirements.txt
    └── .env
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL database (Supabase recommended)
- Cloudinary account
- Google AI Studio account (for Gemini API key)

---

### 1. Clone the repository

```bash
git clone https://github.com/yourteam/contractscan.git
cd contractscan
```

---

### 2. Backend Setup

```bash
cd backend
npm install
```

Create `.env` file (see [Environment Variables](#environment-variables))

```bash
# Push database schema
npx prisma db push

# Seed dummy data
npx prisma db seed

# Start backend
npm run dev
```

Backend runs on `http://localhost:4000`

---

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create `.env` file:
```
VITE_API_BASE_URL=http://localhost:4000/api
```

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`

---

### 4. AI Service Setup

```bash
cd ai-service
pip install -r requirements.txt
```

Create `.env` file:
```
GEMINI_API_KEY=your_gemini_api_key
PORT=8000
```

```bash
uvicorn main:app --reload --port 8000
```

AI service runs on `http://localhost:8000`

---

### 5. Test with seed credentials

```
Email: arpit@acmecorp.com
Password: password123
```

---

## Environment Variables

### Backend `.env`

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
JWT_SECRET="your_jwt_secret_here"
PORT=4000
FRONTEND_URL=http://localhost:5173
AI_SERVICE_URL=http://localhost:8000
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Frontend `.env`

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

### AI Service `.env`

```env
GEMINI_API_KEY=your_gemini_api_key
PORT=8000
```

---

## API Reference

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create company + admin user |
| POST | `/api/auth/login` | Login and get JWT token |

### Contracts

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/contracts/presign` | Get Cloudinary upload signature |
| POST | `/api/contracts` | Create contract + trigger AI analysis |
| GET | `/api/contracts` | List all workspace contracts |
| GET | `/api/contracts/:id` | Get contract with clauses |
| DELETE | `/api/contracts/:id` | Delete contract |

### Team

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/team/members` | Get all workspace members |
| POST | `/api/team/invite` | Invite member by email |
| PATCH | `/api/team/profile` | Update user name |
| PATCH | `/api/team/password` | Change password |

---

## AI Service

The AI service is a Python FastAPI application that:

1. Receives `POST /analyze` with `{ contract_id, s3_key }`
2. Downloads the PDF from Cloudinary
3. Extracts text using `pdfminer.six`
4. Sends text to Gemini 2.0 Flash with a structured risk analysis prompt
5. Returns structured JSON with risk scores, red flags, and clause analysis
6. Backend saves results to database

### AI Response Format

```json
{
  "overall_risk_score": 78,
  "executive_summary": "This contract presents high risk...",
  "red_flags": ["Auto-renewal requires 90 days notice"],
  "clauses": [
    {
      "clause_type": "Auto-Renewal",
      "extracted_text": "...",
      "risk_level": "CRITICAL",
      "explanation": "...",
      "negotiation_recommendation": "..."
    }
  ]
}
```

---

## Database Schema

```prisma
model Company {
  id        String   @id @default(uuid())
  name      String
  domain    String?  @unique
  plan      String   @default("STARTER")
}

model User {
  id           String  @id @default(uuid())
  email        String  @unique
  passwordHash String
  name         String
  role         String  @default("MEMBER")
  companyId    String
}

model Contract {
  id               String   @id @default(uuid())
  fileName         String
  s3Key            String
  overallRiskScore Int?
  executiveSummary String?
  redFlags         String[]
  status           String   @default("PENDING")
  companyId        String
}

model Clause {
  id                        String @id @default(uuid())
  contractId                String
  clauseType                String
  extractedText             String
  riskLevel                 String
  explanation               String
  negotiationRecommendation String
}
```

---

## Running All Services

Open 3 terminals and run:

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend  
cd frontend && npm run dev

# Terminal 3 — AI Service
cd ai-service && uvicorn main:app --reload
```

Then open `http://localhost:5173`

---

## Team

Built at Hackathon 2026 🏆

| Role | Responsibility |
|---|---|
| Full Stack / Backend | Node.js API, Database, Auth, Cloudinary |
| Frontend | React, UI/UX, Dashboard, Landing Page |
| AI Engineer | Python FastAPI, Gemini Integration, PDF Extraction |

---

## License

MIT License — built for hackathon purposes.

---

*ContractScan AI — Know your contract risks before you sign.*