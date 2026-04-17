declare global {
  interface GppEmbeddedShellApi {
    start(intent: Record<string, unknown>): boolean;
    resetToLauncher(): boolean;
    getStatus(): { ok: boolean; [key: string]: unknown };
  }

  interface Window {
    GPPEmbeddedShell?: GppEmbeddedShellApi;
    __GPP_APP__?: Record<string, unknown>;
    __GPP_ENDPOINTS__?: Record<string, string>;
  }

  var GPP: any;
  var __GPP_BATTLE_APP__: any;
  var GPPProtocolErrors: any;
}

export {};
