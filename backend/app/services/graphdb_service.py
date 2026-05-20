import httpx
from typing import Dict, List, Any, Optional
from app.config import settings

class GraphDBService:
    def __init__(self):
        self.url = settings.GRAPHDB_URL
        self.user = settings.GRAPHDB_USER
        self.password = settings.GRAPHDB_PASSWORD
        
        # Configurar autenticación si se provee usuario y contraseña
        auth = None
        if self.user and self.password:
            auth = (self.user, self.password)
        
        # Cliente HTTP asíncrono
        self.client = httpx.AsyncClient(auth=auth, timeout=30.0)

    async def close(self):
        await self.client.aclose()

    async def check_connection(self) -> bool:
        """Verifica si el servidor de GraphDB es accesible y las credenciales son válidas."""
        try:
            response = await self.client.get(f"{self.url}/repositories")
            return response.status_code == 200
        except Exception:
            return False

    async def list_repositories(self) -> List[Dict[str, Any]]:
        """Lista todos los repositorios disponibles en el servidor GraphDB."""
        try:
            response = await self.client.get(
                f"{self.url}/repositories",
                headers={"Accept": "application/sparql-results+json"}
            )
            if response.status_code != 200:
                raise Exception(f"Error de GraphDB ({response.status_code}): {response.text}")
            
            data = response.json()
            repos = []
            bindings = data.get("results", {}).get("bindings", [])
            for bind in bindings:
                repos.append({
                    "id": bind.get("id", {}).get("value"),
                    "title": bind.get("title", {}).get("value", ""),
                    "uri": bind.get("uri", {}).get("value", ""),
                })
            return repos
        except Exception as e:
            raise Exception(f"No se pudo comunicar con GraphDB: {str(e)}")

    async def execute_query(self, repo_id: str, sparql_query: str) -> Dict[str, Any]:
        """Ejecuta una consulta SPARQL SELECT o ASK en un repositorio específico."""
        endpoint = f"{self.url}/repositories/{repo_id}"
        try:
            headers = {
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/sparql-query"
            }
            response = await self.client.post(
                endpoint,
                content=sparql_query,
                headers=headers
            )
            if response.status_code != 200:
                raise Exception(f"Error en consulta SPARQL ({response.status_code}): {response.text}")
            return response.json()
        except Exception as e:
            raise Exception(f"Error al ejecutar consulta: {str(e)}")

    async def execute_update(self, repo_id: str, sparql_update: str) -> Dict[str, Any]:
        """Ejecuta una consulta SPARQL UPDATE (inserción/modificación/borrado) en un repositorio."""
        endpoint = f"{self.url}/repositories/{repo_id}/statements"
        try:
            headers = {
                "Content-Type": "application/sparql-update"
            }
            response = await self.client.post(
                endpoint,
                content=sparql_update,
                headers=headers
            )
            if response.status_code not in (200, 204):
                raise Exception(f"Error en actualización SPARQL ({response.status_code}): {response.text}")
            return {"status": "success", "message": "Actualización ejecutada correctamente"}
        except Exception as e:
            raise Exception(f"Error al ejecutar actualización: {str(e)}")

    async def get_repository_stats(self, repo_id: str) -> Dict[str, Any]:
        """Obtiene estadísticas básicas del repositorio (conteo de tripletas y clases)."""
        count_query = "SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }"
        classes_query = """
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?class (COUNT(?ind) as ?count) WHERE {
            ?ind a ?class .
            FILTER (!isLiteral(?class))
        } GROUP BY ?class ORDER BY DESC(?count) LIMIT 10
        """
        
        try:
            count_res = await self.execute_query(repo_id, count_query)
            classes_res = await self.execute_query(repo_id, classes_query)
            
            triples_count = 0
            try:
                triples_count = int(count_res["results"]["bindings"][0]["count"]["value"])
            except (KeyError, IndexError, ValueError):
                pass
                
            classes = []
            bindings = classes_res.get("results", {}).get("bindings", [])
            for b in bindings:
                classes.append({
                    "class": b["class"]["value"],
                    "count": int(b["count"]["value"])
                })
                
            return {
                "repository": repo_id,
                "triples_count": triples_count,
                "top_classes": classes
            }
        except Exception as e:
            return {
                "repository": repo_id,
                "triples_count": 0,
                "top_classes": [],
                "error": str(e)
            }

    async def get_entity_relations(self, repo_id: str, entity_uri: str) -> Dict[str, Any]:
        """Obtiene todas las relaciones entrantes y salientes de una entidad (URI) específica."""
        # Consulta para relaciones salientes (sujeto -> predicado -> objeto)
        outgoing_query = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?p ?o ?oLabel WHERE {{
            <{entity_uri}> ?p ?o .
            OPTIONAL {{ 
                ?o rdfs:label ?oLabel .
                FILTER(lang(?oLabel) = "es" || lang(?oLabel) = "es-ar" || lang(?oLabel) = "")
            }}
        }} LIMIT 200
        """
        
        # Consulta para relaciones entrantes (sujeto -> predicado -> objeto)
        incoming_query = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?s ?p ?sLabel WHERE {{
            ?s ?p <{entity_uri}> .
            OPTIONAL {{ 
                ?s rdfs:label ?sLabel .
                FILTER(lang(?sLabel) = "es" || lang(?sLabel) = "es-ar" || lang(?sLabel) = "")
            }}
        }} LIMIT 200
        """
        
        try:
            out_res = await self.execute_query(repo_id, outgoing_query)
            in_res = await self.execute_query(repo_id, incoming_query)
            
            outgoing = []
            for b in out_res.get("results", {}).get("bindings", []):
                outgoing.append({
                    "predicate": b["p"]["value"],
                    "object": b["o"]["value"],
                    "object_type": b["o"]["type"],
                    "object_label": b.get("oLabel", {}).get("value")
                })
                
            incoming = []
            for b in in_res.get("results", {}).get("bindings", []):
                incoming.append({
                    "subject": b["s"]["value"],
                    "subject_label": b.get("sLabel", {}).get("value"),
                    "predicate": b["p"]["value"]
                })
                
            return {
                "uri": entity_uri,
                "outgoing": outgoing,
                "incoming": incoming
            }
        except Exception as e:
            raise Exception(f"Error al obtener relaciones de la entidad: {str(e)}")

    async def get_geolocalized_entities(self, repo_id: str) -> List[Dict[str, Any]]:
        """Obtiene las entidades geolocalizadas presentes en el repositorio, soportando la navegación a través de rec:includes hacia el Space con geometría, y la navegación :hasFeature."""
        query = """
        PREFIX : <http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology#>
        PREFIX rec: <https://w3id.org/rec#>
        PREFIX geosparql: <http://www.opengis.net/ont/geosparql#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        
        SELECT DISTINCT ?entity ?label ?type ?coords ?geometry WHERE {
            ?entity a ?type .
            FILTER(?type != owl:Class)
            {
                # Caso 1: Navegación desde RealEstate/Listing a Space/Site usando rec:includes
                ?entity rec:includes ?space .
                ?space geosparql:hasGeometry ?geometry .
                ?geometry geosparql:asWKT ?coords .
            } UNION {
                # Caso 2: Navegación desde RealEstate/Listing a Space/Site usando relación inversa rec:includedIn
                ?space rec:includedIn ?entity .
                ?space geosparql:hasGeometry ?geometry .
                ?geometry geosparql:asWKT ?coords .
            } UNION {
                # Caso 3: Navegación por :hasFeature y luego geosparql:hasGeometry
                ?entity :hasFeature ?feature .
                ?feature geosparql:hasGeometry ?geometry .
                ?geometry geosparql:asWKT ?coords .
            } UNION {
                # Caso 4: Relación directa GeoSPARQL
                ?entity geosparql:hasGeometry ?geometry .
                ?geometry geosparql:asWKT ?coords .
            } UNION {
                # Caso 5: Relación directa RealEstate Core
                ?entity rec:geometry ?geometry .
                ?geometry rec:coordinates ?coords .
            }
            OPTIONAL {
                ?entity rdfs:label ?label .
                FILTER(lang(?label) = "es" || lang(?label) = "es-ar" || lang(?label) = "")
            }
        } LIMIT 300
        """
        try:
            res = await self.execute_query(repo_id, query)
            entities = []
            for b in res.get("results", {}).get("bindings", []):
                entities.append({
                    "entity": b["entity"]["value"],
                    "label": b.get("label", {}).get("value", b["entity"]["value"].split("#")[-1]),
                    "type": b["type"]["value"],
                    "coords": b["coords"]["value"],
                    "geometry": b.get("geometry", {}).get("value", "")
                })
            return entities
        except Exception as e:
            print(f"Error al obtener entidades geolocalizadas: {e}")
            return []
