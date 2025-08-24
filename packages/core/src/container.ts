export type ServiceFactory<T = any> = () => T;
export type ServiceToken<T = any> = string | symbol;

export interface DIContainer {
  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  resolve<T>(token: ServiceToken<T>): T;
  has(token: ServiceToken<T>): boolean;
  clear(): void;
}

export class Container implements DIContainer {
  private services = new Map<ServiceToken, ServiceFactory>();
  private singletons = new Map<ServiceToken, ServiceFactory>();
  private instances = new Map<ServiceToken, any>();

  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.services.set(token, factory);
  }

  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.singletons.set(token, factory);
  }

  resolve<T>(token: ServiceToken<T>): T {
    // Check if it's a singleton
    if (this.singletons.has(token)) {
      if (this.instances.has(token)) {
        return this.instances.get(token) as T;
      }

      const factory = this.singletons.get(token)!;
      const instance = factory();
      this.instances.set(token, instance);
      return instance as T;
    }

    // Check if it's a regular service
    if (this.services.has(token)) {
      const factory = this.services.get(token)!;
      return factory() as T;
    }

    throw new Error(`Service not found: ${String(token)}`);
  }

  has(token: ServiceToken): boolean {
    return this.services.has(token) || this.singletons.has(token);
  }

  clear(): void {
    this.services.clear();
    this.singletons.clear();
    this.instances.clear();
  }

  // Get all registered service tokens
  getRegisteredTokens(): ServiceToken[] {
    return [
      ...Array.from(this.services.keys()),
      ...Array.from(this.singletons.keys())
    ];
  }

  // Create a child container that inherits from this one
  createChild(): Container {
    const child = new Container();
    
    // Copy all services (but not instances)
    for (const [token, factory] of this.services) {
      child.services.set(token, factory);
    }
    
    for (const [token, factory] of this.singletons) {
      child.singletons.set(token, factory);
    }

    return child;
  }
}

// Service tokens - using symbols to prevent collisions
export const SERVICE_TOKENS = {
  EventBus: Symbol('EventBus'),
  EditorService: Symbol('EditorService'),
  APIService: Symbol('APIService'),
  EditorFactory: Symbol('EditorFactory'),
  EditorRegistry: Symbol('EditorRegistry'),
  SecurityManager: Symbol('SecurityManager'),
  PerformanceMonitor: Symbol('PerformanceMonitor'),
  Logger: Symbol('Logger'),
  CacheManager: Symbol('CacheManager'),
  ValidationService: Symbol('ValidationService'),
  CollaborationService: Symbol('CollaborationService'),
  StorageManager: Symbol('StorageManager'),
  ConfigManager: Symbol('ConfigManager'),
  ErrorBoundary: Symbol('ErrorBoundary')
} as const;

// Helper for type-safe service registration
export class ServiceRegistry {
  constructor(private container: Container) {}

  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.container.register(token, factory);
  }

  registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.container.registerSingleton(token, factory);
  }

  // Convenience method for class-based services
  registerClass<T>(token: ServiceToken<T>, Class: new (...args: any[]) => T, ...args: any[]): void {
    this.container.register(token, () => new Class(...args));
  }

  registerSingletonClass<T>(token: ServiceToken<T>, Class: new (...args: any[]) => T, ...args: any[]): void {
    this.container.registerSingleton(token, () => new Class(...args));
  }
}

// Global container instance
export const container = new Container();
export const serviceRegistry = new ServiceRegistry(container);

// Decorator for automatic dependency injection (experimental)
export function Injectable<T extends new (...args: any[]) => any>(token: ServiceToken) {
  return function (constructor: T) {
    serviceRegistry.registerSingleton(token, () => new constructor());
    return constructor;
  };
}

// Decorator for injecting dependencies
export function Inject(token: ServiceToken) {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    // This would need more sophisticated implementation for full DI support
    // For now, this is just a marker
  };
}