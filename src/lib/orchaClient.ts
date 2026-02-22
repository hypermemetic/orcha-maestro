/**
 * Orcha WebSocket RPC Client
 * Connects to substrate at ws://127.0.0.1:4444
 */

export interface OrchaSession {
  session_id: string;
  model: string;
  created_at: number;
  last_activity: number;
  state: SessionState;
  retry_count: number;
  max_retries: number;
  agent_mode: 'single' | 'multi';
  primary_agent_id?: string;
}

export type SessionState =
  | { state: 'idle' }
  | { state: 'running'; stream_id: string; sequence: number; active_agents: number; completed_agents: number; failed_agents: number }
  | { state: 'waiting_approval'; approval_id: string }
  | { state: 'validating'; test_command: string }
  | { state: 'complete' }
  | { state: 'failed'; error: string };

export interface AgentInfo {
  agent_id: string;
  session_id: string;
  claudecode_session_id: string;
  subtask: string;
  state: AgentState;
  is_primary: boolean;
  parent_agent_id?: string;
  created_at: number;
  last_activity: number;
  completed_at?: number;
  error_message?: string;
}

export type AgentState =
  | { state: 'idle' }
  | { state: 'running'; sequence: number }
  | { state: 'waiting_approval'; approval_id: string }
  | { state: 'validating'; test_command: string }
  | { state: 'complete' }
  | { state: 'failed'; error: string };

export interface AgentSummary {
  agent_id: string;
  subtask: string;
  state: AgentState;
  summary: string;
}

export class OrchaClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pending = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();

  constructor(private url: string = 'ws://127.0.0.1:4444') {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[Orcha] Connected to', this.url);
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('[Orcha] WebSocket error:', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== undefined && this.pending.has(message.id)) {
          const { resolve, reject } = this.pending.get(message.id)!;
          this.pending.delete(message.id);

          if (message.error) {
            reject(new Error(message.error.message || 'RPC error'));
          } else {
            resolve(message.result);
          }
        }
      };

      this.ws.onclose = () => {
        console.log('[Orcha] Disconnected');
      };
    });
  }

  private async call(method: string, params: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(message));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async createSession(params: {
    model: string;
    working_directory?: string;
    rules?: string;
    max_retries?: number;
    multi_agent?: boolean;
  }): Promise<{ session_id: string; created_at: number }> {
    const result = await this.call('substrate.orcha.create_session', params);
    if (result.type === 'ok') {
      return result;
    }
    throw new Error(result.message || 'Failed to create session');
  }

  async spawnAgent(params: {
    session_id: string;
    subtask: string;
    parent_agent_id?: string;
  }): Promise<{ agent_id: string; claudecode_session_id: string }> {
    const result = await this.call('substrate.orcha.spawn_agent', params);
    if (result.type === 'ok') {
      return result;
    }
    throw new Error(result.message || 'Failed to spawn agent');
  }

  async listAgents(params: {
    session_id: string;
  }): Promise<AgentInfo[]> {
    const result = await this.call('substrate.orcha.list_agents', params);
    if (result.type === 'ok') {
      return result.agents;
    }
    throw new Error(result.message || 'Failed to list agents');
  }

  async checkStatus(params: {
    session_id: string;
  }): Promise<{ summary: string; agent_summaries: AgentSummary[] }> {
    const result = await this.call('substrate.orcha.check_status', params);
    if (result.type === 'ok') {
      return {
        summary: result.summary,
        agent_summaries: result.agent_summaries || [],
      };
    }
    throw new Error(result.message || 'Failed to check status');
  }

  async getSession(params: {
    session_id: string;
  }): Promise<OrchaSession> {
    const result = await this.call('substrate.orcha.get_session', params);
    if (result.type === 'ok') {
      return result.session;
    }
    throw new Error(result.message || 'Failed to get session');
  }

  async listSessions(): Promise<OrchaSession[]> {
    const result = await this.call('substrate.orcha.list_sessions', {});
    if (result.type === 'ok') {
      return result.sessions;
    }
    throw new Error(result.message || 'Failed to list sessions');
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
