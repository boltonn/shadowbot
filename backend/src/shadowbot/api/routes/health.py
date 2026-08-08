from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthStatus(BaseModel):
    """Service liveness status."""

    status: str = "ok"


@router.get("/health")
async def health() -> HealthStatus:
    """Health check endpoint."""
    return HealthStatus()
