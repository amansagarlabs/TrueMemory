package truememory

import rego.v1

default decision := {
    "resolved": false,
    "policy": "memory.decision.v1",
    "reason": "No deterministic policy matched; semantic advice may be considered.",
}

decision := {
    "resolved": true,
    "value": "high",
    "policy": "agent.tool_risk.v1",
    "reason": "Destructive or externally visible tools require existing authorization.",
} if {
    input.decision_type == "tool_risk"
    input.candidate_tool in {"memory_forget", "delete_file", "deployment", "external_write", "destructive_command"}
}

decision := {
    "resolved": true,
    "value": false,
    "policy": "memory.write.v1",
    "reason": "Only explicit durable memory requests are eligible for a write candidate.",
} if {
    input.decision_type == "memory_write_triage"
    not input.explicit
}

decision := {
    "resolved": true,
    "value": true,
    "policy": "memory.write.v1",
    "reason": "The user explicitly requested durable memory.",
} if {
    input.decision_type == "memory_write_triage"
    input.explicit
}

decision := {
    "resolved": true,
    "value": "fast",
    "policy": "agent.model_route.v1",
    "reason": "Short requests use the fast route unless deterministic signals require reasoning.",
} if {
    input.decision_type == "model_routing"
    not input.complex
}

decision := {
    "resolved": true,
    "value": "reasoning",
    "policy": "agent.model_route.v1",
    "reason": "Complex or multi-step requests use the reasoning route.",
} if {
    input.decision_type == "model_routing"
    input.complex
}
