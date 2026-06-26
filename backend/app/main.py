import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from app.config import settings
from app.dependencies import graphdb_service
from app.routes import repo_routes, sparql_routes

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Al iniciar el servidor
    yield
    # Al apagar el servidor: cerrar el cliente HTTP de GraphDB
    await graphdb_service.close()

app = FastAPI(
    title="OVS Semantic Interaction API",
    description="API de intermediación para consultar y visualizar grafos de conocimiento desde GraphDB.",
    version="1.0.0",
    lifespan=lifespan
)

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir las rutas API
app.include_router(repo_routes.router, prefix="/api")
app.include_router(sparql_routes.router, prefix="/api")

# Definición de rutas del frontend
current_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.abspath(os.path.join(current_dir, "../../../ovs-semantic-interaction/frontend"))

# Montar directorio estático para src/ (JS, CSS, componentes) si existe
src_dir = os.path.join(frontend_dir, "src")
if os.path.exists(src_dir):
    app.mount("/src", StaticFiles(directory=src_dir), name="src")
else:
    # Intentar crearlo de antemano si no existe
    os.makedirs(src_dir, exist_ok=True)
    app.mount("/src", StaticFiles(directory=src_dir), name="src")

# Servir index.html en la raíz
@app.get("/")
def read_root():
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "message": "OVS Semantic API is running. (frontend/index.html no encontrado)",
        "docs_url": "/docs"
    }

# Servir db-test.html para diagnóstico de conexión
@app.get("/db-test")
def read_db_test():
    db_test_path = os.path.join(frontend_dir, "db-test.html")
    if os.path.exists(db_test_path):
        return FileResponse(db_test_path)
    return {
        "message": "OVS Semantic API is running. (frontend/db-test.html no encontrado)",
        "docs_url": "/docs"
    }

# Servir dev-inspector-test.html para pruebas de inspector visual
@app.get("/dev-inspector-test")
def read_dev_inspector_test():
    inspector_test_path = os.path.join(frontend_dir, "dev-inspector-test.html")
    if os.path.exists(inspector_test_path):
        return FileResponse(inspector_test_path)
    return {
        "message": "OVS Semantic API is running. (frontend/dev-inspector-test.html no encontrado)",
        "docs_url": "/docs"
    }

# Servir user-menu-test.html para pruebas de menú desplegable de usuario
@app.get("/user-menu-test")
def read_user_menu_test():
    user_menu_test_path = os.path.join(frontend_dir, "user-menu-test.html")
    if os.path.exists(user_menu_test_path):
        return FileResponse(user_menu_test_path)
    return {
        "message": "OVS Semantic API is running. (frontend/user-menu-test.html no encontrado)",
        "docs_url": "/docs"
    }
