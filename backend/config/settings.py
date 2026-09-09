"""
Application configuration.

All configurable values (secrets, DB credentials, feature flags) are loaded
from environment variables via a .env file. Never hardcode secrets here.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- App ---
    APP_NAME: str = "SmartVentory"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # --- Database ---
    DATABASE_URL: str

    # --- JWT Auth (used from Phase 3 onward, defined now so .env is stable) ---
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # --- AI Module (used from Phase 7 onward) ---
    GEMINI_API_KEY: str | None = None

    # --- CORS ---
    # Comma-separated list of allowed origins for the vanilla JS frontend.
    CORS_ORIGINS: str = "http://localhost:5500,http://127.0.0.1:5500"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance. Use this via FastAPI Depends() or direct import
    so environment variables are only parsed once per process.
    """
    return Settings()


settings = get_settings()
