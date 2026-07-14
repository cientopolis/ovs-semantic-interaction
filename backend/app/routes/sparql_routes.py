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

@router.get("/entities/{repo_id}/bbox", response_model=List[Dict[str, Any]])
async def get_geolocalized_in_bbox(
    repo_id: str,
    min_lat: float = Query(..., description="Latitud mínima"),
    max_lat: float = Query(..., description="Latitud máxima"),
    min_lng: float = Query(..., description="Longitud mínima"),
    max_lng: float = Query(..., description="Longitud máxima"),
    service: GraphDBService = Depends(get_graphdb_service)
):
    """Retorna una lista de entidades geolocalizadas dentro de un Bounding Box sin límites."""
    try:
        entities = await service.get_entities_in_bbox(repo_id, min_lat, max_lat, min_lng, max_lng)
        return entities
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/graph/{repo_id}/node")
async def get_graph_node(
    repo_id: str,
    uri: str = Query(..., description="IRI absoluta del nodo a expandir en el grafo"),
    service: GraphDBService = Depends(get_graphdb_service)
):
    """Obtiene las relaciones salientes de un nodo para el inspector de grafo de conocimiento.
    Retorna triples con tipo de objeto (uri/literal/bnode) para renderizar en Vis.js."""
    try:
        result = await service.get_node_relations_by_iri(repo_id, uri)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/graph/{repo_id}/bnode")
async def get_graph_bnode(
    repo_id: str,
    parent_uri: str = Query(..., description="IRI del nodo padre que contiene el blank node"),
    predicate_uri: str = Query(..., description="URI del predicado que conecta el padre con el blank node"),
    service: GraphDBService = Depends(get_graphdb_service)
):
    """Expande un blank node navegando desde su nodo padre vía un predicado dado.
    Los blank nodes no tienen URI propia en SPARQL; se acceden desde su contexto."""
    try:
        result = await service.get_bnode_relations(repo_id, parent_uri, predicate_uri)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



