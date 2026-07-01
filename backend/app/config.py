from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Environment
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    LOG_LEVEL: str = "INFO"
    DATA_RESIDENCY_COUNTRY: str = "RW"

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "RS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # NIDA Integration
    NIDA_API_BASE_URL: str = "https://nida.gov.rw/api/v1"
    NIDA_API_CERT_PATH: str = "/certs/nida_client.crt"
    NIDA_API_KEY_PATH: str = "/certs/nida_client.key"
    NIDA_CA_CERT_PATH: str = "/certs/nida_ca.crt"

    # Interpol
    INTERPOL_GATEWAY_URL: str = ""
    INTERPOL_API_KEY: str = ""
    INTERPOL_CERT_PATH: str = "/certs/interpol_client.crt"

    # Face Recognition Thresholds
    FACE_MATCH_THRESHOLD_HIGH: float = 0.95
    FACE_MATCH_THRESHOLD_PROBABLE: float = 0.85
    FACE_MATCH_THRESHOLD_POSSIBLE: float = 0.70
    FACE_EMBEDDING_DIM: int = 512

    # Storage
    EVIDENCE_STORAGE_PATH: str = "/app/storage/evidence"
    MAX_UPLOAD_SIZE_MB: int = 50

    # SIEM Rules
    SIEM_BULK_QUERY_LIMIT: int = 50
    SIEM_BULK_QUERY_WINDOW_SECONDS: int = 600
    SIEM_LOCATION_OVERACCESS_LIMIT: int = 20
    SIEM_LOCATION_OVERACCESS_WINDOW_SECONDS: int = 3600
    SIEM_NID_DAILY_SCAN_LIMIT: int = 100
    SIEM_OFF_HOURS_START: int = 22
    SIEM_OFF_HOURS_END: int = 5
    SIEM_INTERPOL_REVIEW_WINDOW_SECONDS: int = 7200
    SIEM_CAMERA_OFFLINE_THRESHOLD_MINUTES: int = 15

    # Notifications
    NOTIFICATION_WEBHOOK_URL: str = ""
    SMS_GATEWAY_URL: str = ""
    SMS_API_KEY: str = ""


settings = Settings()
