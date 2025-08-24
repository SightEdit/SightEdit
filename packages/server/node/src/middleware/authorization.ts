/**
 * Authorization Middleware with Ownership Verification
 * Prevents IDOR vulnerabilities and implements row-level security
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { z } from 'zod';

export interface AuthorizedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
    organizationId?: string;
    teamIds?: string[];
  };
  resource?: {
    id: string;
    ownerId: string;
    organizationId?: string;
    teamId?: string;
    permissions?: string[];
    sharedWith?: string[];
  };
}

export interface ResourceAccessPolicy {
  resourceType: string;
  ownerField?: string;
  organizationField?: string;
  teamField?: string;
  sharedField?: string;
  allowedRoles?: string[];
  requiredPermissions?: string[];
  customCheck?: (user: any, resource: any) => boolean | Promise<boolean>;
}

/**
 * Secure resource ID obfuscation to prevent enumeration
 */
export class ResourceIdObfuscator {
  private secret: string;
  
  constructor(secret?: string) {
    this.secret = secret || crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Encode resource ID with type and owner information
   */
  encode(resourceId: string, resourceType: string, ownerId: string): string {
    const payload = JSON.stringify({ id: resourceId, type: resourceType, owner: ownerId });
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(payload);
    const signature = hmac.digest('hex').substring(0, 16);
    
    const encoded = Buffer.from(`${payload}.${signature}`).toString('base64url');
    return encoded;
  }
  
  /**
   * Decode and verify resource ID
   */
  decode(encodedId: string): { id: string; type: string; owner: string } | null {
    try {
      const decoded = Buffer.from(encodedId, 'base64url').toString('utf-8');
      const [payloadStr, signature] = decoded.split('.');
      
      if (!payloadStr || !signature) {
        return null;
      }
      
      // Verify signature
      const hmac = crypto.createHmac('sha256', this.secret);
      hmac.update(payloadStr);
      const expectedSignature = hmac.digest('hex').substring(0, 16);
      
      // Timing-safe comparison
      if (!this.timingSafeEqual(signature, expectedSignature)) {
        return null;
      }
      
      const payload = JSON.parse(payloadStr);
      return {
        id: payload.id,
        type: payload.type,
        owner: payload.owner,
      };
    } catch (error) {
      return null;
    }
  }
  
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
}

/**
 * Authorization service with row-level security
 */
export class AuthorizationService {
  private policies = new Map<string, ResourceAccessPolicy>();
  private idObfuscator: ResourceIdObfuscator;
  private auditLog: any[] = [];
  
  constructor(secret?: string) {
    this.idObfuscator = new ResourceIdObfuscator(secret);
    this.registerDefaultPolicies();
  }
  
  /**
   * Register default resource access policies
   */
  private registerDefaultPolicies(): void {
    // Content policy
    this.registerPolicy({
      resourceType: 'content',
      ownerField: 'userId',
      organizationField: 'organizationId',
      sharedField: 'sharedWith',
      allowedRoles: ['admin', 'editor'],
      requiredPermissions: ['content.read'],
    });
    
    // User profile policy
    this.registerPolicy({
      resourceType: 'user',
      ownerField: 'id',
      allowedRoles: ['admin'],
      requiredPermissions: ['user.read'],
      customCheck: (user, resource) => {
        // Users can access their own profile
        return user.id === resource.id;
      },
    });
    
    // Organization policy
    this.registerPolicy({
      resourceType: 'organization',
      organizationField: 'id',
      allowedRoles: ['admin', 'org_admin'],
      requiredPermissions: ['org.read'],
    });
    
    // File/Upload policy
    this.registerPolicy({
      resourceType: 'file',
      ownerField: 'uploadedBy',
      organizationField: 'organizationId',
      sharedField: 'sharedWith',
      allowedRoles: ['admin'],
      requiredPermissions: ['file.read'],
    });
  }
  
  /**
   * Register a resource access policy
   */
  registerPolicy(policy: ResourceAccessPolicy): void {
    this.policies.set(policy.resourceType, policy);
  }
  
  /**
   * Check if user has access to resource
   */
  async hasAccess(
    user: any,
    resource: any,
    resourceType: string,
    action: string = 'read'
  ): Promise<boolean> {
    const policy = this.policies.get(resourceType);
    
    if (!policy) {
      // No policy defined - deny by default
      this.logAccessAttempt(user, resource, resourceType, action, false, 'No policy defined');
      return false;
    }
    
    // Check admin bypass
    if (user.roles?.includes('admin')) {
      this.logAccessAttempt(user, resource, resourceType, action, true, 'Admin bypass');
      return true;
    }
    
    // Check required permissions
    if (policy.requiredPermissions) {
      const requiredPermission = policy.requiredPermissions.find(p => 
        p.replace('.read', `.${action}`)
      );
      
      if (requiredPermission && !user.permissions?.includes(requiredPermission)) {
        this.logAccessAttempt(user, resource, resourceType, action, false, 'Missing permission');
        return false;
      }
    }
    
    // Check ownership
    if (policy.ownerField && resource[policy.ownerField]) {
      if (resource[policy.ownerField] === user.id) {
        this.logAccessAttempt(user, resource, resourceType, action, true, 'Owner access');
        return true;
      }
    }
    
    // Check organization membership
    if (policy.organizationField && resource[policy.organizationField]) {
      if (user.organizationId === resource[policy.organizationField]) {
        this.logAccessAttempt(user, resource, resourceType, action, true, 'Organization member');
        return true;
      }
    }
    
    // Check team membership
    if (policy.teamField && resource[policy.teamField]) {
      if (user.teamIds?.includes(resource[policy.teamField])) {
        this.logAccessAttempt(user, resource, resourceType, action, true, 'Team member');
        return true;
      }
    }
    
    // Check shared access
    if (policy.sharedField && resource[policy.sharedField]) {
      const sharedWith = Array.isArray(resource[policy.sharedField]) 
        ? resource[policy.sharedField] 
        : [resource[policy.sharedField]];
      
      if (sharedWith.includes(user.id) || sharedWith.includes(user.email)) {
        this.logAccessAttempt(user, resource, resourceType, action, true, 'Shared access');
        return true;
      }
    }
    
    // Check allowed roles
    if (policy.allowedRoles) {
      const hasRole = policy.allowedRoles.some(role => user.roles?.includes(role));
      if (hasRole) {
        this.logAccessAttempt(user, resource, resourceType, action, true, 'Role-based access');
        return true;
      }
    }
    
    // Custom check
    if (policy.customCheck) {
      const allowed = await policy.customCheck(user, resource);
      if (allowed) {
        this.logAccessAttempt(user, resource, resourceType, action, true, 'Custom check passed');
        return true;
      }
    }
    
    // Default deny
    this.logAccessAttempt(user, resource, resourceType, action, false, 'Access denied');
    return false;
  }
  
  /**
   * Log access attempt for audit trail
   */
  private logAccessAttempt(
    user: any,
    resource: any,
    resourceType: string,
    action: string,
    allowed: boolean,
    reason: string
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: user.id,
      userEmail: user.email,
      resourceId: resource.id || resource._id,
      resourceType,
      action,
      allowed,
      reason,
    };
    
    this.auditLog.push(logEntry);
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Authorization audit:', logEntry);
    }
    
    // In production, send to audit logging system
    if (!allowed && process.env.NODE_ENV === 'production') {
      console.warn('Unauthorized access attempt:', logEntry);
    }
  }
  
  /**
   * Get audit log entries
   */
  getAuditLog(filters?: {
    userId?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
  }): any[] {
    let entries = [...this.auditLog];
    
    if (filters?.userId) {
      entries = entries.filter(e => e.userId === filters.userId);
    }
    
    if (filters?.resourceId) {
      entries = entries.filter(e => e.resourceId === filters.resourceId);
    }
    
    if (filters?.startDate) {
      entries = entries.filter(e => new Date(e.timestamp) >= filters.startDate!);
    }
    
    if (filters?.endDate) {
      entries = entries.filter(e => new Date(e.timestamp) <= filters.endDate!);
    }
    
    return entries;
  }
  
  /**
   * Clear audit log (for testing)
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }
}

// Global authorization service instance
const authorizationService = new AuthorizationService(process.env.RESOURCE_ID_SECRET);

/**
 * Middleware to verify resource ownership
 */
export function requireOwnership(resourceType: string, resourceLoader?: (req: Request) => Promise<any>) {
  return async (req: AuthorizedRequest, res: Response, next: NextFunction) => {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }
      
      // Load resource
      let resource: any;
      
      if (resourceLoader) {
        resource = await resourceLoader(req);
      } else {
        // Default: try to load from common locations
        const resourceId = req.params.id || req.params.resourceId || req.body.resourceId;
        
        if (!resourceId) {
          return res.status(400).json({
            success: false,
            error: 'Resource ID required',
            code: 'RESOURCE_ID_REQUIRED',
          });
        }
        
        // Decode obfuscated ID if needed
        const decodedInfo = authorizationService.idObfuscator.decode(resourceId);
        if (decodedInfo) {
          // Verify resource type matches
          if (decodedInfo.type !== resourceType) {
            return res.status(400).json({
              success: false,
              error: 'Invalid resource identifier',
              code: 'INVALID_RESOURCE_ID',
            });
          }
          
          // Quick ownership check from decoded info
          if (decodedInfo.owner !== req.user.id && !req.user.roles?.includes('admin')) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
              code: 'ACCESS_DENIED',
            });
          }
        }
        
        // In production, load from database
        // For now, mock the resource
        resource = {
          id: resourceId,
          userId: req.user.id, // Mock ownership
          organizationId: req.user.organizationId,
        };
      }
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found',
          code: 'RESOURCE_NOT_FOUND',
        });
      }
      
      // Check access
      const action = req.method === 'GET' ? 'read' : 
                    req.method === 'POST' ? 'create' :
                    req.method === 'PUT' || req.method === 'PATCH' ? 'update' :
                    req.method === 'DELETE' ? 'delete' : 'read';
      
      const hasAccess = await authorizationService.hasAccess(
        req.user,
        resource,
        resourceType,
        action
      );
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          code: 'ACCESS_DENIED',
        });
      }
      
      // Attach resource to request
      req.resource = resource;
      
      next();
    } catch (error) {
      console.error('Authorization middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTH_ERROR',
      });
    }
  };
}

/**
 * Middleware to require specific roles
 */
export function requireRoles(...roles: string[]) {
  return (req: AuthorizedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }
    
    const hasRole = roles.some(role => req.user!.roles?.includes(role));
    
    if (!hasRole) {
      // Log unauthorized access attempt
      authorizationService.logAccessAttempt(
        req.user,
        { path: req.path },
        'endpoint',
        req.method,
        false,
        `Missing required roles: ${roles.join(', ')}`
      );
      
      return res.status(403).json({
        success: false,
        error: 'Insufficient privileges',
        code: 'INSUFFICIENT_ROLE',
        requiredRoles: roles,
      });
    }
    
    next();
  };
}

/**
 * Middleware to require specific permissions
 */
export function requirePermissions(...permissions: string[]) {
  return (req: AuthorizedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }
    
    const hasPermission = permissions.every(permission => 
      req.user!.permissions?.includes(permission)
    );
    
    if (!hasPermission) {
      // Log unauthorized access attempt
      authorizationService.logAccessAttempt(
        req.user,
        { path: req.path },
        'endpoint',
        req.method,
        false,
        `Missing required permissions: ${permissions.join(', ')}`
      );
      
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSION',
        requiredPermissions: permissions,
      });
    }
    
    next();
  };
}

/**
 * Middleware to validate and sanitize resource IDs
 */
export function validateResourceId(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    const resourceId = req.params[paramName];
    
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        error: 'Resource ID required',
        code: 'RESOURCE_ID_REQUIRED',
      });
    }
    
    // Validate format (prevent injection)
    const idSchema = z.string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid resource ID format');
    
    try {
      idSchema.parse(resourceId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid resource ID format',
        code: 'INVALID_RESOURCE_ID',
      });
    }
    
    next();
  };
}

/**
 * Create scoped query filter based on user permissions
 */
export function createScopedFilter(user: any, baseFilter: any = {}): any {
  const filter = { ...baseFilter };
  
  // Admin sees everything
  if (user.roles?.includes('admin')) {
    return filter;
  }
  
  // Apply user-level filtering
  filter.$or = [
    { userId: user.id }, // Owner
    { ownerId: user.id }, // Alternative owner field
    { 'sharedWith.userId': user.id }, // Shared with user
    { 'sharedWith.email': user.email }, // Shared via email
  ];
  
  // Add organization filter if applicable
  if (user.organizationId) {
    filter.$or.push({ organizationId: user.organizationId });
  }
  
  // Add team filters if applicable
  if (user.teamIds && user.teamIds.length > 0) {
    filter.$or.push({ teamId: { $in: user.teamIds } });
  }
  
  return filter;
}

/**
 * Sanitize resource output to remove sensitive fields
 */
export function sanitizeResource(resource: any, user: any): any {
  const sanitized = { ...resource };
  
  // Remove sensitive fields unless admin
  if (!user.roles?.includes('admin')) {
    delete sanitized.internalNotes;
    delete sanitized.auditLog;
    delete sanitized.systemMetadata;
    
    // Remove other users' personal information
    if (sanitized.userId !== user.id) {
      delete sanitized.userEmail;
      delete sanitized.userPhone;
      delete sanitized.userAddress;
    }
  }
  
  // Always remove passwords and secrets
  delete sanitized.password;
  delete sanitized.passwordHash;
  delete sanitized.apiKey;
  delete sanitized.secretKey;
  delete sanitized.privateKey;
  
  return sanitized;
}

// Export the service instance for direct use
export { authorizationService };