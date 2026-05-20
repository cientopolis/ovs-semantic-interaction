from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, Any, List
from app.dependencies import get_graphdb_service
from app.services.graphdb_service import GraphDBService

router = APIRouter(prefix="/sparql", tags=["SPARQL & Entities"])

class QueryRequest(BaseModel):
    query: str

class UpdateRequest(BaseModel):
    update: str

@router.post("/query/{repo_id}")
async def execute_sparql_query(
    repo_id: str,
    request: QueryRequest,
    service: GraphDBService = Depends(get_graphdb_service)
):
    """Ejecuta una consulta SPARQL SELECT o ASK en el repositorio indicado."""
    try:
        result = await service.execute_query(repo_id, request.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/update/{repo_id}")
async def execute_sparql_update(
    repo_id: str,
    request: UpdateRequest,
    service: GraphDBService = Depends(get_graphdb_service)
):
    """Ejecuta una actualización SPARQL UPDATE (INSERT/DELETE) en el repositorio indicado."""
    try:
        result = await service.execute_update(repo_id, request.update)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/entity/{repo_id}/relations")
async def get_entity_relations(
    repo_id: str,
    uri: str = Query(..., description="URI absoluta de la entidad a consultar"),
    service: GraphDBService = Depends(get_graphdb_service)
):
    """Obtiene las propiedades y relaciones directas (entrantes y salientes) de una URI."""
    try:
        relations = await service.get_entity_relations(repo_id, uri)
        return relations
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/entities/{repo_id}/geolocalized", response_model=List[Dict[str, Any]])
async def get_geolocalized(
    repo_id: str,
    service: GraphDBService = Depends(get_graphdb_service)
):
    """Retorna una lista de entidades geolocalizadas listas para posicionar en el mapa."""
    try:
        entities = await service.get_geolocalized_entities(repo_id)
        return entities
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
