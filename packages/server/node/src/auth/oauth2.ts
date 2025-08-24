import { Request, Response } from 'express';
import * as crypto from 'crypto';

export interface OAuth2Config {
  providers: {
    [key: string]: OAuth2Provider;
  };
  callbackUrl: string;
  successRedirect: string;
  failureRedirect: string;
}

export interface OAuth2Provider {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string[];
}

export interface OAuth2User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: string;
  providerData: any;
}

export class OAuth2Auth {
  private config: OAuth2Config;
  private states: Map<string, { provider: string; timestamp: number }> = new Map();

  constructor(config: OAuth2Config) {
    this.config = config;
    
    // Clean up old states every minute
    setInterval(() => {
      const now = Date.now();
      for (const [state, data] of this.states.entries()) {
        if (now - data.timestamp > 600000) { // 10 minutes
          this.states.delete(state);
        }
      }
    }, 60000);
  }

  /**
   * Initiate OAuth2 flow
   */
  async initiateAuth(provider: string, req: Request, res: Response): Promise<void> {
    const providerConfig = this.config.providers[provider];
    if (!providerConfig) {
      return res.status(400).json({
        success: false,
        error: `Unknown provider: ${provider}`
      });
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    this.states.set(state, {
      provider,
      timestamp: Date.now()
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      redirect_uri: `${this.config.callbackUrl}/${provider}`,
      response_type: 'code',
      scope: providerConfig.scope.join(' '),
      state
    });

    const authUrl = `${providerConfig.authorizationUrl}?${params}`;
    res.redirect(authUrl);
  }

  /**
   * Handle OAuth2 callback
   */
  async handleCallback(provider: string, req: Request, res: Response): Promise<void> {
    const { code, state } = req.query;

    // Verify state
    const stateData = this.states.get(state as string);
    if (!stateData || stateData.provider !== provider) {
      return res.redirect(this.config.failureRedirect + '?error=invalid_state');
    }
    this.states.delete(state as string);

    const providerConfig = this.config.providers[provider];
    if (!providerConfig) {
      return res.redirect(this.config.failureRedirect + '?error=unknown_provider');
    }

    try {
      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(
        providerConfig,
        code as string,
        `${this.config.callbackUrl}/${provider}`
      );

      // Get user info
      const userInfo = await this.getUserInfo(
        providerConfig,
        tokenResponse.access_token
      );

      // Process user based on provider
      const user = this.processUserInfo(provider, userInfo);

      // Create session or JWT token
      // This is where you'd integrate with your auth system
      const token = await this.createUserSession(user);

      // Redirect with token
      res.redirect(`${this.config.successRedirect}?token=${token}`);
    } catch (error) {
      console.error('OAuth2 callback error:', error);
      res.redirect(this.config.failureRedirect + '?error=auth_failed');
    }
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(
    provider: OAuth2Provider,
    code: string,
    redirectUri: string
  ): Promise<any> {
    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code for token');
    }

    return response.json();
  }

  /**
   * Get user info from provider
   */
  private async getUserInfo(
    provider: OAuth2Provider,
    accessToken: string
  ): Promise<any> {
    const response = await fetch(provider.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return response.json();
  }

  /**
   * Process user info based on provider
   */
  private processUserInfo(provider: string, userInfo: any): OAuth2User {
    switch (provider) {
      case 'google':
        return {
          id: userInfo.sub,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          provider: 'google',
          providerData: userInfo
        };

      case 'github':
        return {
          id: userInfo.id.toString(),
          email: userInfo.email,
          name: userInfo.name || userInfo.login,
          picture: userInfo.avatar_url,
          provider: 'github',
          providerData: userInfo
        };

      case 'microsoft':
        return {
          id: userInfo.id,
          email: userInfo.mail || userInfo.userPrincipalName,
          name: userInfo.displayName,
          picture: undefined,
          provider: 'microsoft',
          providerData: userInfo
        };

      default:
        return {
          id: userInfo.id || userInfo.sub,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture || userInfo.avatar_url,
          provider,
          providerData: userInfo
        };
    }
  }

  /**
   * Create user session (implement based on your needs)
   */
  private async createUserSession(user: OAuth2User): Promise<string> {
    // This is a placeholder - integrate with your JWT or session system
    // For now, return a simple token
    return Buffer.from(JSON.stringify(user)).toString('base64');
  }

  /**
   * Get pre-configured providers
   */
  static getProviderConfigs(): { [key: string]: Partial<OAuth2Provider> } {
    return {
      google: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
        scope: ['openid', 'email', 'profile']
      },
      github: {
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        scope: ['user:email']
      },
      microsoft: {
        authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
        scope: ['openid', 'email', 'profile']
      }
    };
  }
}