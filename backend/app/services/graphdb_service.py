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
        """Obtiene EXCLUSIVAMENTE entidades de tipo RealEstate (y sus subclases) con geolocalización.
        Las coordenadas se obtienen navegando rec:includes hacia el espacio con geo:hasGeometry.
        Agrupa por entidad para concatenar múltiples tipos y obtener sus etiquetas en español/neutras."""
        query = """
        PREFIX : <http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology#>
        PREFIX rec: <https://w3id.org/rec#>
        PREFIX geosparql: <http://www.opengis.net/ont/geosparql#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX pronto: <https://raw.githubusercontent.com/fdioguardi/pronto/main/ontology/pronto.owl#>
        PREFIX gr: <http://purl.org/goodrelations/v1#>
        
        SELECT ?entity 
               (SAMPLE(?label) AS ?labelVal) 
               (GROUP_CONCAT(DISTINCT ?type; separator=";") AS ?types) 
               (GROUP_CONCAT(DISTINCT ?typeLabel; separator=";") AS ?typeLabels) 
               (SAMPLE(?coords) AS ?coordsVal) 
               (SAMPLE(?areaVal) AS ?areaValSample) 
        WHERE {
            # La entidad debe ser de tipo RealEstate o subclase de ella
            ?entity a ?type .
            ?type rdfs:subClassOf* rec:RealEstate .
            
            # Obtener coordenadas navegando desde el inmueble hacia el espacio con geometría
            {
                # Nivel 1: El inmueble incluye directamente al espacio con geometría
                ?entity rec:includes ?space .
                ?space geosparql:hasGeometry ?geometry .
                ?geometry geosparql:asWKT ?coords .
            } UNION {
                # Nivel 2: El inmueble incluye un espacio que a su vez incluye el espacio con geometría
                ?entity rec:includes ?p1 .
                ?p1 rec:includes ?space .
                ?space geosparql:hasGeometry ?geometry .
                ?geometry geosparql:asWKT ?coords .
            } UNION {
                # Nivel 3: tres niveles de inclusión
                ?entity rec:includes ?p1 .
                ?p1 rec:includes ?p2 .
                ?p2 rec:includes ?space .
                ?space geosparql:hasGeometry ?geometry .
                ?geometry geosparql:asWKT ?coords .
            } UNION {
                # Alternativa: relación rec:includedIn inversa (nivel 1)
                ?space rec:includedIn ?entity .
                ?space geosparql:hasGeometry ?geometry .
                ?geometry geosparql:asWKT ?coords .
            } UNION {
                # Alternativa: relación rec:includedIn inversa (nivel 2)
                ?space rec:includedIn ?p1 .
                ?p1 rec:includedIn ?entity .
                ?space geosparql:hasGeometry ?geometry .
                ?geometry geosparql:asWKT ?coords .
            }
            
            # Extraer superficie real de la base de conocimiento
            OPTIONAL {
                ?entity rec:includes ?sp .
                ?sp :hasFeature ?featTotal .
                ?featTotal a :Surface .
                ?featTotal :hasValue ?vNodeTotal .
                ?vNodeTotal pronto:size_type 'total' .
                ?vNodeTotal gr:hasValue ?areaValTotal .
            }
            OPTIONAL {
                ?entity rec:includes ?sp .
                ?sp :hasFeature ?featCov .
                ?featCov a :Surface .
                ?featCov :hasValue ?vNodeCov .
                ?vNodeCov pronto:size_type 'covered' .
                ?vNodeCov gr:hasValue ?areaValCov .
            }
            BIND(COALESCE(?areaValTotal, ?areaValCov) AS ?areaVal)
            
            # Etiqueta opcional en español o neutra
            OPTIONAL {
                ?entity rdfs:label ?label .
                FILTER(lang(?label) = "es" || lang(?label) = "es-ar" || lang(?label) = "")
            }

            # Obtener etiqueta de la clase/tipo para el subtipo
            OPTIONAL {
                ?type rdfs:label ?typeLabel .
                FILTER(lang(?typeLabel) = "es" || lang(?typeLabel) = "es-ar" || lang(?typeLabel) = "")
            }
        }
        GROUP BY ?entity
        LIMIT 5000
        """
        try:
            result = await self.execute_query(repo_id, query)
            entities = []
            for b in result.get("results", {}).get("bindings", []):
                entities.append({
                    "entity": b["entity"]["value"],
                    "label": b.get("labelVal", {}).get("value"),
                    "types": b.get("types", {}).get("value"),
                    "typeLabels": b.get("typeLabels", {}).get("value"),
                    "coords": b.get("coordsVal", {}).get("value"),
                    "area": b.get("areaValSample", {}).get("value"),
                })
            return entities
        except Exception as e:
            raise Exception(f"Error al obtener entidades geolocalizadas: {str(e)}")

    async def get_node_relations_by_iri(self, repo_id: str, entity_uri: str) -> Dict[str, Any]:
        """Obtiene las relaciones salientes de un nodo IRI para el inspector de grafo.
        Retorna la lista de triples (sujeto=entity_uri, predicado, objeto) con metadatos de tipo.
        Para blank nodes en el objeto, retorna también el ID interno para su posterior expansión."""
        query = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?p ?o ?oLabel ?oType ?oId WHERE {{
            <{entity_uri}> ?p ?o .
            BIND(
                IF(isBlank(?o), "bnode",
                    IF(isLiteral(?o), "literal", "uri")
                ) AS ?oType
            )
            BIND(IF(isBlank(?o), str(?o), "") AS ?oId)
            OPTIONAL {{
                ?o rdfs:label ?oLabel .
                FILTER(lang(?oLabel) = "es" || lang(?oLabel) = "es-ar" || lang(?oLabel) = "")
            }}
        }} LIMIT 500
        """
        try:
            result = await self.execute_query(repo_id, query)
            triples = []
            for b in result.get("results", {}).get("bindings", []):
                obj_val = b["o"]["value"]
                obj_type = b.get("oType", {}).get("value", "uri")
                # GraphDB devuelve blank nodes sin prefijo (solo el ID interno como "nodeXYZ")
                # Lo marcamos con el prefijo "bnode:" para identificarlos en el frontend
                obj_id = b.get("oId", {}).get("value", "")
                triples.append({
                    "predicate": b["p"]["value"],
                    "predicate_local": b["p"]["value"].split("#")[-1].split("/")[-1],
                    "object": obj_val,
                    "object_id": obj_id,  # ID interno del blank node (vacío si no es bnode)
                    "object_type": obj_type,
                    "object_label": b.get("oLabel", {}).get("value"),
                    "object_datatype": b["o"].get("datatype"),
                    "object_lang": b["o"].get("xml:lang"),
                })
            return {"uri": entity_uri, "triples": triples}
        except Exception as e:
            raise Exception(f"Error al obtener relaciones del nodo: {str(e)}")

    async def get_bnode_relations(self, repo_id: str, parent_uri: str, predicate_uri: str) -> Dict[str, Any]:
        """Obtiene las relaciones salientes de un blank node navegando desde su padre.
        Los blank nodes en SPARQL no tienen URI consultable directamente; se accede
        a través del triple (parent, predicate, ?bnode) y luego se expande ?bnode."""
        query = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?o ?p2 ?o2 ?o2Label ?o2Type WHERE {{
            <{parent_uri}> <{predicate_uri}> ?o .
            FILTER(isBlank(?o))
            ?o ?p2 ?o2 .
            BIND(
                IF(isBlank(?o2), "bnode",
                    IF(isLiteral(?o2), "literal", "uri")
                ) AS ?o2Type
            )
            OPTIONAL {{
                ?o2 rdfs:label ?o2Label .
                FILTER(lang(?o2Label) = "es" || lang(?o2Label) = "es-ar" || lang(?o2Label) = "")
            }}
        }} LIMIT 500
        """
        try:
            result = await self.execute_query(repo_id, query)
            # Agrupar por blank node ID (?o)
            bnodes: Dict[str, Any] = {}
            for b in result.get("results", {}).get("bindings", []):
                bnode_id = b["o"]["value"]
                if bnode_id not in bnodes:
                    bnodes[bnode_id] = {"bnode_id": bnode_id, "triples": []}
                bnodes[bnode_id]["triples"].append({
                    "predicate": b["p2"]["value"],
                    "predicate_local": b["p2"]["value"].split("#")[-1].split("/")[-1],
                    "object": b["o2"]["value"],
                    "object_type": b.get("o2Type", {}).get("value", "uri"),
                    "object_label": b.get("o2Label", {}).get("value"),
                    "object_datatype": b["o2"].get("datatype"),
                    "object_lang": b["o2"].get("xml:lang"),
                })
            return {
                "parent_uri": parent_uri,
                "predicate_uri": predicate_uri,
                "bnodes": list(bnodes.values())
            }
        except Exception as e:
            raise Exception(f"Error al obtener relaciones del blank node: {str(e)}")
