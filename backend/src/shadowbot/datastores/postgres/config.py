from pydantic import BaseModel, Field


class PostgresConfig(BaseModel):
    """Postgres connection configuration."""

    database: str = Field(default="shadowbot", description="Postgres database name")
    username: str = Field(default="shadowbot", description="Postgres username")
    password: str = Field(default="shadowbot", description="Postgres password")
    host: str = Field(default="localhost", description="Postgres host")
    port: int = Field(default=5432, description="Postgres port")
    pool_size: int = Field(default=10, description="Connection pool size")
    max_overflow: int = Field(default=20, description="Maximum overflow size for the pool")

    model_config = {"frozen": True}
