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

    DEV_MODE: bool = False
    TRUST_PRINCIPAL_ARN: str = "arn:aws:iam::000000000000:root"
    API_PUBLIC_URL: str = "http://localhost:8000"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    RESEND_API_KEY: str = ""
    DIGEST_FROM: str = "hygiene@example.com"

    # Fernet key for encrypting role_arn + external_id at rest.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY: str = "IqebDQNnegvXTO6n5gdTpVcZGXXE35Fcdh2hwT7oQxM="


@lru_cache
def get_settings() -> Settings:
    return Settings()
