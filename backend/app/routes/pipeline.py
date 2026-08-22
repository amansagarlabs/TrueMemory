"""Pipeline visualization — SSE stream for all processing steps."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from services.memory_store import get_local_artifact
from services.pipeline_runner import run_pipeline_visualization
from services.postgres_store import (
    get_artifact_for_user,
    postgres_enabled,
    resolve_user_id,
)

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/{doc_id}/visualize")
async def visualize_pipeline(
    doc_id: str,
    auth: AuthContext = Depends(require_auth),
):
    """
    Run extract → chunk → tokenize → embed → Milvus and stream step events.
    Frontend uses this for the "Visualize full pipeline" button.
    """
    if not doc_id.strip():
        raise HTTPException(status_code=400, detail="Missing doc_id")

    settings = get_settings()
    _authorize_pipeline_artifact(settings, doc_id=doc_id, auth=auth)
    return StreamingResponse(
        run_pipeline_visualization(doc_id, settings),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _authorize_pipeline_artifact(settings, *, doc_id: str, auth: AuthContext) -> None:
    """Fail closed unless the artifact belongs to the authenticated user."""
    if not auth.user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    if postgres_enabled(settings):
        user_id = resolve_user_id(settings, auth.user_id)
        artifact = (
            get_artifact_for_user(settings, artifact_id=doc_id, user_id=user_id)
            if user_id
            else None
        )
    else:
        artifact = get_local_artifact(
            settings,
            artifact_id=doc_id,
            user_id=auth.user_id,
        )

    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
