# Number of previous turns to load from memory for context
MAX_HISTORY_TURNS = 10

# --- Memory Helpers ---

def _get_memory_manager(memory_id: str):
    """Create a MemorySessionManager instance for the given memory_id."""
    from bedrock_agentcore.memory import MemorySessionManager

    return MemorySessionManager(
        memory_id=memory_id,
        region_name=REGION,
    )


def _load_conversation_history(memory_mgr, session_id: str) -> List[Dict]:
    """Load previous conversation turns from short-term memory.

    Returns a list of Strands-compatible message dicts:
        [{"role": "user", "content": [{"text": "..."}]},
         {"role": "assistant", "content": [{"text": "..."}]}, ...]
    """
    messages = []

    try:
        turns = memory_mgr.get_last_k_turns(
            actor_id=AGENT_NAME,
            session_id=session_id,
            k=MAX_HISTORY_TURNS,
        )

        for turn in turns:
            for event_message in turn:
                role_raw = event_message.get("role", "").lower()
                text = event_message.get("content", {}).get("text", "")

                if not text:
                    continue

                # Map STM roles to Strands roles
                if role_raw == "user":
                    messages.append({"role": "user", "content": [{"text": text}]})
                elif role_raw == "assistant":
                    messages.append({"role": "assistant", "content": [{"text": text}]})

        logger.info(f"[memory] Loaded {len(messages)} messages from STM for session {session_id}")

    except Exception as e:
        logger.warning(f"[memory] Failed to load history (will proceed stateless): {e}")

    return messages


def _persist_turn(memory_mgr, session_id: str, user_text: str, assistant_text: str):
    """Persist the current user+assistant turn to short-term memory."""
    from bedrock_agentcore.memory.constants import ConversationalMessage, MessageRole

    try:
        memory_mgr.add_turns(
            actor_id=AGENT_NAME,
            session_id=session_id,
            messages=[
                ConversationalMessage(text=user_text, role=MessageRole.USER),
                ConversationalMessage(text=assistant_text, role=MessageRole.ASSISTANT),
            ],
        )
        logger.info(f"[memory] Persisted turn to STM for session {session_id}")
    except Exception as e:
        logger.error(f"[memory] Failed to persist turn: {e}")

