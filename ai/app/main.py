import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from dotenv import load_dotenv

from .models.schemas import AnalyzeRequest, AnalyzeResponse
from .services.analysis import analyze_contract

# Always load env from synopsis/ai/.env, independent of current working directory.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# the AI service itself does not need OpenAI; analysis.py handles the client.
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://localhost:8000")

app = FastAPI(title="AI Contract Analyzer")


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    try:
        return await analyze_contract(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/health")
def health():
    return {"status": "ok"}
