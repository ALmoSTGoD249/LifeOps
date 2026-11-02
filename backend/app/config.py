from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str  # no default: secrets/config must come from the environment
    secret_key: str
    environment: str = "production"
    session_ttl_hours: int = 24 * 7
    cookie_secure: bool = True
    cors_origins: str = ""
    admin_email: str = ""
    admin_password: str = ""
    admin_name: str = "Admin"
    login_rate_limit: int = 5  # attempts
    login_rate_window_seconds: int = 300


@lru_cache
def get_settings() -> Settings:
    return Settings()
