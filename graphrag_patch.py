"""
graphrag_patch.py - Runtime monkeypatches for GraphRAG compatibility.

Patches applied:
1. CommunityReportsExtractor: Replaces the structured-output call with a direct
   litellm call using response_format={"type":"json_object"} + manual JSON parsing.
   This handles DeepSeek / SiliconFlow that reject Pydantic schema-based structured outputs.
2. finalize_community_reports: Gracefully handles empty report datasets to prevent
   KeyError: 'community'.
"""
import os
import re
import sys
import json
import logging
import traceback
import traceback
import pandas as pd
from tenacity import retry, stop_after_attempt, wait_exponential

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("graphrag_patch")


def _resolve_env(value) -> str:
    """Resolve ${ENV_VAR} references in config values."""
    if not value:
        return ""
    value = str(value)
    if "${" in value:
        value = re.sub(r'\$\{([^}]+)\}', lambda m: os.environ.get(m.group(1), m.group(0)), value)
    return value


# ── Patch 1: CommunityReportsExtractor ───────────────────────────────────────
def _apply_community_reports_extractor_patch():
    try:
        import graphrag.index.operations.summarize_communities.community_reports_extractor as mod

        CommunityReportResponse = mod.CommunityReportResponse
        CommunityReportsResult  = mod.CommunityReportsResult
        INPUT_TEXT_KEY          = mod.INPUT_TEXT_KEY
        MAX_LENGTH_KEY          = mod.MAX_LENGTH_KEY

        async def _patched_call(self, input_text: str):
            """Replacement __call__ using direct litellm with json_object mode.
            
            Bypasses the graphrag_llm middleware which always passes response_format=None
            even when no format is requested, causing some providers to reject the call.
            Also replaces Pydantic structured output (unsupported by DeepSeek/SiliconFlow)
            with json_object mode + manual parsing.
            """
            import litellm

            output = None
            try:
                prompt = self._extraction_prompt.format(**{
                    INPUT_TEXT_KEY: input_text,
                    MAX_LENGTH_KEY: str(self._max_report_length),
                })

                # Build a JSON-focused prompt with Chinese language requirement
                json_prompt = (
                    prompt
                    + "\n\nIMPORTANT: Your ENTIRE response must be a single valid JSON object. "
                    "No markdown, no code fences, no text before or after the JSON."
                    "\n\nCRITICAL LANGUAGE REQUIREMENT: All text fields in the JSON (title, summary, rating_explanation, findings) "
                    "MUST be written entirely in Simplified Chinese (简体中文)."
                )
                messages = [{"role": "user", "content": json_prompt}]

                # Read model config directly from the LLMCompletion instance
                mc = self._model._model_config
                model_provider = _resolve_env(str(mc.model_provider or "openai"))
                model_name     = _resolve_env(str(mc.azure_deployment_name or mc.model))
                api_key        = _resolve_env(str(mc.api_key))
                api_base       = _resolve_env(str(mc.api_base)) if mc.api_base else None
                api_version    = _resolve_env(str(mc.api_version)) if mc.api_version else None

                model_id = f"{model_provider}/{model_name}"

                call_args: dict = dict(mc.call_args) if mc.call_args else {}
                # Ensure no response_format leaks in from call_args
                call_args.pop("response_format", None)
                call_args.pop("response_format_json_object", None)

                logger.info(f"[graphrag_patch] community report call → model={model_id} api_base={api_base}")

                @retry(
                    stop=stop_after_attempt(5),
                    wait=wait_exponential(multiplier=2, min=4, max=60),
                    reraise=True
                )
                async def _do_call():
                    return await litellm.acompletion(
                        model=model_id,
                        messages=messages,
                        api_key=api_key,
                        api_base=api_base,
                        api_version=api_version,
                        response_format={"type": "json_object"},
                        drop_params=True,
                        **call_args,
                    )

                lm_resp = await _do_call()

                content = (lm_resp.choices[0].message.content or "").strip()
                logger.info(f"[graphrag_patch] raw response (first 200): {content[:200]}")

                # Strip markdown code fences if the model ignored the instruction
                if content.startswith("```"):
                    content = content.split("```", 2)[-1]
                    if content.startswith("json"):
                        content = content[4:]
                    content = content.rsplit("```", 1)[0].strip()

                parsed = json.loads(content)
                output = CommunityReportResponse(**parsed)
                logger.info("[graphrag_patch] ✓ community report parsed successfully.")

            except Exception as e:
                logger.exception("[graphrag_patch] error generating community report")
                self._on_error(e, traceback.format_exc(), None)

            text_output = self._get_text_output(output) if output else ""
            return CommunityReportsResult(
                structured_output=output,
                output=text_output,
            )

        mod.CommunityReportsExtractor.__call__ = _patched_call
        logger.info("[graphrag_patch] ✓ CommunityReportsExtractor patched (direct litellm, json_object mode).")
    except Exception as e:
        logger.error(f"[graphrag_patch] Could not patch CommunityReportsExtractor: {e}")


# ── Patch 2: finalize_community_reports ──────────────────────────────────────
def _apply_finalize_patch():
    try:
        import graphrag.index.operations.finalize_community_reports as mod
        from graphrag.data_model.schemas import COMMUNITY_REPORTS_FINAL_COLUMNS

        original_fn = mod.finalize_community_reports

        def _patched_finalize(reports: pd.DataFrame, communities: pd.DataFrame) -> pd.DataFrame:
            if reports.empty or "community" not in reports.columns:
                logger.warning(
                    "[graphrag_patch] No community reports to finalize. "
                    "Returning empty DataFrame."
                )
                return pd.DataFrame(columns=COMMUNITY_REPORTS_FINAL_COLUMNS)
            return original_fn(reports, communities)

        mod.finalize_community_reports = _patched_finalize

        # Also update the local import inside the workflow module
        try:
            import graphrag.index.workflows.create_community_reports as wf_mod
            wf_mod.finalize_community_reports = _patched_finalize
        except Exception:
            pass

        logger.info("[graphrag_patch] ✓ finalize_community_reports patched (empty-report guard).")
    except Exception as e:
        logger.error(f"[graphrag_patch] Could not patch finalize_community_reports: {e}")


# ── Patch 3: LiteLLM Token Logging ───────────────────────────────────────────
def _apply_token_logging_patch():
    try:
        import litellm
        
        def token_logger(kwargs, completion_response, start_time, end_time):
            try:
                if not hasattr(completion_response, 'usage') or not completion_response.usage:
                    return
                # Handle either dict or Pydantic object
                usage = completion_response.usage
                if isinstance(usage, dict):
                    prompt = usage.get("prompt_tokens", 0)
                    completion = usage.get("completion_tokens", 0)
                    total = usage.get("total_tokens", 0)
                else:
                    prompt = getattr(usage, "prompt_tokens", 0)
                    completion = getattr(usage, "completion_tokens", 0)
                    total = getattr(usage, "total_tokens", 0)
                    
                model = getattr(completion_response, "model", "unknown")
                print(f"\\033[96m[LLM Token Tracker]\\033[0m Model: {model} | Prompt In: {prompt} | Completion Out: {completion} | Total: {total}")
            except Exception:
                pass

        if not hasattr(litellm, "success_callback"):
            litellm.success_callback = []
        if isinstance(litellm.success_callback, list):
            litellm.success_callback.append(token_logger)
        logger.info("[graphrag_patch] ✓ LiteLLM token usage logging enabled.")
    except Exception as e:
        logger.error(f"[graphrag_patch] Could not patch LiteLLM callbacks: {e}")

# ── Apply all patches ─────────────────────────────────────────────────────────
_apply_finalize_patch()
_apply_community_reports_extractor_patch()
_apply_token_logging_patch()

# ── Run the CLI ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    from graphrag.cli.main import app
    app()
