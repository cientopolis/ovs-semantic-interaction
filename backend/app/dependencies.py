from app.services.graphdb_service import GraphDBService

# Instancia global compartida del servicio GraphDB
graphdb_service = GraphDBService()

def get_graphdb_service() -> GraphDBService:
    return graphdb_service
