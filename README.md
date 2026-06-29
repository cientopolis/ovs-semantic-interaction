# OVS Semantic Hub

**OVS Semantic Hub** es una plataforma web interactiva para explorar y visualizar grafos de conocimiento RDF basados en la ontología del Observatorio Inmobiliario (OVS-UNLP). Permite conectar un repositorio [GraphDB](https://graphdb.ontotext.com/) y visualizar los datos a través de múltiples vistas complementarias: explorador tabular, mapa geográfico e inspector interactivo del grafo de conocimiento.

---

## Características

- 🔗 **Conexión a GraphDB** — Selección de repositorio con persistencia de sesión y diagnóstico de conexión
- 🗺️ **Mapa geográfico** — Geolocalización de inmuebles (`rec:RealEstate`) con [Leaflet.js](https://leafletjs.com/) y filtros dinámicos por subclase
- 🗂️ **Explorador tabular** — Grilla con edición en línea (doble clic), ordenamiento y búsqueda
- 🕸️ **Inspector de Grafo KG** — Visualización interactiva de nodos del grafo de conocimiento con expansión de relaciones y traversal automático de blank nodes
- 🎨 **Tematización dinámica** — Temas Dark, Light y Pastel sincronizados en toda la interfaz
- 🐛 **Modo Desarrollador** — Etiquetas de identificación de componentes visuales al pasar el mouse
- 👤 **Menú de usuario** — Dropdown de perfil y configuración

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
│       │   └── sparql_routes.py# Endpoints: SPARQL, grafo, mapa, inspector KG
│       └── services/
│           └── graphdb_service.py # Cliente HTTP para GraphDB
├── frontend/
│   ├── index.html              # SPA principal (Mapa · Tabla · Grafo KG)
│   ├── graph-inspector-test.html # Página de prueba independiente del inspector
│   └── src/
│       ├── main.js             # Orquestador de vistas
│       ├── api.js              # Cliente de la API REST
│       ├── style.css           # Estilos (temas dark/light/pastel)
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
| Inspector KG sin resultados | IRI incorrecta o nodo no existe | Verificar la IRI completa copiándola desde el Workbench de GraphDB |

---

## Hitos y Versiones (Milestones)

### 🕸️ Hito v2.3.0 — Inspector de Grafo de Conocimiento
Se integra un nuevo panel **Grafo KG** accesible desde el toggle de vistas del header. Permite explorar en forma de grafo interactivo cualquier nodo del repositorio:
- **Ingreso por IRI**: el usuario ingresa la IRI completa del nodo raíz y obtiene un grafo inmediato de sus relaciones directas.
- **Expansión interactiva**: doble clic sobre cualquier nodo URI expande sus relaciones. Los nodos de tipo literal no son expandibles.
- **Traversal automático de Blank Nodes**: los blank nodes (nodos anónimos RDF) se expanden automáticamente al cargar, navegando desde su contexto padre (predicado + sujeto) para evitar errores de consulta SPARQL.
- **Panel de detalles**: panel lateral con el tipo, IRI/valor y acciones rápidas de cada nodo seleccionado.
- **Leyenda cromática**: diferenciación visual entre nodos Centro, URI, Literal, Blank Node y Clase.
- **Compatibilidad de temas**: hereda automáticamente los temas Dark, Light y Pastel de la aplicación.
- **Soporte Modo Dev**: todos los componentes visuales del inspector tienen `data-dev-id` para identificación.

**Nuevos endpoints de API:**
- `GET /api/sparql/graph/{repo_id}/node?uri=<IRI>` — Consulta las relaciones directas de un nodo URI.
- `GET /api/sparql/graph/{repo_id}/bnode?parent_uri=<IRI>&predicate_uri=<IRI>` — Navega los valores de un blank node desde su contexto padre.

---

### 👤 Hito v2.2.0 — Menú de Usuario (`#menuUsuario`)
Se agrega un menú desplegable (dropdown acordeón) ubicado a la derecha del selector de tema. Incluye información del usuario activo, acceso a perfil, configuración y cierre de sesión. El diseño respeta el look & feel glassmorphism de la aplicación.

---

### 🐛 Hito v2.1.0 — Modo Desarrollador
Se incorpora un toggle **Modo Dev** en el header que, al activarse, muestra el nombre identificador de cada componente visual al pasar el mouse. Cada componente puede recibir un alias personalizable a través de un diálogo modal. Los identificadores se almacenan en `localStorage`.

**Corrección:** se resolvió un bug donde desactivar el modo dev disparaba el diálogo de renombrado por propagación del evento click.

---

### 🚀 Hito v2.0.0 — Migración a React GIS Dashboard (Kepler.gl + Carto)
Se migró la interfaz de usuario de componentes vanilla a una aplicación **React interactiva de una sola página** optimizada para el análisis espacial y la conexión dinámica con GraphDB:
- **Navegación Toggle Dual (Estilo Carto)**: Alternador dinámico en la cabecera entre vista de Mapa y vista de Tabla de alta densidad.
- **Sincronización Bidireccional**: Edición Excel-style (doble clic) en línea en la grilla que actualiza las capas del mapa de manera instantánea.
- **Capas Visuales Avanzadas (Estilo Kepler.gl)**: Control de capas interactivo que permite activar:
  - Capa de puntos/marcadores (coloreados por destino).
  - Capa de mapa de calor de intensidad.
  - Grilla de agregación hexagonal (Hexbins) por densidad espacial.
  - Coropletas de barrios basadas en el valor promedio de suelo.
  - Extrusión pseudo-3D de alturas según los valores inmobiliarios por metro cuadrado.
- **Tematización Dinámica (Light, Dark, Pastel)**: Modifica automáticamente los estilos de la interfaz y las capas base de mapa (Carto Dark Matter, Positron y Voyager).
- **Ejecución Nativa con HTM**: Implementado con la biblioteca HTM (Hyperscript Tagged Markup) para posibilitar el uso de JSX en el cliente sin requerir herramientas de compilación pesadas o CDNs propensos a fallar.

---

## Licencia

Este proyecto es parte del **Observatorio Virtual de Suelo (OVS)** — UNLP / Cientópolis.

---

## Contacto

- **Organización**: [Cientópolis](https://github.com/cientopolis)
- **Repositorio**: [ovs-semantic-interaction](https://github.com/cientopolis/ovs-semantic-interaction)
- **Ontología OVS**: [OVS-inmontology](https://github.com/cientopolis/OVS-inmontology)