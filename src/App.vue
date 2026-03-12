<template>
  <div class="orcha-maestro">
    <header class="header">
      <h1>🎭 Orcha Maestro</h1>
      <p class="subtitle">Multi-Agent Orchestration Control Center</p>
      <div class="connection-status" :class="{ connected: isConnected }">
        {{ isConnected ? '● Connected' : '○ Disconnected' }}
      </div>
    </header>

    <main class="main">
      <div v-if="!isConnected" class="connect-card">
        <h2>Connect to Substrate</h2>
        <button @click="connect" class="btn-primary">Connect to ws://127.0.0.1:4444</button>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <div v-else class="dashboard">
        <!-- Create Session Card -->
        <section class="card create-session">
          <h2>🎬 Create New Session</h2>
          <div class="form-group">
            <label>Model</label>
            <select v-model="newSession.model">
              <option value="sonnet">Sonnet (Recommended)</option>
              <option value="opus">Opus</option>
              <option value="haiku">Haiku</option>
            </select>
          </div>
          <div class="form-group checkbox">
            <label>
              <input type="checkbox" v-model="newSession.multi_agent" />
              Enable Multi-Agent Mode
            </label>
          </div>
          <button @click="createSession" class="btn-primary" :disabled="creatingSession">
            {{ creatingSession ? 'Creating...' : 'Create Session' }}
          </button>
        </section>

        <!-- Sessions List -->
        <section class="card sessions-list">
          <div class="section-header">
            <h2>📋 Active Sessions</h2>
            <button @click="loadSessions" class="btn-secondary">🔄</button>
          </div>

          <div v-if="sessions.length === 0" class="empty-state">
            No active sessions. Create one to get started!
          </div>

          <div v-else class="sessions">
            <div v-for="session in sessions" :key="session.session_id"
                 class="session-card"
                 :class="{ selected: selectedSession?.session_id === session.session_id }"
                 @click="selectSession(session)">
              <div class="session-header">
                <code>{{ session.session_id.substring(0, 12) }}...</code>
                <span class="badge" :class="getStateClass(session.state)">
                  {{ getStateName(session.state) }}
                </span>
              </div>
              <div class="session-meta">
                <span>{{ session.model }}</span>
                <span v-if="session.agent_mode === 'multi'" class="badge multi-agent">Multi-Agent</span>
              </div>
              <div v-if="session.state.state === 'running'" class="agent-counts">
                <span>🔵 {{ session.state.active_agents }}</span>
                <span>✅ {{ session.state.completed_agents }}</span>
                <span>❌ {{ session.state.failed_agents }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Selected Session Details -->
        <section v-if="selectedSession" class="card session-details full-width">
          <h2>🎯 Session: {{ selectedSession.session_id.substring(0, 20) }}...</h2>

          <!-- Spawn Agent (Multi-Agent Mode) -->
          <div v-if="selectedSession.agent_mode === 'multi'" class="spawn-agent">
            <h3>➕ Spawn New Agent</h3>
            <div class="form-group">
              <textarea v-model="newAgent.subtask"
                        placeholder="Describe what this agent should do..."
                        rows="3"></textarea>
            </div>
            <button @click="spawnAgent" class="btn-primary" :disabled="!newAgent.subtask || spawningAgent">
              {{ spawningAgent ? 'Spawning...' : 'Spawn Agent' }}
            </button>
          </div>

          <!-- Agents List -->
          <div v-if="selectedSession.agent_mode === 'multi'" class="agents-section">
            <div class="section-header">
              <h3>🤖 Agents ({{ agents.length }})</h3>
              <button @click="loadAgents" class="btn-secondary">🔄</button>
            </div>

            <div v-if="agents.length === 0" class="empty-state">
              No agents yet. Spawn one above!
            </div>

            <div v-else class="agents-list">
              <div v-for="agent in agents" :key="agent.agent_id" class="agent-card">
                <div class="agent-header">
                  <code>{{ agent.agent_id.substring(0, 16) }}...</code>
                  <span class="badge" :class="getAgentStateClass(agent.state)">
                    {{ getAgentStateName(agent.state) }}
                  </span>
                </div>
                <p class="agent-subtask">"{{ agent.subtask }}"</p>
                <div class="agent-meta">
                  <span v-if="agent.is_primary" class="badge primary">Primary</span>
                  <span class="timestamp">{{ formatDate(agent.created_at) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Status Check -->
          <div class="status-section">
            <div class="section-header">
              <h3>📊 Status Summary</h3>
              <button @click="checkStatus" class="btn-primary" :disabled="checkingStatus">
                {{ checkingStatus ? 'Checking...' : 'Check Status' }}
              </button>
            </div>

            <div v-if="statusSummary" class="status-content">
              <div class="overall-summary">
                <h4>Overall Progress</h4>
                <p>{{ statusSummary.summary }}</p>
              </div>

              <div v-if="statusSummary.agent_summaries.length > 0" class="agent-summaries">
                <h4>Agent Progress</h4>
                <div v-for="agentSummary in statusSummary.agent_summaries"
                     :key="agentSummary.agent_id"
                     class="agent-summary">
                  <div class="agent-summary-header">
                    <div>
                      <strong>{{ agentSummary.agent_id.substring(0, 16) }}...</strong>
                      <p class="agent-summary-subtask">"{{ agentSummary.subtask }}"</p>
                    </div>
                    <span class="badge" :class="getAgentStateClass(agentSummary.state)">
                      {{ getAgentStateName(agentSummary.state) }}
                    </span>
                  </div>
                  <p class="agent-summary-text">{{ agentSummary.summary }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

// TODO: Implement using the generated plexus client in src/lib/plexus/

type SessionState =
  | { state: 'idle' }
  | { state: 'running'; stream_id: string; sequence: number; active_agents: number; completed_agents: number; failed_agents: number }
  | { state: 'waiting_approval'; approval_id: string }
  | { state: 'validating'; test_command: string }
  | { state: 'complete' }
  | { state: 'failed'; error: string }

interface OrchaSession {
  session_id: string
  model: string
  created_at: number
  last_activity: number
  state: SessionState
  retry_count: number
  max_retries: number
  agent_mode: 'single' | 'multi'
  primary_agent_id?: string
}

type AgentState =
  | { state: 'idle' }
  | { state: 'running'; sequence: number }
  | { state: 'waiting_approval'; approval_id: string }
  | { state: 'validating'; test_command: string }
  | { state: 'complete' }
  | { state: 'failed'; error: string }

interface AgentInfo {
  agent_id: string
  session_id: string
  claudecode_session_id: string
  subtask: string
  state: AgentState
  is_primary: boolean
  parent_agent_id?: string
  created_at: number
  last_activity: number
  completed_at?: number
  error_message?: string
}

interface AgentSummary {
  agent_id: string
  subtask: string
  state: AgentState
  summary: string
}

const isConnected = ref(false)
const error = ref('')
const sessions = ref<OrchaSession[]>([])
const selectedSession = ref<OrchaSession | null>(null)
const agents = ref<AgentInfo[]>([])
const statusSummary = ref<{ summary: string; agent_summaries: AgentSummary[] } | null>(null)

const newSession = ref({ model: 'sonnet', max_retries: 3, multi_agent: true })
const newAgent = ref({ subtask: '' })
const creatingSession = ref(false)
const spawningAgent = ref(false)
const checkingStatus = ref(false)

async function connect() { error.value = 'Not implemented' }
async function createSession() {}
async function loadSessions() {}
async function selectSession(session: OrchaSession) { selectedSession.value = session }
async function spawnAgent() {}
async function loadAgents() {}
async function checkStatus() {}

function getStateName(state: SessionState | AgentState | null): string {
  if (!state) return 'Unknown'
  const name = state.state
  return name.charAt(0).toUpperCase() + name.slice(1)
}
function getStateClass(state: SessionState | AgentState | null): string {
  return state?.state ?? ''
}
function getAgentStateName(state: AgentState | null): string { return getStateName(state) }
function getAgentStateClass(state: AgentState | null): string { return getStateClass(state) }
function formatDate(timestamp: number): string { return new Date(timestamp * 1000).toLocaleString() }

onMounted(() => {
  const interval = setInterval(() => {}, 5000)
  onUnmounted(() => clearInterval(interval))
})
</script>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}
</style>

<style scoped>
.orcha-maestro {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.header {
  text-align: center;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.2);
}

.header h1 {
  margin: 0;
  font-size: 2.5rem;
  font-weight: 700;
}

.subtitle {
  margin: 0.5rem 0 0;
  font-size: 1.1rem;
  opacity: 0.9;
}

.connection-status {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  display: inline-block;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
  font-weight: 500;
}

.connection-status.connected {
  background: rgba(76, 175, 80, 0.3);
  color: #a5d6a7;
}

.main {
  max-width: 1600px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.connect-card {
  background: white;
  color: #333;
  padding: 3rem;
  border-radius: 16px;
  text-align: center;
  max-width: 500px;
  margin: 0 auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.dashboard {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.full-width {
  grid-column: 1 / -1;
}

.card {
  background: white;
  color: #333;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card h2, .card h3 {
  margin-top: 0;
  color: #667eea;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #555;
}

.form-group.checkbox label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.form-group input[type="checkbox"] {
  width: auto;
}

.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
  transition: border-color 0.2s;
}

.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
}

.btn-primary, .btn-secondary {
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f0f0f0;
  color: #333;
  padding: 0.5rem 1rem;
  font-size: 1.2rem;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.section-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #999;
  font-style: italic;
}

.session-card {
  padding: 1rem;
  border: 2px solid #f0f0f0;
  border-radius: 8px;
  margin-bottom: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.session-card:hover {
  border-color: #667eea;
  background: #f8f9ff;
  transform: translateX(4px);
}

.session-card.selected {
  border-color: #667eea;
  background: #f0f4ff;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.session-header code {
  font-size: 0.9rem;
  color: #555;
}

.session-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: #666;
  font-weight: 500;
}

.agent-counts {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge.running {
  background: #e3f2fd;
  color: #1976d2;
}

.badge.complete {
  background: #e8f5e9;
  color: #388e3c;
}

.badge.failed {
  background: #ffebee;
  color: #d32f2f;
}

.badge.idle {
  background: #f5f5f5;
  color: #666;
}

.badge.multi-agent {
  background: #f3e5f5;
  color: #7b1fa2;
}

.badge.primary {
  background: #fff3e0;
  color: #f57c00;
}

.spawn-agent {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: #f8f9ff;
  border-radius: 8px;
}

.agents-section {
  margin-bottom: 2rem;
}

.agents-list {
  max-height: 400px;
  overflow-y: auto;
}

.agent-card {
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  margin-bottom: 0.75rem;
  background: #fafafa;
}

.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.agent-header code {
  font-size: 0.85rem;
  color: #555;
}

.agent-subtask {
  margin: 0.5rem 0;
  color: #555;
  font-size: 0.95rem;
  font-style: italic;
}

.agent-meta {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  font-size: 0.8rem;
  color: #888;
}

.status-section {
  margin-top: 2rem;
}

.status-content {
  margin-top: 1.5rem;
}

.overall-summary {
  padding: 1.5rem;
  background: #f0f7ff;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border-left: 4px solid #667eea;
}

.overall-summary h4 {
  margin: 0 0 0.75rem;
  color: #667eea;
}

.overall-summary p {
  margin: 0;
  line-height: 1.6;
}

.agent-summaries h4 {
  margin-bottom: 1rem;
  color: #667eea;
}

.agent-summary {
  padding: 1.5rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 1rem;
  background: #fafafa;
}

.agent-summary-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.agent-summary-header strong {
  font-family: monospace;
  font-size: 0.9rem;
  color: #333;
}

.agent-summary-subtask {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: #666;
  font-style: italic;
}

.agent-summary-text {
  margin: 0;
  color: #333;
  line-height: 1.6;
}

.error {
  color: #d32f2f;
  margin-top: 1rem;
  padding: 1rem;
  background: #ffebee;
  border-radius: 6px;
}
</style>
