from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    GRAPHDB_URL: str = "http://localhost:7200"
    GRAPHDB_USER: str = "admin"
    GRAPHDB_PASSWORD: str = "admin"
    GRAPHDB_DEFAULT_REPO: str = "test"
    
    PORT: int = 8000
    HOST: str = "127.0.0.1"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
