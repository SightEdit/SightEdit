/**
 * Project Configuration
 */
export interface ProjectConfig {
  id: string;
  name: string;
  schemas: any;
  themes: any;
  settings: any;
  createdAt: number;
  updatedAt: number;
}

/**
 * Storage Adapter Interface
 */
export interface StorageAdapter {
  name: string;
  saveProject(project: ProjectConfig): Promise<void>;
  loadProject(projectId: string): Promise<ProjectConfig | null>;
  listProjects(): Promise<{ id: string; name: string; updatedAt: number }[]>;
  deleteProject(projectId: string): Promise<void>;
  exportProject(projectId: string): Promise<string>;
  importProject(data: string): Promise<string>;
}

/**
 * LocalStorage Adapter
 */
export class LocalStorageAdapter implements StorageAdapter {
  name = 'localStorage';
  private storageKey = 'sightedit-projects';

  private getProjects(): Map<string, ProjectConfig> {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return new Map();

      const projects = JSON.parse(data);
      return new Map(Object.entries(projects));
    } catch (error) {
      console.error('[LocalStorage] Failed to load projects:', error);
      return new Map();
    }
  }

  private saveProjects(projects: Map<string, ProjectConfig>): void {
    try {
      const data = Object.fromEntries(projects);
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('[LocalStorage] Failed to save projects:', error);
      throw new Error('Failed to save to localStorage');
    }
  }

  async saveProject(project: ProjectConfig): Promise<void> {
    const projects = this.getProjects();
    projects.set(project.id, {
      ...project,
      updatedAt: Date.now()
    });
    this.saveProjects(projects);
  }

  async loadProject(projectId: string): Promise<ProjectConfig | null> {
    const projects = this.getProjects();
    return projects.get(projectId) || null;
  }

  async listProjects(): Promise<{ id: string; name: string; updatedAt: number }[]> {
    const projects = this.getProjects();
    return Array.from(projects.values()).map(p => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt
    }));
  }

  async deleteProject(projectId: string): Promise<void> {
    const projects = this.getProjects();
    projects.delete(projectId);
    this.saveProjects(projects);
  }

  async exportProject(projectId: string): Promise<string> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }
    return JSON.stringify(project, null, 2);
  }

  async importProject(data: string): Promise<string> {
    try {
      const project = JSON.parse(data) as ProjectConfig;

      // Generate new ID if it already exists
      const projects = this.getProjects();
      if (projects.has(project.id)) {
        project.id = `${project.id}-${Date.now()}`;
      }

      await this.saveProject(project);
      return project.id;
    } catch (error) {
      console.error('[LocalStorage] Import error:', error);
      throw new Error('Invalid project data');
    }
  }
}

/**
 * API Adapter (for server-backed storage)
 */
export class APIStorageAdapter implements StorageAdapter {
  name = 'api';
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  async saveProject(project: ProjectConfig): Promise<void> {
    await this.request(`/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify(project)
    });
  }

  async loadProject(projectId: string): Promise<ProjectConfig | null> {
    try {
      return await this.request(`/projects/${projectId}`);
    } catch (error) {
      return null;
    }
  }

  async listProjects(): Promise<{ id: string; name: string; updatedAt: number }[]> {
    return await this.request('/projects');
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request(`/projects/${projectId}`, {
      method: 'DELETE'
    });
  }

  async exportProject(projectId: string): Promise<string> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found`);
    }
    return JSON.stringify(project, null, 2);
  }

  async importProject(data: string): Promise<string> {
    const project = JSON.parse(data) as ProjectConfig;
    const result = await this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(project)
    });
    return result.id;
  }
}

/**
 * FileSystem Adapter (for Node.js environments)
 */
export class FileSystemAdapter implements StorageAdapter {
  name = 'filesystem';
  private projectsDir: string;

  constructor(projectsDir: string = './projects') {
    this.projectsDir = projectsDir;
  }

  async saveProject(project: ProjectConfig): Promise<void> {
    // Note: This is a placeholder - actual implementation would use Node.js fs module
    throw new Error('FileSystemAdapter requires Node.js environment');
  }

  async loadProject(projectId: string): Promise<ProjectConfig | null> {
    throw new Error('FileSystemAdapter requires Node.js environment');
  }

  async listProjects(): Promise<{ id: string; name: string; updatedAt: number }[]> {
    throw new Error('FileSystemAdapter requires Node.js environment');
  }

  async deleteProject(projectId: string): Promise<void> {
    throw new Error('FileSystemAdapter requires Node.js environment');
  }

  async exportProject(projectId: string): Promise<string> {
    throw new Error('FileSystemAdapter requires Node.js environment');
  }

  async importProject(data: string): Promise<string> {
    throw new Error('FileSystemAdapter requires Node.js environment');
  }
}

/**
 * Storage Manager
 * Manages projects across different storage adapters
 */
export class StorageManager {
  private adapter: StorageAdapter;

  constructor(adapter?: StorageAdapter) {
    this.adapter = adapter || new LocalStorageAdapter();
  }

  getAdapter(): StorageAdapter {
    return this.adapter;
  }

  setAdapter(adapter: StorageAdapter): void {
    this.adapter = adapter;
  }

  async saveProject(project: ProjectConfig): Promise<void> {
    return this.adapter.saveProject(project);
  }

  async loadProject(projectId: string): Promise<ProjectConfig | null> {
    return this.adapter.loadProject(projectId);
  }

  async listProjects(): Promise<{ id: string; name: string; updatedAt: number }[]> {
    return this.adapter.listProjects();
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.adapter.deleteProject(projectId);
  }

  async exportProject(projectId: string): Promise<string> {
    return this.adapter.exportProject(projectId);
  }

  async importProject(data: string): Promise<string> {
    return this.adapter.importProject(data);
  }

  async createProject(name: string): Promise<ProjectConfig> {
    const project: ProjectConfig = {
      id: `project-${Date.now()}`,
      name,
      schemas: {},
      themes: {},
      settings: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.saveProject(project);
    return project;
  }
}

/**
 * Global storage manager instance
 */
let globalStorage: StorageManager | null = null;

export function getGlobalStorage(): StorageManager {
  if (!globalStorage) {
    globalStorage = new StorageManager();
  }
  return globalStorage;
}
