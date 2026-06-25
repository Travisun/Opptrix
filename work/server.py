"""
stock-research 后端 API 服务

用法:
  python server.py           # 启动在 http://127.0.0.1:8711
"""

from __future__ import annotations
import os, sys, json, asyncio
from typing import Optional, List
from datetime import datetime

# 路径初始化
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
lib_init = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib", "__init__.py")
if os.path.exists(lib_init):
    import importlib.util
    spec = importlib.util.spec_from_file_location("_lib_bootstrap", lib_init)
    if spec and spec.loader:
        try:
            spec.loader.exec_module(importlib.util.module_from_spec(spec))
        except Exception:
            pass

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from stock_research.integration.hub import ResearchHub
from stock_research.agent.engine import AgentEngine
from stock_research.llm.config import load_settings, save_settings, AppSettings

# ── 应用初始化 ────────────────────────────────────

app = FastAPI(title="stock-research API", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

hub = ResearchHub()
settings = load_settings()
agent = AgentEngine(hub, settings)


# ── 数据模型 ────────────────────────────────────

class EvalRequest(BaseModel):
    code: str
    scorecard: str = "综合评估"

class ScreenRequest(BaseModel):
    conditions: List[dict]
    scorecard: str = "综合评估"
    top_n: int = 20

class PortfolioRequest(BaseModel):
    holdings: List[tuple]
    scorecard: str = "综合评估"

class SearchRequest(BaseModel):
    keyword: str

class ChatRequest(BaseModel):
    message: str

class SignalRequest(BaseModel):
    code: str

class ConfigUpdate(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    scorecard: Optional[str] = None
    provider: Optional[str] = None
    base_url: Optional[str] = None


# ── API 端点 ────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": "0.3.0",
        "llm_configured": agent.llm_configured,
        "model": settings.llm.model if agent.llm_configured else None,
        "scorecard": settings.default_scorecard,
    }

@app.post("/api/evaluate")
async def evaluate(req: EvalRequest):
    result = hub.evaluate_stock(req.code, req.scorecard)
    if not result.success:
        raise HTTPException(400, result.message)
    return result.data

@app.post("/api/screen")
async def screen(req: ScreenRequest):
    result = hub.screen_stocks(req.conditions, req.scorecard, top_n=req.top_n)
    if not result.success:
        raise HTTPException(400, result.message)
    return result.data

@app.post("/api/portfolio")
async def portfolio(req: PortfolioRequest):
    result = hub.analyze_portfolio(req.holdings, req.scorecard)
    if not result.success:
        raise HTTPException(400, result.message)
    return result.data

@app.post("/api/search")
async def search(req: SearchRequest):
    result = hub.search_stocks(req.keyword)
    return {
        "success": result.success,
        "data": result.data,
        "message": result.message,
    }

@app.post("/api/signal")
async def signal(req: SignalRequest):
    result = hub.get_strategy_signal(req.code)
    return {
        "success": result.success,
        "data": result.data,
        "message": result.message,
    }

@app.post("/api/chat")
async def chat(req: ChatRequest):
    reply = agent.chat(req.message)
    return {"reply": reply}

@app.get("/api/config")
async def get_config():
    s = settings
    return {
        "llm": {
            "provider": s.llm.provider,
            "model": s.llm.model,
            "api_key_configured": bool(s.llm.api_key),
            "base_url": s.llm.base_url,
        },
        "default_scorecard": s.default_scorecard,
        "default_top_n": s.default_top_n,
    }

@app.post("/api/config")
async def set_config(req: ConfigUpdate):
    changed = False
    if req.api_key:
        settings.llm.api_key = req.api_key
        changed = True
    if req.model:
        settings.llm.model = req.model
        changed = True
    if req.scorecard:
        settings.default_scorecard = req.scorecard
        changed = True
    if req.provider:
        settings.llm.provider = req.provider
        changed = True
    if req.base_url:
        settings.llm.base_url = req.base_url
        changed = True
    if changed:
        save_settings(settings)
        agent.set_llm_config(settings.llm)
    return {"status": "saved"}

@app.get("/api/templates")
async def list_templates():
    try:
        from stock_eval.scoring.scorecard import list_templates
        return {"templates": list_templates()}
    except Exception:
        return {"templates": ["综合评估"]}


# ── 启动 ────────────────────────────────────────

def main():
    port = int(os.environ.get("STOCK_RESEARCH_PORT", "8711"))
    print(f"\n  🚀 stock-research API 启动: http://127.0.0.1:{port}")
    print(f"  🔧 LLM: {'✅ 已配置' if agent.llm_configured else '⚠️ 未配置'}")
    print(f"  📊 评分卡: {settings.default_scorecard}")
    print(f"  🧩 因子: 40  |  工具: {len(agent.tools.list())} 个\n")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

if __name__ == "__main__":
    main()
