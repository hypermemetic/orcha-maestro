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
              <input type="checkbox" v-model="newSession.multiAgent" />
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
            <div v-for="session in sessions" :key="session.sessionId"
                 class="session-card"
                 :class="{ selected: selectedSession?.sessionId === session.sessionId }"
                 @click="selectSession(session)">
              <div class="session-header">
                <code>{{ session.sessionId.substring(0, 12) }}...</code>
                <span class="badge" :class="getStateClass(session.state)">
                  {{ getStateName(session.state) }}
                </span>
              </div>
              <div class="session-meta">
                <span>{{ session.model }}</span>
                <span v-if="session.agentMode === 'Multi'" class="badge multi-agent">Multi-Agent</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Selected Session Details -->
        <section v-if="selectedSession" class="card session-details full-width">
          <h2>🎯 Session: {{ selectedSession.sessionId.substring(0, 20) }}...</h2>

          <!-- Spawn Agent (Multi-Agent Mode) -->
          <div v-if="selectedSession.agentMode === 'Multi'" class="spawn-agent">
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
          <div v-if="selectedSession.agentMode === 'Multi'" class="agents-section">
            <div class="section-header">
              <h3>🤖 Agents ({{ agents.length }})</h3>
              <button @click="loadAgents" class="btn-secondary">🔄</button>
            </div>

            <div v-if="agents.length === 0" class="empty-state">
              No agents yet. Spawn one above!
            </div>

            <div v-else class="agents-list">
              <div v-for="agent in agents" :key="agent.agentId" class="agent-card">
                <div class="agent-header">
                  <code>{{ agent.agentId.substring(0, 16) }}...</code>
                  <span class="badge" :class="getAgentStateClass(agent.state)">
                    {{ getAgentStateName(agent.state) }}
                  </span>
                </div>
                <p class="agent-subtask">"{{ agent.subtask }}"</p>
                <div class="agent-meta">
                  <span v-if="agent.isPrimary" class="badge primary">Primary</span>
                  <span class="timestamp">{{ formatDate(agent.createdAt) }}</span>
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

              <div v-if="statusSummary.agentSummaries && statusSummary.agentSummaries.length > 0" class="agent-summaries">
                <h4>Agent Progress</h4>
                <div v-for="agentSummary in statusSummary.agentSummaries"
                     :key="agentSummary.agentId"
                     class="agent-summary">
                  <div class="agent-summary-header">
                    <div>
                      <strong>{{ agentSummary.agentId.substring(0, 16) }}...</strong>
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
import { createOrchaClient, type OrchaSession, type AgentInfo, type AgentSummary } from './lib/orchaClient'

const client = ref<Awaited<ReturnType<typeof createOrchaClient>> | null>(null)
const isConnected = ref(false)
const error = ref('')
const sessions = ref<OrchaSession[]>([])
const selectedSession = ref<OrchaSession | null>(null)
const agents = ref<AgentInfo[]>([])
const statusSummary = ref<{ summary: string; agentSummaries?: AgentSummary[] } | null>(null)

const newSession = ref({
  model: 'sonnet',
  maxRetries: 3,
  multiAgent: true,
})

const newAgent = ref({
  subtask: '',
})

const creatingSession = ref(false)
const spawningAgent = ref(false)
const checkingStatus = ref(false)

async function connect() {
  try {
    error.value = ''
    client.value = await createOrchaClient()
    isConnected.value = true
    await loadSessions()
  } catch (e: any) {
    error.value = e.message || 'Failed to connect'
    console.error('Connection error:', e)
  }
}

async function createSession() {
  if (!client.value) return

  try {
    creatingSession.value = true

    // Consume async generator
    for await (const result of client.value.orcha.createSession({
      model: newSession.value.model,
      workingDirectory: '/workspace',
      maxRetries: newSession.value.maxRetries,
      multiAgent: newSession.value.multiAgent,
    })) {
      if ('Ok' in result) {
        console.log('Session created:', result.Ok.sessionId)
        break
      } else if ('Err' in result) {
        throw new Error(result.Err.message)
      }
    }

    await loadSessions()
  } catch (e: any) {
    error.value = e.message || 'Failed to create session'
    console.error('Create session error:', e)
  } finally {
    creatingSession.value = false
  }
}

async function loadSessions() {
  if (!client.value) return

  try {
    const result = await client.value.orcha.listSessions()
    if ('Ok' in result) {
      sessions.value = result.Ok.sessions
    }
  } catch (e: any) {
    console.error('Load sessions error:', e)
  }
}

async function selectSession(session: OrchaSession) {
  selectedSession.value = session
  statusSummary.value = null

  if (session.agentMode === 'Multi') {
    await loadAgents()
  }
}

async function spawnAgent() {
  if (!client.value || !selectedSession.value || !newAgent.value.subtask) return

  try {
    spawningAgent.value = true

    for await (const result of client.value.orcha.spawnAgent({
      sessionId: selectedSession.value.sessionId,
      subtask: newAgent.value.subtask,
      parentAgentId: null,
    })) {
      if ('Ok' in result) {
        console.log('Agent spawned:', result.Ok.agentId)
        newAgent.value.subtask = ''
        break
      } else if ('Err' in result) {
        throw new Error(result.Err.message)
      }
    }

    await loadAgents()
  } catch (e: any) {
    error.value = e.message || 'Failed to spawn agent'
    console.error('Spawn agent error:', e)
  } finally {
    spawningAgent.value = false
  }
}

async function loadAgents() {
  if (!client.value || !selectedSession.value) return

  try {
    for await (const result of client.value.orcha.listAgents({
      sessionId: selectedSession.value.sessionId,
    })) {
      if ('Ok' in result) {
        agents.value = result.Ok.agents
        break
      }
    }
  } catch (e: any) {
    console.error('Load agents error:', e)
  }
}

async function checkStatus() {
  if (!client.value || !selectedSession.value) return

  try {
    checkingStatus.value = true

    for await (const result of client.value.orcha.checkStatus({
      sessionId: selectedSession.value.sessionId,
    })) {
      if ('Ok' in result) {
        statusSummary.value = {
          summary: result.Ok.summary,
          agentSummaries: result.Ok.agentSummaries,
        }
        break
      } else if ('Err' in result) {
        throw new Error(result.Err.message)
      }
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to check status'
    console.error('Check status error:', e)
  } finally {
    checkingStatus.value = false
  }
}

function getStateClass(state: any): string {
  const stateType = typeof state === 'string' ? state : state.type || state.state
  switch (stateType) {
    case 'Running':
    case 'running':
    case 'Complete':
    case 'complete':
      return 'state-running'
    case 'Failed':
    case 'failed':
      return 'state-failed'
    default:
      return 'state-idle'
  }
}

function getStateName(state: any): string {
  if (typeof state === 'string') return state
  return state.type || state.state || 'Unknown'
}

function getAgentStateClass(state: any): string {
  const stateType = typeof state === 'string' ? state : state.state
  switch (stateType) {
    case 'running':
    case 'complete':
      return 'state-running'
    case 'failed':
      return 'state-failed'
    default:
      return 'state-idle'
  }
}

function getAgentStateName(state: any): string {
  if (typeof state === 'string') return state
  return state.state || 'Unknown'
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

onMounted(() => {
  connect()

  const interval = setInterval(() => {
    if (isConnected.value) {
      loadSessions()
      if (selectedSession.value?.agentMode === 'Multi') {
        loadAgents()
      }
    }
  }, 5000)

  onUnmounted(() => {
    clearInterval(interval)
    client.value?.disconnect()
  })
})
</script>

<style scoped>
/* Keep all the existing styles from the original App.vue */
.orcha-maestro {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.header {
  text-align: center;
  color: white;
  margin-bottom: 2rem;
}

.header h1 {
  margin: 0;
  font-size: 3rem;
}

.subtitle {
  margin: 0.5rem 0 0;
  opacity: 0.9;
}

.connection-status {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2rem;
  font-size: 0.9rem;
}

.connection-status.connected {
  background: rgba(76, 217, 100, 0.3);
}

.main {
  max-width: 1400px;
  margin: 0 auto;
}

.connect-card {
  background: white;
  padding: 3rem;
  border-radius: 1rem;
  text-align: center;
  max-width: 500px;
  margin: 0 auto;
}

.dashboard {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.card {
  background: white;
  padding: 1.5rem;
  border-radius: 1rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.card.full-width {
  grid-column: 1 / -1;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
}

.form-group.checkbox {
  display: flex;
  align-items: center;
}

.form-group.checkbox label {
  margin: 0;
  margin-left: 0.5rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f0f0f0;
  padding: 0.5rem 0.75rem;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

.session-card,
.agent-card {
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.session-card:hover,
.agent-card:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
}

.session-card.selected {
  background: #f0f4ff;
  border-color: #667eea;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.85rem;
  font-weight: 500;
}

.badge.state-running {
  background: #d4edda;
  color: #155724;
}

.badge.state-failed {
  background: #f8d7da;
  color: #721c24;
}

.badge.state-idle {
  background: #fff3cd;
  color: #856404;
}

.badge.multi-agent {
  background: #d1ecf1;
  color: #0c5460;
  margin-left: 0.5rem;
}

.badge.primary {
  background: #cfe2ff;
  color: #084298;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-style: italic;
}

.error {
  color: #dc3545;
  margin-top: 1rem;
}

.agent-summary {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
}

.agent-summary-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 0.5rem;
}

.agent-summary-subtask {
  font-size: 0.9rem;
  color: #666;
  margin: 0.25rem 0 0;
}

.agent-summary-text {
  margin: 0;
  line-height: 1.5;
}

.overall-summary {
  background: #e7f3ff;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}

.overall-summary h4 {
  margin-top: 0;
}
</style>
