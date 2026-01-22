"""Configuration management for the ImmuDB worker service."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from project root
env_path = Path(__file__).parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)


def _bool_env(name: str, default: str = "false") -> bool:
    """Convert environment variable to boolean."""
    return str(os.getenv(name, default)).lower() == "true"


class Config:
    """Application configuration class."""
    
    # Flask Configuration
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
    DEBUG = _bool_env("DEBUG", "false")
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "5001"))
    
    # ImmuDB Configuration
    IMMUDB_ENABLED = _bool_env("IMMUDB_ENABLED", "true")
    IMMUDB_HOST = os.getenv("IMMUDB_HOST", "localhost:3322")
    IMMUDB_USER = os.getenv("IMMUDB_USER", "immudb")
    IMMUDB_PASS = os.getenv("IMMUDB_PASS", "immudb")
    
    # API Configuration
    API_PREFIX = os.getenv("API_PREFIX", "/api/v1")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")
    
    # Logging Configuration
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_DIR = Path(__file__).parent.parent.parent / "logs"
    
    @classmethod
    def validate(cls):
        """Validate required configuration."""
        if cls.SECRET_KEY == "change-me-in-production" and not cls.DEBUG:
            raise ValueError("SECRET_KEY must be set in production!")
        
        if cls.IMMUDB_ENABLED:
            if not cls.IMMUDB_HOST:
                raise ValueError("IMMUDB_HOST must be set when ImmuDB is enabled!")
            if not cls.IMMUDB_USER:
                raise ValueError("IMMUDB_USER must be set when ImmuDB is enabled!")
            if not cls.IMMUDB_PASS:
                raise ValueError("IMMUDB_PASS must be set when ImmuDB is enabled!")
        
        # Create logs directory if it doesn't exist
        cls.LOG_DIR.mkdir(parents=True, exist_ok=True)


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    LOG_LEVEL = "DEBUG"


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    LOG_LEVEL = "INFO"


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    IMMUDB_ENABLED = False  # Use mock for tests
    LOG_LEVEL = "DEBUG"


# Configuration dictionary
config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": Config,
}


def get_config(env: str = None) -> Config:
    """Get configuration instance based on environment.
    
    Args:
        env: Environment name (development, production, testing)
    
    Returns:
        Config instance
    """
    if env is None:
        env = os.getenv("FLASK_ENV", "default")
    
    return config.get(env, Config)
