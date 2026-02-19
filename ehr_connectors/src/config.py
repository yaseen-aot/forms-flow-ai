from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    EPIC_FHIR_BASE_URL: str = "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4"
    EPIC_TOKEN_URL: str = "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token"
    EPIC_CLIENT_ID: str
    EPIC_CLIENT_SECRET: str
    
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    LOG_LEVEL: str = "info"

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()
