/**
 * Clase Base para los Componentes de OVS Semantic Hub.
 * Sigue los principios SOLID de diseño orientado a objetos.
 */
export class BaseComponent {
    /**
     * @param {Object} appState - Estado global de la aplicación (AppState)
     * @param {string} [containerId] - ID opcional del elemento contenedor en el DOM
     */
    constructor(appState, containerId = null) {
        if (!appState) {
            throw new Error("Se requiere una instancia de AppState para inicializar el componente.");
        }
        this.appState = appState;
        this.container = containerId ? document.getElementById(containerId) : null;
        
        // Atributos para el Modo Desarrollo
        this.devId = null;
        this.devName = null;
    }

    /**
     * Inicializa los eventos del componente. Debe ser sobreescrito por las subclases.
     */
    initEvents() {
        // Por defecto no hace nada
    }

    /**
     * Restablece el componente a su estado inicial. Debe ser sobreescrito por las subclases.
     */
    reset() {
        // Por defecto no hace nada
    }

    /**
     * Registra el componente en el sistema de desarrollo para el inspector visual.
     * @param {string} devId - Identificador único de desarrollo (ej. '#repoSelector')
     * @param {string} defaultName - Nombre legible por defecto (ej. 'Selector de Repositorios')
     * @param {HTMLElement} [element] - Elemento específico del DOM. Si no se provee, usa this.container o el de mayor nivel.
     */
    registerDevComponent(devId, defaultName, element = null) {
        this.devId = devId;
        this.devName = defaultName;
        
        const targetElement = element || this.container;
        if (targetElement) {
            targetElement.setAttribute('data-dev-component', defaultName);
            targetElement.setAttribute('data-dev-id', devId);
            
            // Cargar alias personalizado si existe
            const customName = localStorage.getItem(`dev-name-${devId}`);
            if (customName) {
                targetElement.setAttribute('data-dev-custom-name', customName);
            }
        }
    }

    /**
     * Helper para buscar elementos dentro del contenedor del componente.
     * Mejora la encapsulación (OOD).
     */
    query(selector) {
        const root = this.container || document;
        return root.querySelector(selector);
    }

    /**
     * Helper para buscar múltiples elementos dentro del contenedor del componente.
     */
    queryAll(selector) {
        const root = this.container || document;
        return root.querySelectorAll(selector);
    }
}
