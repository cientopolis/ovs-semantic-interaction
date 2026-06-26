from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from pydantic import BaseModel
from app.dependencies import get_graphdb_service
from app.services.graphdb_service import GraphDBService
from app.config import settings

router = APIRouter(prefix="/repositories", tags=["Repositories"])

@router.get("/health")
async def health_check(service: GraphDBService = Depends(get_graphdb_service)):
    """Verifica si la API y el motor GraphDB están en línea."""
    connected = await service.check_connection()
    if connected:
        return {"status": "healthy", "graphdb": "connected"}
    else:
        return {"status": "unhealthy", "graphdb": "disconnected", "detail": "No se pudo conectar a GraphDB. Verifique las credenciales y el servidor."}

@router.get("", response_model=List[Dict[str, Any]])
async def list_repos(service: GraphDBService = Depends(get_graphdb_service)):
    """Lista todos los repositorios disponibles en el servidor GraphDB."""
    try:
        repos = await service.list_repositories()
        return repos
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{repo_id}/stats", response_model=Dict[str, Any])
async def get_stats(repo_id: str, service: GraphDBService = Depends(get_graphdb_service)):
    """Obtiene estadísticas generales (número de tripletas y clases principales) del repositorio."""
    try:
        stats = await service.get_repository_stats(repo_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/auth/login")
async def admin_login(request: LoginRequest):
    """Valida las credenciales de administrador y retorna éxito."""
    if request.username == settings.ADMIN_USERNAME and request.password == settings.ADMIN_PASSWORD:
        return {"status": "success", "role": "admin", "token": "ovs-admin-mock-token"}
    else:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
