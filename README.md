# OVS Semantic Hub

**OVS Semantic Hub** es una plataforma web interactiva para explorar y visualizar grafos de conocimiento RDF basados en la ontología del Observatorio Inmobiliario (OVS-UNLP). Permite conectar un repositorio [GraphDB](https://graphdb.ontotext.com/) y visualizar los datos a través de tres vistas complementarias: explorador tabular, visor de grafo interactivo y mapa geográfico.

---

## Características

- 🔗 **Conexión a GraphDB** — Selección de repositorio con persistencia de sesión
- 🗂️ **Explorador de entidades** — Navegación tabular por clases e instancias
- 🕸️ **Visor de grafo** — Visualización interactiva de redes con [Vis.js](https://visjs.org/)
- 🗺️ **Mapa geográfico** — Geolocalización de inmuebles (`rec:RealEstate`) con [Leaflet.js](https://leafletjs.com/) y filtros dinámicos por subclase
- ⚡ **Consola SPARQL** — Editor de consultas con plantillas predefinidas y exportación JSON

---

## Requisitos previos

Antes de comenzar, asegúrese de tener instalado:

| Componente | Versión mínima | Notas |
|---|---|---|
| [Python](https://www.python.org/downloads/) | 3.10+ | Para el backend FastAPI |
| [GraphDB Free](https://graphdb.ontotext.com/documentation/free/) | 10.x | Servidor de tripletas RDF |

> **No se requiere Node.js.** El frontend es HTML + JavaScript puro (ES Modules) servido directamente por FastAPI.

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/cientopolis/ovs-semantic-interaction.git
cd ovs-semantic-interaction
```

### 2. Crear y activar el entorno virtual de Python

```bash
python3 -m venv venv

# macOS / Linux:
source venv/bin/activate

# Windows:
venv\Scripts\activate
```

### 3. Instalar las dependencias del backend

```bash
pip install -r backend/requirements.txt
```

---

## Configuración

### 4. Configurar las variables de entorno

Copie el archivo de plantilla y edítelo con los datos de su instancia de GraphDB:

```bash
cp backend/.env.template backend/.env
```

Abra `backend/.env` y ajuste los valores:

```dotenv
# URL del servidor GraphDB (por defecto puerto 7200)
GRAPHDB_URL=http://localhost:7200

# Credenciales de GraphDB (dejar vacío si no hay autenticación)
GRAPHDB_USER=admin
GRAPHDB_PASSWORD=admin

# Nombre del repositorio por defecto (sensible a mayúsculas)
GRAPHDB_DEFAULT_REPO=Test

# Configuración del servidor backend
PORT=8000
HOST=127.0.0.1
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

> **⚠️ Importante:** El nombre del repositorio `GRAPHDB_DEFAULT_REPO` es sensible a mayúsculas. Asegúrese de que coincide exactamente con el nombre del repositorio en GraphDB (ej. `Test` ≠ `test`).

### 5. Configurar GraphDB

1. **Descargue e instale** [GraphDB Free](https://graphdb.ontotext.com/documentation/free/installation.html).
2. **Inicie el servidor** GraphDB (normalmente disponible en `http://localhost:7200`).
3. **Cree un repositorio** en la interfaz web de GraphDB:
   - Vaya a **Setup → Repositories → Create new repository**
   - Elija tipo **GraphDB Repository**
   - Asigne un nombre (ej. `Test`) y guárdelo
4. **Cargue la ontología**:
   - El archivo `inmontology.owl` incluido en este repositorio contiene el esquema de la ontología OVS.
   - En GraphDB: **Import → RDF → Upload RDF files** → seleccione `inmontology.owl`
5. **Cargue los datos** de los inmuebles en el mismo repositorio (archivos RDF/Turtle con las instancias).

### Ontología utilizada

Este proyecto usa la ontología **inmontology** del proyecto OVS-UNLP, disponible en:  
[https://github.com/cientopolis/OVS-inmontology](https://github.com/cientopolis/OVS-inmontology)

Las entidades del mapa deben ser subclases de `rec:RealEstate` ([RealEstateCore](https://w3id.org/rec)), con sus coordenadas WKT accesibles vía `rec:includes → geosparql:hasGeometry → geosparql:asWKT`.

---

## Ejecución

### 6. Iniciar el servidor

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 7. Abrir la aplicación

Abra su navegador en:

```
http://localhost:8000
```

La API REST también está documentada y puede explorarse en:

```
http://localhost:8000/docs
```

---

## Estructura del proyecto

```
ovs-semantic-interaction/
├── backend/
│   ├── .env                    # Variables de entorno (no incluido en git)
│   ├── .env.template           # Plantilla de configuración
│   ├── requirements.txt        # Dependencias Python
│   └── app/
│       ├── main.py             # Punto de entrada FastAPI + sirve frontend
│       ├── config.py           # Configuración con Pydantic Settings
│       ├── routes/
│       │   ├── repo_routes.py  # Endpoints: repositorios y estadísticas
│       │   └── sparql_routes.py# Endpoints: consultas SPARQL, grafo, mapa
│       └── services/
│           └── graphdb_service.py # Cliente HTTP para GraphDB
├── frontend/
│   ├── index.html              # SPA principal
│   └── src/
│       ├── main.js             # Orquestador de vistas
│       ├── api.js              # Cliente de la API REST
│       ├── style.css           # Estilos (light mode premium)
│       └── components/
│           ├── repo_selector.js   # Selector de repositorio
│           ├── entity_explorer.js # Explorador tabular
│           ├── sparql_editor.js   # Consola SPARQL
│           ├── graph_viewer.js    # Visor de grafo (Vis.js)
│           └── map_viewer.js      # Mapa geográfico (Leaflet.js)
├── inmontology.owl             # Ontología OVS-inmontology
├── .gitignore
└── README.md
```

---

## Personalización

### Cambiar la ontología o el repositorio

Si desea adaptar el sistema a otro dominio ontológico:

1. **Backend** — Edite las consultas SPARQL en [`backend/app/services/graphdb_service.py`](backend/app/services/graphdb_service.py):
   - `get_geolocalized_entities()` — Consulta de geolocalización (actualmente filtra por `rec:RealEstate` y navega `rec:includes`)
   - Los prefijos de ontología (`:`, `rec:`, `geosparql:`) deben actualizarse para coincidir con su esquema

2. **Frontend** — El selector de repositorio en la interfaz permite cambiar el repositorio activo sin editar código.

### Cambiar el mapa base

En [`frontend/src/components/map_viewer.js`](frontend/src/components/map_viewer.js) puede reemplazar la URL del tile layer de CartoDB Positron por cualquier otro proveedor compatible con Leaflet.js (OpenStreetMap, Stamen, etc.).

### Variables de entorno disponibles

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `GRAPHDB_URL` | `http://localhost:7200` | URL base del servidor GraphDB |
| `GRAPHDB_USER` | `admin` | Usuario de GraphDB (vacío si no hay auth) |
| `GRAPHDB_PASSWORD` | `admin` | Contraseña de GraphDB |
| `GRAPHDB_DEFAULT_REPO` | `test` | Repositorio por defecto al iniciar |
| `PORT` | `8000` | Puerto del servidor FastAPI |
| `HOST` | `127.0.0.1` | Host del servidor FastAPI |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Orígenes permitidos para CORS |

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Error de conexión a GraphDB | GraphDB no está iniciado | Verificar que GraphDB corre en `http://localhost:7200` |
| Repositorio no encontrado | Nombre incorrecto o sensible a mayúsculas | Confirmar el nombre exacto en la UI de GraphDB |
| Mapa sin marcadores | Consulta SPARQL tarda demasiado | Revisar que el repositorio tiene datos y que `rec:RealEstate` y `geosparql:hasGeometry` están presentes |
| Error 400 en consultas personalizadas | SPARQL inválido | Verificar sintaxis en la Consola SPARQL de la app o directamente en GraphDB Workbench |
| Repository is currently in use | Dos procesos accediendo al repositorio | Cerrar otras conexiones o reiniciar GraphDB |

---

## Licencia

Este proyecto es parte del **Observatorio Virtual de Suelo (OVS)** — UNLP / Cientópolis.

---

## Contacto

- **Organización**: [Cientópolis](https://github.com/cientopolis)
- **Repositorio**: [ovs-semantic-interaction](https://github.com/cientopolis/ovs-semantic-interaction)
- **Ontología OVS**: [OVS-inmontology](https://github.com/cientopolis/OVS-inmontology)