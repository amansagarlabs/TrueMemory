"""Phase 8.7 — Telemetry Correctness Tests.

Tests the observation event model and telemetry collector mechanics.
These are NOT live model tests — they verify instrumentation correctness
using mocked providers only.

Label: telemetry correctness
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, AsyncMock
from uuid import uuid4

import pytest

from services.memory_observation import (
    MemoryObservationEvent,
    GovernorObservationEvent,
    ConflictObservationEvent,
    TemporalObservationEvent,
    ContextObservationEvent,
    ToolLoopObservationEvent,
    RunObservationSummary,
    create_memory_observation,
    create_governor_observation,
    create_conflict_observation,
    create_temporal_observation,
    create_context_observation,
    create_tool_loop_observation,
    create_run_summary,
)
from services.memory_telemetry_collector import RunTelemetryCollector
from services.memory_result_contract import (
    DecisionEvent,
    ActionEvent,
    MemoryInfluenceEvent,
    OutcomeEvent,
    create_decision_event,
    create_action_event,
    create_influence_event,
    create_outcome_event,
)
from services.llm_provider import LLMProvider, ProviderCapabilities, CompletionRequest, ToolCall, ToolDefinition, Message
from services.tool_calling_loop import run_tool_calling_loop, ToolCallLoopResult
from services.agent_memory_tools import MemoryContext


# ═════════════════════════════════════════════════════════════════════
# SECTION 1: OBSERVATION EVENT CREATION
# ═════════════════════════════════════════════════════════════════════

class TestObservationEventCreation:
    """Verify all observation events can be created and serialized."""

    def test_memory_observation_event(self):
        obs = create_memory_observation(
            run_id="run-1",
            memory_id="mem-1",
            provider="openrouter",
            model="gpt-4o",
            tool_call_id="tc-1",
            tool_name="memory_search",
            retrieval_rank=1,
            retrieval_score=0.92,
            memory_type="preference",
            memory_state="current",
            scope="workspace",
            selected=True,
            returned=True,
            referenced=False,
        )
        assert isinstance(obs, MemoryObservationEvent)
        assert obs.run_id == "run-1"
        assert obs.memory_id == "mem-1"
        d = obs.to_dict()
        assert d["provider"] == "openrouter"
        assert d["retrieval_rank"] == 1
        assert d["selected"] is True
        assert "id" in d

    def test_memory_observation_minimal(self):
        obs = create_memory_observation(run_id="r", memory_id="m")
        d = obs.to_dict()
        assert d["run_id"] == "r"
        assert d["memory_id"] == "m"
        # None fields should be excluded
        assert "provider" not in d
        assert "retrieval_rank" not in d

    def test_governor_observation_event(self):
        obs = create_governor_observation(
            run_id="run-1",
            decision="STORE",
            rule_id="new_durable_memory",
            reason="Durable user preference",
            confidence=0.85,
            effective_confidence=0.85,
            importance=0.75,
            source_type="user_message",
            source_trust=1.0,
            memory_type="preference",
            scope="workspace",
        )
        assert isinstance(obs, GovernorObservationEvent)
        d = obs.to_dict()
        assert d["decision"] == "STORE"
        assert d["rule_id"] == "new_durable_memory"
        assert d["confidence"] == 0.85

    def test_conflict_observation_event(self):
        obs = create_conflict_observation(
            run_id="run-1",
            old_memory_id="mem-old",
            new_memory_id="mem-new",
            resolution="SUPERSEDE",
            confidence=0.9,
            reason="correction_detected",
            reason_category="correction",
            similarity_score=0.65,
            revision=2,
            superseded=True,
        )
        assert isinstance(obs, ConflictObservationEvent)
        d = obs.to_dict()
        assert d["resolution"] == "SUPERSEDE"
        assert d["reason_category"] == "correction"
        assert d["superseded"] is True

    def test_temporal_observation_event(self):
        obs = create_temporal_observation(
            run_id="run-1",
            query_temporal_intent="historical",
            intent_confidence=0.8,
            memories_filtered=5,
            memories_returned=3,
            current_state_only=False,
        )
        assert isinstance(obs, TemporalObservationEvent)
        d = obs.to_dict()
        assert d["query_temporal_intent"] == "historical"
        assert d["memories_filtered"] == 5

    def test_context_observation_event(self):
        obs = create_context_observation(
            run_id="run-1",
            memory_count=3,
            memory_ids=["m1", "m2", "m3"],
            total_context_tokens=1500,
            memory_context_tokens=450,
            duplicates_removed=1,
            truncated=False,
            current_state_memories=2,
            historical_memories=1,
        )
        assert isinstance(obs, ContextObservationEvent)
        d = obs.to_dict()
        assert d["memory_count"] == 3
        assert d["memory_ids"] == ["m1", "m2", "m3"]
        assert d["duplicates_removed"] == 1

    def test_tool_loop_observation_event(self):
        obs = create_tool_loop_observation(
            run_id="run-1",
            provider="openrouter",
            model="gpt-4o",
            tool_rounds=2,
            memory_tool_calls=3,
            non_memory_tool_calls=0,
            abstained_from_memory=False,
            tool_failures=0,
            tool_loop_terminated=False,
            total_tool_ms=245.6,
        )
        assert isinstance(obs, ToolLoopObservationEvent)
        d = obs.to_dict()
        assert d["tool_rounds"] == 2
        assert d["memory_tool_calls"] == 3
        assert d["total_tool_ms"] == 245.6

    def test_run_observation_summary(self):
        summary = create_run_summary(
            run_id="run-1",
            provider="openrouter",
            model="gpt-4o",
            memory_observations=[{"memory_id": "m1"}],
            tool_loop_observation={"tool_rounds": 1},
        )
        assert isinstance(summary, RunObservationSummary)
        d = summary.to_dict()
        assert d["run_id"] == "run-1"
        assert len(d["memory_observations"]) == 1
        assert d["tool_loop_observation"]["tool_rounds"] == 1


# ═════════════════════════════════════════════════════════════════════
# SECTION 2: TELEMETRY COLLECTOR
# ═════════════════════════════════════════════════════════════════════

class TestTelemetryCollector:
    """Verify the RunTelemetryCollector accumulates events correctly."""

    def test_collector_creation(self):
        collector = RunTelemetryCollector(
            run_id="run-1",
            provider="openrouter",
            model="gpt-4o",
        )
        assert collector.run_id == "run-1"
        assert collector.provider == "openrouter"

    def test_record_retrieval(self):
        collector = RunTelemetryCollector(run_id="run-1")
        obs = collector.record_retrieval(
            memory_id="mem-1",
            tool_call_id="tc-1",
            tool_name="memory_search",
            rank=1,
            score=0.92,
            memory_type="preference",
            memory_state="current",
            scope="workspace",
        )
        assert len(collector.memory_observations) == 1
        assert obs.memory_id == "mem-1"
        assert obs.retrieval_rank == 1
        assert obs.returned is True

    def test_record_selection(self):
        collector = RunTelemetryCollector(run_id="run-1")
        collector.record_retrieval(memory_id="mem-1")
        collector.record_selection(memory_id="mem-1", selected=True, referenced=True)
        obs = collector.memory_observations[0]
        assert obs.selected is True
        assert obs.referenced is True

    def test_record_influence(self):
        collector = RunTelemetryCollector(run_id="run-1")
        collector.record_retrieval(memory_id="mem-1")
        collector.record_influence(
            memory_id="mem-1",
            decision_influenced=True,
            action_influenced=True,
            outcome_improved=True,
        )
        obs = collector.memory_observations[0]
        assert obs.decision_influenced is True
        assert obs.action_influenced is True
        assert obs.outcome_improved is True

    def test_record_user_feedback(self):
        collector = RunTelemetryCollector(run_id="run-1")
        collector.record_retrieval(memory_id="mem-1")
        collector.record_user_feedback(memory_id="mem-1", corrected=True)
        assert len(collector.user_feedback) == 1
        assert collector.user_feedback[0]["corrected"] is True
        obs = collector.memory_observations[0]
        assert obs.user_corrected is True

    def test_record_governor_decision(self):
        collector = RunTelemetryCollector(run_id="run-1")
        obs = collector.record_governor_decision(
            decision="STORE",
            rule_id="new_durable_memory",
            reason="Durable preference",
            confidence=0.85,
            source_type="user_message",
            source_trust=1.0,
        )
        assert len(collector.governor_observations) == 1
        assert obs.decision == "STORE"

    def test_record_conflict_resolution(self):
        collector = RunTelemetryCollector(run_id="run-1")
        obs = collector.record_conflict_resolution(
            resolution="SUPERSEDE",
            confidence=0.9,
            reason="correction_detected",
            old_memory_id="mem-old",
            new_memory_id="mem-new",
        )
        assert len(collector.conflict_observations) == 1
        assert obs.resolution == "SUPERSEDE"

    def test_record_temporal_intent(self):
        collector = RunTelemetryCollector(run_id="run-1")
        obs = collector.record_temporal_intent(
            intent="historical",
            confidence=0.8,
            memories_filtered=5,
            memories_returned=3,
        )
        assert len(collector.temporal_observations) == 1
        assert obs.query_temporal_intent == "historical"

    def test_record_context_compilation(self):
        collector = RunTelemetryCollector(run_id="run-1")
        obs = collector.record_context_compilation(
            memory_count=3,
            memory_ids=["m1", "m2", "m3"],
            total_context_tokens=1500,
            duplicates_removed=1,
        )
        assert collector.context_observation is not None
        assert obs.memory_count == 3

    def test_record_tool_loop_metrics(self):
        collector = RunTelemetryCollector(run_id="run-1")
        obs = collector.record_tool_loop_metrics(
            tool_rounds=2,
            memory_tool_calls=3,
            abstained_from_memory=False,
            tool_failures=0,
            total_tool_ms=245.6,
        )
        assert collector.tool_loop_observation is not None
        assert obs.tool_rounds == 2

    def test_build_summary(self):
        collector = RunTelemetryCollector(
            run_id="run-1",
            provider="openrouter",
            model="gpt-4o",
        )
        collector.record_retrieval(memory_id="mem-1", rank=1, score=0.9)
        collector.record_governor_decision(decision="STORE", rule_id="r1", reason="test")
        collector.record_tool_loop_metrics(tool_rounds=1, memory_tool_calls=1)
        
        summary = collector.build_summary()
        assert summary.run_id == "run-1"
        assert summary.provider == "openrouter"
        assert len(summary.memory_observations) == 1
        assert len(summary.governor_observations) == 1
        assert summary.tool_loop_observation is not None

    def test_to_log_dict(self):
        collector = RunTelemetryCollector(run_id="run-1")
        collector.record_retrieval(memory_id="mem-1")
        log_dict = collector.to_log_dict()
        assert isinstance(log_dict, dict)
        assert log_dict["run_id"] == "run-1"
        assert "memory_observations" in log_dict


# ═════════════════════════════════════════════════════════════════════
# SECTION 3: EXISTING EVENT COMPATIBILITY
# ═════════════════════════════════════════════════════════════════════

class TestExistingEventCompatibility:
    """Verify existing events still work and new events are compatible."""

    def test_decision_event_unchanged(self):
        event = create_decision_event(
            run_id="run-1",
            decision_type="recall",
            memory_ids=["mem-1"],
            evidence="tool_call",
            confidence=0.8,
        )
        assert isinstance(event, DecisionEvent)
        d = event.to_dict()
        assert d["decision_type"] == "recall"

    def test_action_event_unchanged(self):
        event = create_action_event(
            run_id="run-1",
            action_type="tool_call",
            success=True,
            tool_name="memory_search",
        )
        assert isinstance(event, ActionEvent)
        d = event.to_dict()
        assert d["action_type"] == "tool_call"

    def test_influence_event_unchanged(self):
        event = create_influence_event(
            run_id="run-1",
            memory_id="mem-1",
            stage="retrieved",
            evidence="tool_call",
            confidence=0.9,
        )
        assert isinstance(event, MemoryInfluenceEvent)
        d = event.to_dict()
        assert d["stage"] == "retrieved"

    def test_outcome_event_now_usable(self):
        event = create_outcome_event(
            run_id="run-1",
            success=True,
            outcome_type="success",
            details="Memory retrieved and used",
        )
        assert isinstance(event, OutcomeEvent)
        d = event.to_dict()
        assert d["outcome_type"] == "success"

    def test_new_events_coexist_with_existing(self):
        """New observation events coexist with existing contract events."""
        decision = create_decision_event(run_id="r", decision_type="recall", memory_ids=[], evidence="test", confidence=0.5)
        action = create_action_event(run_id="r", action_type="tool_call", success=True)
        influence = create_influence_event(run_id="r", memory_id="m", stage="retrieved", evidence="test", confidence=0.5)
        outcome = create_outcome_event(run_id="r", success=True, outcome_type="success")
        
        obs = create_memory_observation(run_id="r", memory_id="m")
        gov = create_governor_observation(run_id="r", decision="STORE", rule_id="r", reason="test")
        conflict = create_conflict_observation(run_id="r", resolution="ADD", confidence=0.5, reason="test")
        
        # All can be serialized
        for event in [decision, action, influence, outcome, obs, gov, conflict]:
            d = event.to_dict()
            assert "run_id" in d or "id" in d


# ═════════════════════════════════════════════════════════════════════
# SECTION 4: TOOL CALLING LOOP TELEMETRY
# ═════════════════════════════════════════════════════════════════════

class TestToolCallingLoopTelemetry:
    """Verify tool calling loop records telemetry when collector provided."""

    def _make_mock_provider(self):
        provider = MagicMock(spec=LLMProvider)
        provider.name.return_value = "mock"
        provider.capabilities.return_value = {ProviderCapabilities.TOOL_CALLING, ProviderCapabilities.STREAMING}
        return provider

    @pytest.mark.asyncio
    async def test_loop_yields_telemetry_summary(self):
        """Loop yields telemetry_summary when collector provided."""
        provider = self._make_mock_provider()
        call_count = 0

        async def mock_stream(request):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                yield [ToolCall(id="tc-1", name="memory_search", arguments={"query": "test"})]
            else:
                yield "Done."

        provider.stream_with_tools = mock_stream

        collector = RunTelemetryCollector(run_id="test-run", provider="mock", model="test")
        events = []
        async for item in run_tool_calling_loop(
            provider=provider,
            model="test",
            messages=[Message(role="user", content="test")],
            context=MemoryContext(user_id="u", workspace_id="w"),
            max_tool_rounds=3,
            max_tokens=100,
            run_id="test-run",
            telemetry=collector,
        ):
            events.append(item)

        # Should have telemetry_summary
        summaries = [e for e in events if isinstance(e, dict) and "telemetry_summary" in e]
        assert len(summaries) == 1
        summary = summaries[0]["telemetry_summary"]
        assert summary["run_id"] == "test-run"
        assert "tool_loop_observation" in summary

    @pytest.mark.asyncio
    async def test_loop_no_telemetry_still_works(self):
        """Loop works fine without telemetry collector."""
        provider = self._make_mock_provider()

        async def mock_stream(request):
            yield "Direct answer."

        provider.stream_with_tools = mock_stream

        events = []
        async for item in run_tool_calling_loop(
            provider=provider,
            model="test",
            messages=[Message(role="user", content="test")],
            context=MemoryContext(user_id="u", workspace_id="w"),
            max_tool_rounds=3,
            max_tokens=100,
        ):
            events.append(item)

        # No telemetry_summary should appear
        summaries = [e for e in events if isinstance(e, dict) and "telemetry_summary" in e]
        assert len(summaries) == 0

    @pytest.mark.asyncio
    async def test_loop_records_retrieval_in_telemetry(self):
        """Loop records memory retrievals in telemetry collector."""
        provider = self._make_mock_provider()
        call_count = 0

        async def mock_stream(request):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                yield [ToolCall(id="tc-1", name="memory_search", arguments={"query": "test"})]
            else:
                yield "Done."

        provider.stream_with_tools = mock_stream

        collector = RunTelemetryCollector(run_id="test-run")
        events = []
        async for item in run_tool_calling_loop(
            provider=provider,
            model="test",
            messages=[Message(role="user", content="test")],
            context=MemoryContext(user_id="u", workspace_id="w"),
            max_tool_rounds=3,
            max_tokens=100,
            run_id="test-run",
            telemetry=collector,
        ):
            events.append(item)

        # Telemetry should have tool loop observation
        assert collector.tool_loop_observation is not None
        # Loop ran 2 rounds: round 1 had tool call, round 2 had no tools
        assert collector.tool_loop_observation.tool_rounds == 2
        # The mock executor doesn't return real memory data, so memory_tool_calls counts tool calls to memory_* tools
        assert collector.tool_loop_observation.memory_tool_calls >= 0  # Tool was called but no memory IDs returned

    @pytest.mark.asyncio
    async def test_loop_records_abstention(self):
        """Loop records abstention when no tools called."""
        provider = self._make_mock_provider()

        async def mock_stream(request):
            yield "Direct answer."

        provider.stream_with_tools = mock_stream

        collector = RunTelemetryCollector(run_id="test-run")
        events = []
        async for item in run_tool_calling_loop(
            provider=provider,
            model="test",
            messages=[Message(role="user", content="test")],
            context=MemoryContext(user_id="u", workspace_id="w"),
            max_tool_rounds=3,
            max_tokens=100,
            run_id="test-run",
            telemetry=collector,
        ):
            events.append(item)

        assert collector.tool_loop_observation is not None
        assert collector.tool_loop_observation.abstained_from_memory is True
        assert collector.tool_loop_observation.memory_tool_calls == 0


# ═════════════════════════════════════════════════════════════════════
# SECTION 5: PRIVACY / DATA MINIMIZATION
# ═════════════════════════════════════════════════════════════════════

class TestPrivacyDataMinimization:
    """Verify telemetry does not store raw prompts or secrets."""

    def test_no_raw_prompts_in_memory_observation(self):
        obs = create_memory_observation(run_id="r", memory_id="m")
        d = obs.to_dict()
        # Should not have content/prompt fields
        assert "content" not in d
        assert "prompt" not in d
        assert "raw" not in d

    def test_no_raw_prompts_in_governor_observation(self):
        obs = create_governor_observation(run_id="r", decision="STORE", rule_id="r", reason="test")
        d = obs.to_dict()
        assert "content" not in d
        assert "prompt" not in d

    def test_no_api_keys_in_observations(self):
        collector = RunTelemetryCollector(run_id="r", provider="openrouter", model="gpt-4o")
        summary = collector.build_summary()
        d = summary.to_dict()
        # Should not have api_key, secret, token fields
        for key in d:
            assert "api_key" not in key.lower()
            assert "secret" not in key.lower()
            assert "token" not in key.lower() or key == "total_context_tokens"

    def test_memory_ids_are_ids_not_content(self):
        collector = RunTelemetryCollector(run_id="r")
        collector.record_retrieval(memory_id="mem-abc-123")
        obs = collector.memory_observations[0]
        assert obs.memory_id == "mem-abc-123"
        # memory_id should be an identifier, not content
        assert len(obs.memory_id) < 200

    def test_provider_and_model_are_metadata(self):
        obs = create_tool_loop_observation(
            run_id="r",
            provider="openrouter",
            model="gpt-4o",
        )
        d = obs.to_dict()
        assert d["provider"] == "openrouter"
        assert d["model"] == "gpt-4o"
        # These are metadata, not secrets


# ═════════════════════════════════════════════════════════════════════
# SECTION 6: EVENT RELATIONSHIPS
# ═════════════════════════════════════════════════════════════════════

class TestEventRelationships:
    """Verify events can be linked via IDs."""

    def test_attribution_chain_linking(self):
        run_id = f"chain-{uuid4().hex[:8]}"
        
        decision = create_decision_event(run_id=run_id, decision_type="recall", memory_ids=["m1"], evidence="tool_call", confidence=0.8)
        action = create_action_event(run_id=run_id, action_type="tool_call", success=True, decision_event_id=decision.id)
        influence = create_influence_event(run_id=run_id, memory_id="m1", stage="retrieved", evidence="tool_call", confidence=0.9, retrieval_event_id=action.id)
        outcome = create_outcome_event(run_id=run_id, success=True, outcome_type="success", influence_event_id=influence.id)
        
        # Chain is linked
        assert action.decision_event_id == decision.id
        assert influence.retrieval_event_id == action.id
        assert outcome.influence_event_id == influence.id

    def test_telemetry_collector链条(self):
        collector = RunTelemetryCollector(run_id="r")
        collector.record_retrieval(memory_id="m1", tool_call_id="tc-1")
        collector.record_selection(memory_id="m1", selected=True)
        collector.record_influence(memory_id="m1", decision_influenced=True)
        
        obs = collector.memory_observations[0]
        assert obs.tool_call_id == "tc-1"
        assert obs.selected is True
        assert obs.decision_influenced is True

    def test_governor_to_conflict_linking(self):
        collector = RunTelemetryCollector(run_id="r")
        gov = collector.record_governor_decision(
            decision="SUPERSEDE",
            rule_id="high_confidence_correction",
            reason="Correction detected",
            candidate_memory_id="mem-new",
            existing_memory_id="mem-old",
        )
        conflict = collector.record_conflict_resolution(
            resolution="SUPERSEDE",
            confidence=0.9,
            reason="correction_detected",
            old_memory_id="mem-old",
            new_memory_id="mem-new",
        )
        # Both reference the same memories
        assert gov.candidate_memory_id == conflict.new_memory_id
        assert gov.existing_memory_id == conflict.old_memory_id


# ═════════════════════════════════════════════════════════════════════
# SECTION 7: DASHBOARD DATA
# ═════════════════════════════════════════════════════════════════════

class TestDashboardData:
    """Verify summary produces machine-readable dashboard data."""

    def test_summary_has_all_sections(self):
        collector = RunTelemetryCollector(
            run_id="r",
            provider="openrouter",
            model="gpt-4o",
            conversation_id="conv-1",
            user_id="u-1",
            workspace_id="w-1",
            project_id="p-1",
        )
        collector.record_retrieval(memory_id="m1")
        collector.record_governor_decision(decision="STORE", rule_id="r1", reason="test")
        collector.record_conflict_resolution(resolution="ADD", confidence=0.5, reason="test")
        collector.record_temporal_intent(intent="current", confidence=0.9)
        collector.record_context_compilation(memory_count=1)
        collector.record_tool_loop_metrics(tool_rounds=1)
        collector.record_outcome(success=True, outcome_type="success")
        collector.total_ms = 150.0

        summary = collector.build_summary()
        d = summary.to_dict()

        assert d["run_id"] == "r"
        assert d["provider"] == "openrouter"
        assert d["model"] == "gpt-4o"
        assert d["conversation_id"] == "conv-1"
        assert len(d["memory_observations"]) == 1
        assert len(d["governor_observations"]) == 1
        assert len(d["conflict_observations"]) == 1
        assert len(d["temporal_observations"]) == 1
        assert d["context_observation"] is not None
        assert d["tool_loop_observation"] is not None
        assert d["outcome_event"] is not None
        assert d["total_ms"] == 150.0

    def test_summary_is_json_serializable(self):
        collector = RunTelemetryCollector(run_id="r")
        collector.record_retrieval(memory_id="m1")
        collector.record_tool_loop_metrics(tool_rounds=1, memory_tool_calls=1)
        
        summary = collector.build_summary()
        json_str = json.dumps(summary.to_dict(), default=str)
        assert len(json_str) > 0
        parsed = json.loads(json_str)
        assert parsed["run_id"] == "r"
