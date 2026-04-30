declare module 'discord-rpc' {
  interface ClientOptions {
    transport?: string;
  }

  export class Client {
    constructor(options?: ClientOptions);
    login(options: { clientId: string }): Promise<void>;
    setActivity(activity: any): Promise<void>;
    clearActivity(): Promise<void>;
    destroy(): void;
    on(event: string, listener: (...args: any[]) => void): void;
  }

  export const RPC: typeof import('discord-rpc');
  export default Client;
}
