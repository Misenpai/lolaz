import { Client } from "ldapts";
import * as net from "net";

interface ADAuthConfig {
  server: string;
  port: number;
  domain: string;
}

interface ADAuthResponse {
  success: boolean;
  valid: boolean;
}

interface ADAuthRequest {
  username: string;
  password: string;
}

export class ADAuthService {
  private config: ADAuthConfig;

  constructor(config: ADAuthConfig) {
    this.config = config;
  }

  private serverConnect(server: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.on("connect", () => {
        console.log(`✅ Successfully connected to server ${server}:${port}`);
        socket.destroy();
        resolve(true);
      });

      socket.on("timeout", () => {
        console.log(`⏱️ Connection to server ${server}:${port} timed out`);
        socket.destroy();
        resolve(false);
      });

      socket.on("error", (err) => {
        console.log(
          `❌ Error connecting to server ${server}:${port} - ${err.message}`,
        );
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, server);
    });
  }

  async authenticateUser(credentials: ADAuthRequest): Promise<ADAuthResponse> {
    let authenticated = false;
    let serverAvailable = false;
    let serverUrl = "";

    // Check if server is reachable
    if (await this.serverConnect(this.config.server, this.config.port)) {
      serverUrl = this.config.server;
      serverAvailable = true;
    } else {
      console.log(
        `⚠️ Server ${this.config.server}:${this.config.port} is not reachable`,
      );
    }

    // If server is available, try to authenticate
    if (serverAvailable) {
      const client = new Client({
        url: `ldaps://${serverUrl}:${this.config.port}`,
        timeout: 5000,
        connectTimeout: 5000,
      });

      // Inside the authenticateUser method

      try {
        const userPrincipalName = `${credentials.username}@${this.config.domain}`;
        await client.bind(userPrincipalName, credentials.password);
        authenticated = true;
        console.log(
          `✅ User ${credentials.username} authenticated successfully`,
        );
        await client.unbind();
      } catch (error) {
        // <-- Change is here
        authenticated = false;
        // LOG THE ACTUAL ERROR OBJECT
        console.error(
          `❌ Authentication failed for user ${credentials.username}. Reason:`,
          error, // <-- This will give you the real error from the LDAP server
        );
        try {
          await client.unbind();
        } catch (e) {
          // Ignore unbind errors after a failed bind
        }
      }
    }

    return {
      success: true,
      valid: authenticated,
    };
  }
}

// Singleton instance
let adAuthInstance: ADAuthService | null = null;

export const getADAuthService = (): ADAuthService => {
  if (!adAuthInstance) {
    const config = {
      server: process.env.AD_SERVER!,
      port: parseInt(process.env.AD_PORT!),
      domain: process.env.AD_DOMAIN!,
    };

    adAuthInstance = new ADAuthService(config);
  }

  return adAuthInstance;
};
