import { BaseComponent } from './base_component.js';
import { listRepositories, getRepositoryStats } from '../api.js';

export class RepoSelector extends BaseComponent {
    constructor(appState) {
        // Inicializar clase base con el contenedor de la tarjeta del selector
        super(appState, 'select-repository');
        
        // Elementos de UI
        this.selectElement = document.getElementById('select-repository');
        this.connectButton = document.getElementById('btn-connect-repo');
        
        // Elementos de UI de estadísticas
        this.tripleCountElement = document.getElementById('stats-triple-count');
        this.statsDetailsElement = document.getElementById('stats-summary-details');
        this.classesListElement = document.getElementById('dashboard-top-classes-list');
        
        // Registrar componentes para el modo desarrollo
        this.registerDevComponent('#repoSelector', 'Selector de Repositorio', document.querySelector('.card-repo-selector'));
        this.registerDevComponent('#repoStats', 'Estadísticas del Grafo', document.querySelector('.card-stats-summary'));
        this.registerDevComponent('#topClasses', 'Clases Principales', document.querySelector('.card-classes-chart'));
        
        this.initEvents();
        
        // Registrar en el estado si cambia la autenticación
        this.appState.onAuthChanged((role) => {
            this.updateAuthPrivileges(role);
        });
    }

    initEvents() {
        // Habilitar botón de conexión cuando se selecciona un repositorio válido (solo admin)
        this.selectElement.addEventListener('change', () => {
            if (this.appState.userRole === 'admin') {
                this.connectButton.disabled = !this.selectElement.value;
            } else {
                this.connectButton.disabled = true;
            }
        });

        // Manejar clic de conexión
        this.connectButton.addEventListener('click', async () => {
            const selectedRepo = this.selectElement.value;
            if (!selectedRepo) return;

            this.connectButton.disabled = true;
            this.connectButton.textContent = 'Conectando...';

            try {
                await this.connectRepository(selectedRepo);
            } catch (error) {
                alert(`Error al conectar con el repositorio: ${error.message}`);
            } finally {
                this.connectButton.disabled = false;
                this.connectButton.textContent = 'Conectar Repositorio';
            }
        });
    }

    async loadRepositories() {
        try {
            this.selectElement.innerHTML = '<option value="" disabled selected>Cargando repositorios...</option>';
            const repos = await listRepositories();
            
            if (repos.length === 0) {
                this.selectElement.innerHTML = '<option value="" disabled>No se encontraron repositorios</option>';
                return;
            }

            this.selectElement.innerHTML = '<option value="" disabled selected>-- Seleccione un Repositorio --</option>';
            repos.forEach(repo => {
                const option = document.createElement('option');
                option.value = repo.id;
                option.textContent = `${repo.title || repo.id} (${repo.id})`;
                this.selectElement.appendChild(option);
            });
            
            // Determinar qué repositorio preseleccionar y conectar al inicio
            const savedRepoId = localStorage.getItem('activeRepository');
            const hasSavedRepo = savedRepoId && repos.some(r => r.id === savedRepoId);
            
            if (hasSavedRepo) {
                this.selectElement.value = savedRepoId;
                this.connectButton.disabled = false;
                await this.connectRepository(savedRepoId);
            } else {
                // Caso alternativo: Buscar repositorio 'test' de forma insensible a mayúsculas (como 'Test')
                const testRepo = repos.find(r => r.id.toLowerCase() === 'test');
                if (testRepo) {
                    this.selectElement.value = testRepo.id;
                    this.connectButton.disabled = false;
                    await this.connectRepository(testRepo.id);
                } else {
                    // Si no hay ninguno preestablecido, desactivar estado y bloquear otras pantallas
                    this.appState.setActiveRepository(null);
                }
            }
        } catch (error) {
            console.error('Error loading repositories:', error);
            this.selectElement.innerHTML = '<option value="" disabled>Error al cargar repositorios</option>';
            this.appState.setActiveRepository(null);
        }
    }

    async connectRepository(repoId) {
        // Actualizar el estado global
        this.appState.setActiveRepository(repoId);
        
        // Cargar estadísticas
        this.tripleCountElement.textContent = 'Cargando...';
        this.statsDetailsElement.innerHTML = '<p class="text-muted">Cargando estadísticas detalladas...</p>';
        this.classesListElement.innerHTML = '<li class="text-muted">Cargando clases...</li>';

        try {
            const stats = await getRepositoryStats(repoId);
            
            // 1. Mostrar recuento de tripletas
            this.tripleCountElement.textContent = stats.triples_count.toLocaleString();
            
            // 2. Mostrar resumen
            this.statsDetailsElement.innerHTML = `
                <p><strong>ID del Repositorio:</strong> ${stats.repository}</p>
                <p><strong>Estado:</strong> Activo y consultable</p>
                <p class="text-muted" style="margin-top: 8px; font-size: 12px;">Última actualización de estadísticas: Justo ahora</p>
            `;
            
            // 3. Mostrar clases principales
            if (stats.top_classes && stats.top_classes.length > 0) {
                this.classesListElement.innerHTML = '';
                stats.top_classes.forEach(cls => {
                    const li = document.createElement('li');
                    
                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'class-uri';
                    // Extraer el nombre de la clase (la parte final después de # o /)
                    const classShortName = cls.class.split('#').pop().split('/').pop();
                    labelSpan.textContent = classShortName;
                    labelSpan.title = cls.class;
                    
                    const countSpan = document.createElement('span');
                    countSpan.className = 'class-count';
                    countSpan.textContent = `${cls.count} inst.`;
                    
                    li.appendChild(labelSpan);
                    li.appendChild(countSpan);
                    
                    // Hacer la clase clicable para ir al explorador
                    li.style.cursor = 'pointer';
                    li.addEventListener('click', () => {
                        this.appState.triggerViewChange('explorer-view', { classFilter: cls.class });
                    });

                    this.classesListElement.appendChild(li);
                });
            } else {
                this.classesListElement.innerHTML = '<li class="text-muted">No se encontraron clases o instancias en este repositorio.</li>';
            }

            // Avisar a otros componentes que el repositorio cambió
            this.appState.notifyRepositoryChanged(repoId);
        } catch (error) {
            this.tripleCountElement.textContent = 'Error';
            this.statsDetailsElement.innerHTML = `<p class="text-danger">No se pudieron cargar las estadísticas: ${error.message}</p>`;
            this.classesListElement.innerHTML = '<li class="text-muted">Error al cargar clases</li>';
            throw error;
        }
    }

    updateAuthPrivileges(role) {
        if (role === 'admin') {
            this.connectButton.disabled = !this.selectElement.value;
            this.connectButton.title = "Conectar repositorio seleccionado";
            this.connectButton.innerHTML = "Conectar Repositorio";
        } else {
            this.connectButton.disabled = true;
            this.connectButton.title = "Se requieren privilegios de administrador para conectar repositorios.";
            this.connectButton.innerHTML = "Conectar (Solo Admin)";
        }
    }
}
