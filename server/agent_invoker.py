"""
SetuHaul Agent Invoker — Shared Agent Invocation Logic

Provides a single `invoke_agent()` function that can be called from:
- FastAPI server (server.py) for Replit/local deployment
- AgentCore handler (handler.py) for AWS deployment

This module owns agent creation, tool registration, and response extraction.
It does NOT manage memory — that's handled by the caller.
"""

import os
import sys
import logging
import traceback
from pathlib import Path
from typing import List, Dict, Optional

from dotenv import load_dotenv

# Ensure the server directory is in path
sys.path.insert(0, str(Path(__file__).resolve().parent))

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger("sethaul.agent_invoker")


# ---------------------------------------------------------------------------
# Agent Configuration
# ---------------------------------------------------------------------------

MODEL_DETAILS = {
    "model_id": os.environ.get(
        "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0"
    ),
    "max_tokens": 6000,
    "temperature": 0.2,
    "top_p": 0.5,
}

SYSTEM_PROMPT = """
You are SetuHaul's on-road Driver Assistance Agent. Your primary role is to
receive messages from truck drivers who are currently en route and extract
structured incident data so that the operations administrator can act quickly.

Entities & ID formats you must recognise or ask about:
- shipment_id    -> e.g. SHP1001, SHP1014 (always starts with SHP)
- driver_id      -> e.g. DRV001, DRV014 (always starts with DRV)
- vehicle_id     -> e.g. VEH001, VEH014 (always starts with VEH)
- facility_id    -> e.g. FAC-JAI-01, FAC-GGN-01

Destination facilities:
- FAC-JAI-01 — SetuHaul Jaipur Distribution Centre, Jaipur, Rajasthan
  Open 06:00-22:00 | Check-in grace: 30 min | Default unload: 60 min
- FAC-GGN-01 — SetuHaul Gurugram Cross-Dock, Gurugram, Haryana
  Open 07:00-21:00 | Check-in grace: 20 min | Default unload: 45 min

Dock types at FAC-JAI-01:
- D1-D4 : STANDARD (max 20-25 tonnes)
- D5    : REEFER (temperature-controlled, max 22 tonnes)
- D6    : HEAVY  (max 35 tonnes, 90-min slots)

Dock types at FAC-GGN-01:
- D1-D2 : STANDARD (max 22 tonnes)
- D3    : REEFER (max 20 tonnes)

Known issue categories (exception_type):
DELAY | BREAKDOWN | TRAFFIC | WEATHER | EARLY_ARRIVAL | DOCK_UNAVAILABLE | UNKNOWN

Severity logic:
- CRITICAL — Priority shipments (CRITICAL/HIGH) with delay > 60 min or no feasible slot remaining.
- HIGH — Any delay > 45 min, or reefer/heavy dock constraint conflicts.
- MEDIUM — Delay 15-45 min with a viable alternative slot.
- LOW — Early arrival, informational queries, duplicate messages.

When a driver initiates a chat describing an issue, you must:

1. EXTRACT the following fields from the driver's message:
   - shipment_id, driver_id, vehicle_id
   - issue_type (DELAY, BREAKDOWN, TRAFFIC, WEATHER, EARLY_ARRIVAL, DOCK_UNAVAILABLE, UNKNOWN)
   - issue_description (brief summary)
   - estimated_arrival (ISO-8601 format, e.g. 2026-08-04T11:25:00+05:30)
   - delay_minutes (integer)
   - destination_facility_id (just the facility_id, e.g. FAC-JAI-01)
   - severity (LOW / MEDIUM / HIGH / CRITICAL)
   - constraints (time limits, temperature, dock type — or empty string if none)

2. ASK FOLLOW-UP QUESTIONS if any field is missing or ambiguous.
   Ask ONLY the questions needed. Maximum 3 at a time.

3. ONCE ALL DATA IS AVAILABLE, you MUST call the `record_driver_issue` tool
   with all extracted fields. Pass the session_id that is provided in the
   conversation context. After the tool returns successfully, confirm to the
   driver that their issue has been logged and the operations team will review it.

   If the tool returns a "duplicate" status, inform the driver that their issue
   was already recorded and no new record was created.

   If the tool returns an "error" status, apologise and ask the driver to try
   again or contact dispatch directly.

Rules:
- Be polite, brief, professional.
- Interpret times in Asia/Kolkata timezone (UTC+05:30).
- Always convert partial times like "11:25 AM" to full ISO-8601 with +05:30 offset.
- Do NOT fabricate IDs. If you cannot determine an ID from context, ask.
- Do NOT make scheduling decisions — only extract, summarise, and recommend.
- You MUST call the record_driver_issue tool once all data is collected. Do not
  skip the tool call or just output a JSON summary.
- The driver_id is already known from authentication. Use it directly without asking.
"""

AGENT_NAME = "sethaul_driver_agent"


# ---------------------------------------------------------------------------
# Agent Creation
# ---------------------------------------------------------------------------

def _create_agent(
    session_id: str,
    driver_id: str,
    history_messages: Optional[List[Dict]] = None,
):
    """
    Create a Strands Agent with the record_driver_issue tool registered.

    Args:
        session_id: Current conversation session ID.
        driver_id: Authenticated driver ID (injected into context).
        history_messages: Optional pre-loaded conversation history.
    """
    from strands import Agent
    from strands.models import BedrockModel
    from strands.types.content import SystemContentBlock
    from tools import record_driver_issue

    model = BedrockModel(**MODEL_DETAILS)

    # Inject session context so the agent knows session_id and driver_id
    session_context = (
        f"\n\n--- SESSION CONTEXT ---\n"
        f"session_id: {session_id}\n"
        f"driver_id: {driver_id}\n"
        f"Always use this session_id and driver_id when calling the record_driver_issue tool.\n"
        f"Do NOT ask the driver for their driver_id — it is already known from authentication.\n"
        f"--- END SESSION CONTEXT ---"
    )
    full_prompt = SYSTEM_PROMPT + session_context
    system_content = [SystemContentBlock(text=full_prompt)]

    agent = Agent(
        name=AGENT_NAME,
        description="SetuHaul Driver Assistance Agent with issue recording.",
        model=model,
        system_prompt=system_content,
        tools=[record_driver_issue],
        messages=history_messages if history_messages else None,
    )

    return agent


# ---------------------------------------------------------------------------
# Response Extraction
# ---------------------------------------------------------------------------

def _extract_response_text(result) -> str:
    """Extract plain text from a Strands AgentResult object."""
    response_text = ""

    if hasattr(result, "message") and result.message:
        message = result.message
        if isinstance(message, str):
            response_text = message
        elif isinstance(message, dict):
            content = message.get("content", [])
            for block in content:
                if isinstance(block, dict) and block.get("text"):
                    response_text += block["text"]
        elif isinstance(message, list):
            for block in message:
                if isinstance(block, dict) and block.get("text"):
                    response_text += block["text"]

    if not response_text and result:
        try:
            response_text = str(result)
        except Exception:
            response_text = "Agent completed but could not extract response text."

    return response_text


# ---------------------------------------------------------------------------
# Public Interface
# ---------------------------------------------------------------------------

def invoke_agent(
    prompt: str,
    session_id: str,
    driver_id: str,
    history_messages: Optional[List[Dict]] = None,
) -> dict:
    """
    Invoke the Strands agent with a driver's message.

    Args:
        prompt: The driver's message text.
        session_id: Session ID for conversation continuity.
        driver_id: Authenticated driver ID.
        history_messages: Optional conversation history (Strands format).

    Returns:
        {"result": "agent response text", "session_id": "..."}
        or {"error": "error message"}
    """
    try:
        if not prompt or not prompt.strip():
            return {"error": "Invalid input: prompt must be a non-empty string."}

        logger.info(
            f"[invoke] session_id={session_id}, driver_id={driver_id}, "
            f"prompt={prompt[:100]}"
        )

        agent = _create_agent(
            session_id=session_id,
            driver_id=driver_id,
            history_messages=history_messages,
        )

        result = agent(prompt)
        response_text = _extract_response_text(result)

        logger.info(f"[invoke] response_length={len(response_text)}")

        return {"result": response_text, "session_id": session_id}

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.error(f"[invoke] FAILED: {error_msg}")
        logger.error(traceback.format_exc())
        return {"error": error_msg}
