from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "dev"
    APP_SECRET: str = "dev-secret"
    JWT_SECRET: str = "dev-jwt"
    JWT_ALG: str = "HS256"

    DATABASE_URL: str = "postgresql+psycopg://hygiene:hygiene@db:5432/hygiene"
    REDIS_URL: str = "redis://redis:6379/0"

    TRUST_PRINCIPAL_ARN: str = "arn:aws:iam::000000000000:root"
    API_PUBLIC_URL: str = "http://localhost:8000"

    RESEND_API_KEY: str = ""
    DIGEST_FROM: str = "hygiene@example.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()
