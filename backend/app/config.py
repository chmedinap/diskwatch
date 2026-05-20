from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:////data/diskwatch.db"
    smartctl_path: str = "/usr/sbin/smartctl"
    poll_interval_minutes: int = 30
    timezone: str = "America/Santiago"
    alert_webhook_url: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
