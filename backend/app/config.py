from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "School Management System"
    env: str = "development"
    debug: bool = True

    secret_key: str = "change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:3000"

    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"
    claude_fast_model: str = "claude-haiku-4-5-20251001"

    aws_region: str = "ap-south-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    email_from: str = "noreply@school.example"

    msg91_auth_key: str = ""
    msg91_sender_id: str = ""
    msg91_dlt_template_id: str = ""

    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = ""

    # The address the outside world reaches this API on (https://erp.example.com),
    # for providers that call back with delivery reports (Twilio needs it on
    # each message). Empty: no callback is requested.
    public_api_base_url: str = ""
    # Where people open the web app (the sign-in link in welcome messages).
    web_app_url: str = "http://localhost:3100"
    # How often queued WhatsApp messages are sent, in seconds (0 turns it off).
    whatsapp_dispatch_interval_seconds: int = 15

    s3_bucket: str = "sms-uploads"
    s3_region: str = "ap-south-1"

    # Story 13.3 — fee reminder scheduler.
    # Set to 0 to disable the in-process daily tick (useful in tests).
    fee_reminder_interval_seconds: int = 24 * 60 * 60  # 24 h

    # Uploaded documents. Local disk under the backend volume by default.
    storage_dir: str = "/app/storage"
    max_upload_mb: int = 10

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
