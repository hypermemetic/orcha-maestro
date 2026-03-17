/**
 * Orcha client wrapper using synapse-cc generated code
 */

import { createClient, Orcha } from '../generated';

export async function createOrchaClient(url: string = 'ws://127.0.0.1:4444') {
  // Create the base RPC client
  const rpcClient = createClient({
    backend: 'substrate',
    url,
    debug: true,
  });

  // Connect
  await rpcClient.connect();

  // Wrap with typed Orcha client
  const orchaClient = new Orcha.OrchaClientImpl(rpcClient);

  return {
    rpcClient,
    orcha: orchaClient,
    disconnect: () => rpcClient.disconnect(),
  };
}

// Re-export types from generated code
export type {
  OrchaSession,
  AgentInfo,
  AgentSummary,
  SessionState,
  AgentState,
  CreateSessionRequest,
  SpawnAgentRequest,
  ListAgentsRequest,
  CheckStatusRequest,
} from '../generated/orcha/types';
