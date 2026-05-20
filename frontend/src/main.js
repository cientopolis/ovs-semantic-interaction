import { checkHealth } from './api.js';
import { RepoSelector } from './components/repo_selector.js';
import { EntityExplorer } from './components/entity_explorer.js';
import { SparqlEditor } from './components/sparql_editor.js';
import { GraphViewer } from './components/graph_viewer.js';
import { MapViewer } from './components/map_viewer.js';

class AppState {
    constructor() {
        // Cargar repositorio activo desde localStorage si existe
        this.activeRepository = localStorage.getItem('activeRepository') || null;
        this.selectedEntityUri = null;
        
        // Callbacks de comunicación inter-componentes
        this.repoChangeCallbacks = [];
        this.viewChangeCallbacks = [];
    }

    setActiveRepository(repoId) {
        this.activeRepository = repoId;
        
        if (repoId) {
            localStorage.setItem('activeRepository', repoId);
        } else {
            localStorage.removeItem('activeRepository');
        }
        
        // Actualizar UI de la barra lateral
        const activeRepoBadge = document.getElementById('active-repo-badge');
        const activeRepoText = document.getElementById('active-repo-text');
        
        if (activeRepoText) {
            activeRepoText.textContent = repoId || 'Ninguno';
        }
        if (activeRepoBadge) {
            activeRepoBadge.style.display = repoId ? 'flex' : 'none';
        }

        // Alternar clase de bloqueo en el contenedor de la aplicación
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.classList.toggle('repo-inactive', !repoId);
        }
    }

    setSelectedEntity(uri) {
        this.selectedEntityUri = uri;
    }

    // Registrar observadores
    onRepositoryChanged(callback) {
        this.repoChangeCallbacks.push(callback);
    }

    notifyRepositoryChanged(repoId) {
        this.repoChangeCallbacks.forEach(cb => {
            try {
                cb(repoId);
            } catch (e) {
                console.error('Error en callback de repositorio cambiado:', e);
            }
        });
    }

    onViewChanged(callback) {
        this.viewChangeCallbacks.push(callback);
    }

    triggerViewChange(viewId, params = {}) {
        this.viewChangeCallbacks.forEach(cb => {
            try {
                cb(viewId, params);
            } catch (e) {
                console.error('Error en callback de cambio de vista:', e);
            }
        });
    }
}

// Inicialización de la aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Inicializando OVS Semantic Hub...');

    // Instanciar el estado compartido de la aplicación
    const appState = new AppState();

    // Establecer estado de bloqueo inicial según repositorio guardado
    appState.setActiveRepository(appState.activeRepository);

    // Enlazar los botones de los overlays de bloqueo para redirigir al dashboard
    document.querySelectorAll('.btn-go-to-dashboard').forEach(btn => {
        btn.addEventListener('click', () => {
            appState.triggerViewChange('dashboard-view');
        });
    });

    // Instanciar componentes
    const repoSelector = new RepoSelector(appState);
    const entityExplorer = new EntityExplorer(appState);
    const sparqlEditor = new SparqlEditor(appState);
    const graphViewer = new GraphViewer(appState);
    const mapViewer = new MapViewer(appState);

    // Configurar menú de navegación SPA
    initNavigation(appState);

    // Suscribirse a cambios de vista para coordinar transiciones complejas
    appState.onViewChanged((viewId, params) => {
        // 1. Cambiar visualmente de vista
        switchView(viewId);

        // 2. Coordinar acciones específicas de componentes
        if (viewId === 'graph-view' && params.rootUri) {
            graphViewer.loadFromExternalUri(params.rootUri);
        } else if (viewId === 'map-view' && params.highlightUri) {
            mapViewer.highlightEntity(params.highlightUri);
        } else if (viewId === 'explorer-view') {
            if (params.classFilter) {
                entityExplorer.classSelect.value = params.classFilter;
                entityExplorer.loadInstancesOfClass(params.classFilter);
            } else if (params.loadUri) {
                entityExplorer.loadEntityDetails(params.loadUri);
            }
        }
    });

    // Validar conexión con el servidor backend al inicio
    await checkBackendConnection(repoSelector);

    // Botón de refrescar conexión
    document.getElementById('btn-refresh-connection').addEventListener('click', async () => {
        const btn = document.getElementById('btn-refresh-connection');
        btn.classList.add('fa-spin');
        await checkBackendConnection(repoSelector);
        btn.classList.remove('fa-spin');
    });
});

/**
 * Controla el menú de navegación lateral (SPA)
 */
function initNavigation(appState) {
    const menuItems = document.querySelectorAll('.menu-item');
    
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-target');
            appState.triggerViewChange(targetView);
        });
    });
}

/**
 * Cambia la clase activa en el DOM para la navegación SPA
 */
function switchView(viewId) {
    const panels = document.querySelectorAll('.view-panel');
    const menuItems = document.querySelectorAll('.menu-item');

    panels.forEach(panel => {
        if (panel.id === viewId) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });

    menuItems.forEach(item => {
        if (item.getAttribute('data-target') === viewId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Forzar redibujo de Leaflet si el mapa se vuelve visible (corrige fallos de renderizado)
    if (viewId === 'map-view') {
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);
    }
}

/**
 * Verifica la disponibilidad del backend y de GraphDB
 */
async function checkBackendConnection(repoSelector) {
    const dot = document.getElementById('connection-dot');
    const text = document.getElementById('connection-text');
    
    try {
        const health = await checkHealth();
        
        if (health.status === 'healthy') {
            dot.className = 'status-dot dot-online';
            text.textContent = 'En línea (GraphDB)';
            
            // Cargar repositorios en el selector
            await repoSelector.loadRepositories();
        } else {
            dot.className = 'status-dot dot-offline';
            text.textContent = 'Sin GraphDB';
            alert(`Alerta de Conexión: El servidor backend responde pero reporta problemas: ${health.detail || 'Sin detalles'}`);
        }
    } catch (e) {
        dot.className = 'status-dot dot-offline';
        text.textContent = 'Servidor Caído';
        console.error('Failed to connect to backend api:', e);
    }
}
