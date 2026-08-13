"""
SetuHaul — Unified Server Launcher

Runs both the FastAPI server (port 8000) and the agent handler (port 8080)
in a single process using multiprocessing.

This enables single-server deployment on Railway/Render/Replit while
maintaining the same architecture as the split deployment.

Usage:
    python start.py             # Runs both servers
    python start.py --api-only  # Runs only FastAPI (when agent is on AgentCore)
"""

import os
import sys
import multiprocessing
from pathlib import Path

# Ensure server directory is in path — MUST be before any local imports
_server_dir = str(Path(__file__).resolve().parent)
if _server_dir not in sys.path:
    sys.path.insert(0, _server_dir)
os.chdir(_server_dir)


def run_fastapi():
    """Start the FastAPI server on PORT (default 8000)."""
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
    )


def run_agent_handler():
    """Start the agent handler on AGENT_PORT (default 8080)."""
    port = int(os.environ.get("AGENT_PORT", 8080))
    try:
        from bedrock_agentcore.runtime import BedrockAgentCoreApp
        # If AgentCore SDK is available, use handler.py
        import handler  # noqa: F401 — triggers app.run()
    except ImportError:
        # Fallback: run agent_invoker as a simple HTTP server
        print(f"[agent] AgentCore SDK not available. Starting lightweight agent server on :{port}")
        _run_lightweight_agent_server(port)


def _run_lightweight_agent_server(port: int):
    """
    Lightweight FastAPI wrapper around agent_invoker for environments
    without the AgentCore SDK (Railway, Render, Replit).
    """
    from fastapi import FastAPI
    from pydantic import BaseModel
    from typing import Optional
    import uvicorn

    agent_app = FastAPI(title="SetuHaul Agent")

    class InvokeRequest(BaseModel):
        prompt: str
        session_id: str

    @agent_app.post("/invocations")
    async def invoke(body: InvokeRequest):
        from agent_invoker import invoke_agent
        # Use a default driver_id — the context is already in the prompt
        result = invoke_agent(
            prompt=body.prompt,
            session_id=body.session_id,
            driver_id="",  # Driver context is embedded in the prompt by server.py
        )
        return result

    @agent_app.get("/health")
    async def health():
        return {"status": "healthy", "service": "sethaul-agent"}

    uvicorn.run(agent_app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    api_only = "--api-only" in sys.argv

    if api_only:
        print("[start] Running FastAPI server only (agent expected on AgentCore or external)")
        run_fastapi()
    else:
        print("[start] Launching both FastAPI (:8000) and Agent Handler (:8080)")

        # Start agent in a separate process
        agent_process = multiprocessing.Process(target=run_agent_handler, daemon=True)
        agent_process.start()

        # Run FastAPI in the main process
        run_fastapi()
