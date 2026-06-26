import { checkHealth, loginAdmin } from './api.js';
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
        
        // Estado de autenticación
        this.userRole = localStorage.getItem('userRole') || 'guest';
        
        // Callbacks de comunicación inter-componentes
        this.repoChangeCallbacks = [];
        this.viewChangeCallbacks = [];
        this.authChangeCallbacks = [];
    }

    setUserRole(role) {
        this.userRole = role;
        localStorage.setItem('userRole', role);
        this.notifyAuthChanged(role);
    }

    onAuthChanged(callback) {
        this.authChangeCallbacks.push(callback);
        // Disparar inmediatamente con el rol actual para inicializar
        try {
            callback(this.userRole);
        } catch (e) {
            console.error('Error inicializando callback de auth:', e);
        }
    }

    notifyAuthChanged(role) {
        this.authChangeCallbacks.forEach(cb => {
            try {
                cb(role);
            } catch (e) {
                console.error('Error en callback de autenticación:', e);
            }
        });
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

    // Configurar autenticación y gestión de roles
    initAuthUI(appState);

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

    // Inicializar Modo Desarrollo
    initDevMode();
});

/**
 * Inicializa y controla el "Modo Desarrollo" (Inspector de Componentes visuales)
 */
function initDevMode() {
    const devCheckbox = document.getElementById('dev-mode-checkbox');
    const dialog = document.getElementById('dev-rename-dialog');
    const dialogInput = document.getElementById('dev-dialog-input-name');
    const dialogDefaultId = document.getElementById('dev-dialog-default-id');
    const dialogDefaultName = document.getElementById('dev-dialog-default-name');
    
    const cancelBtn = document.getElementById('btn-dev-dialog-cancel');
    const resetBtn = document.getElementById('btn-dev-dialog-reset');
    const saveBtn = document.getElementById('btn-dev-dialog-save');
    
    let activeDevId = null;
    let activeTargetElement = null;

    if (!devCheckbox) return;

    // Cargar estado inicial de modo desarrollo
    const isDevMode = localStorage.getItem('devModeActive') === 'true';
    devCheckbox.checked = isDevMode;
    if (isDevMode) {
        document.body.classList.add('dev-mode-active');
    }

    // Toggle modo desarrollo
    devCheckbox.addEventListener('change', () => {
        const active = devCheckbox.checked;
        localStorage.setItem('devModeActive', active);
        document.body.classList.toggle('dev-mode-active', active);
    });

    // Interceptar clics en los elementos del inspector de desarrollo
    document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('dev-mode-active')) return;

        // Si el clic se produce dentro del interruptor de Modo Dev o del diálogo de renombrado, no interceptar
        if (e.target.closest('.dev-mode-toggle-container') || e.target.closest('#dev-rename-dialog')) {
            return;
        }

        // NO interceptar si el clic se produce sobre un control interactivo de la aplicación
        if (e.target.closest('button, input, select, textarea, a, .menu-item, option')) {
            return;
        }

        // Encontrar elemento con data-dev-id
        const target = e.target.closest('[data-dev-id]');
        if (!target) return;

        // Evitar desencadenar clics de la UI real del componente al configurarlo
        e.preventDefault();
        e.stopPropagation();

        activeDevId = target.getAttribute('data-dev-id');
        const defaultName = target.getAttribute('data-dev-component');
        const customName = localStorage.getItem(`dev-name-${activeDevId}`) || '';

        activeTargetElement = target;
        dialogDefaultId.textContent = activeDevId;
        dialogDefaultName.textContent = defaultName;
        dialogInput.value = customName;

        dialog.style.display = 'flex';
    }, true); // Captura fase para impedir que eventos internos del componente se disparen

    // Cerrar diálogo
    cancelBtn.addEventListener('click', () => {
        dialog.style.display = 'none';
    });

    // Restablecer nombre original (eliminar alias)
    resetBtn.addEventListener('click', () => {
        localStorage.removeItem(`dev-name-${activeDevId}`);
        if (activeTargetElement) {
            activeTargetElement.removeAttribute('data-dev-custom-name');
        }
        dialog.style.display = 'none';
    });

    // Guardar alias personalizado
    saveBtn.addEventListener('click', () => {
        const newName = dialogInput.value.trim();
        if (newName) {
            localStorage.setItem(`dev-name-${activeDevId}`, newName);
            if (activeTargetElement) {
                activeTargetElement.setAttribute('data-dev-custom-name', newName);
            }
        } else {
            localStorage.removeItem(`dev-name-${activeDevId}`);
            if (activeTargetElement) {
                activeTargetElement.removeAttribute('data-dev-custom-name');
            }
        }
        dialog.style.display = 'none';
    });
}

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

/**
 * Inicializa la UI de inicio de sesión y gestión de roles (Admin/Invitado)
 */
function initAuthUI(appState) {
    const loginBtn = document.getElementById('btn-login-admin');
    const logoutBtn = document.getElementById('btn-logout-admin');
    const loginDialog = document.getElementById('admin-login-dialog');
    const cancelBtn = document.getElementById('btn-admin-login-cancel');
    const submitBtn = document.getElementById('btn-admin-login-submit');
    
    const usernameInput = document.getElementById('admin-login-username');
    const passwordInput = document.getElementById('admin-login-password');
    const errorMsg = document.getElementById('admin-login-error-msg');
    
    // Escuchar eventos de cambio de autenticación globales para actualizar la interfaz
    appState.onAuthChanged((role) => {
        const userNameSpan = document.getElementById('header-user-name');
        if (userNameSpan) {
            userNameSpan.textContent = role === 'admin' ? 'Administrador' : 'Invitado';
        }
        if (loginBtn) {
            loginBtn.style.display = role === 'admin' ? 'none' : 'inline-flex';
        }
        if (logoutBtn) {
            logoutBtn.style.display = role === 'admin' ? 'inline-flex' : 'none';
        }
    });

    if (!loginBtn) return;

    // Abrir diálogo de login
    loginBtn.addEventListener('click', () => {
        errorMsg.style.display = 'none';
        passwordInput.value = '';
        loginDialog.style.display = 'flex';
    });

    // Cancelar/Cerrar diálogo
    cancelBtn.addEventListener('click', () => {
        loginDialog.style.display = 'none';
    });

    // Cerrar sesión
    logoutBtn.addEventListener('click', () => {
        appState.setUserRole('guest');
    });

    // Enviar login
    submitBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            errorMsg.textContent = 'Ingrese usuario y contraseña';
            errorMsg.style.display = 'block';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando...';
        errorMsg.style.display = 'none';

        try {
            const data = await loginAdmin(username, password);
            if (data.status === 'success') {
                appState.setUserRole('admin');
                loginDialog.style.display = 'none';
            }
        } catch (error) {
            errorMsg.textContent = error.message || 'Credenciales incorrectas';
            errorMsg.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Ingresar';
        }
    });
}
