const groups = {
  'agent-frameworks': {
    projectType: 'FRAMEWORK',
    repositories: `Significant-Gravitas/AutoGPT
langchain-ai/langchain
langchain-ai/langgraph
langflow-ai/langflow
langgenius/dify
geekan/MetaGPT
crewAIInc/crewAI
microsoft/autogen
lobehub/lobe-chat
FlowiseAI/Flowise
nocobase/nocobase`,
  },
  'coding-agents': {
    projectType: 'CODING_AGENT',
    repositories: `All-Hands-AI/OpenHands
princeton-nlp/SWE-agent
paul-gauthier/aider
cline/cline
opencode-ai/opencode
AntonOsika/gpt-engineer
RivaanRanawat/ai-coding-agent
xpander-ai/coding-agent`,
  },
  'computer-use': {
    projectType: 'COMPUTER_USE_AGENT',
    repositories: `browser-use/browser-use
simular-ai/Agent-S
bytedance/ui-tars
OpenCoworkAI/open-cowork
Orkas-AI/Orkas
openamer/openamer
OpenHands/open-operator
OSWorld-Env/OSWorld`,
  },
  'medical-healthcare': {
    projectType: 'DOMAIN_AGENT',
    repositories: `rbr7/ClinClaw
snap-stanford/biomni
2023Anita/clinical-ai-agent-skills
Romsha23/Healthcare-Ai-Agent
beerpalsinghyolo/Medical-AI-Agent-RAG
venkatesh-guttapally/healthcare-ai-agent`,
  },
  'finance-cyber': {
    projectType: 'DOMAIN_AGENT',
    repositories: `OpenBB-finance/OpenBB
aowang-ai/awesome-finance-agents
bemali/trading-agent
DaviddTech/ai-trading-agent
ericrlessa/threat-intelligence-agent`,
  },
  'robotics-gaming': {
    projectType: 'DOMAIN_AGENT',
    repositories: `jewel-nath/agentic-robotics
arpitg1304/robotics-agent-skills
adrianmarchramon/embodied-vln-agent
CraftJarvis/MineStudio
soy-tuber/minecraft-ai-wrapper
swallace100/thriller-game-ai-agent
bytewife/agentcraft
Jahrome907/minecraft-agent-skills`,
  },
  'memory-rag': {
    projectType: 'MEMORY_RAG',
    repositories: `mem0ai/mem0
letta-ai/letta
getzep/zep
rohanprichard/knowledge-graph-agent
infiniflow/ragflow`,
  },
  'agent-skills': {
    projectType: 'SKILL_LIBRARY',
    repositories: `primeradiant/superpowers
addyosmani/agent-skills
shubhamsaboo/awesome-llm-apps
x1xhlol/system-prompts-and-models-of-ai-tools`,
  },
  'interoperability-protocols': {
    projectType: 'PROTOCOL',
    repositories: `modelcontextprotocol/modelcontextprotocol
modelcontextprotocol/servers
a2aproject/A2A
belarusian/A2A-Guide
shoumikdc/arXiv-mcp`,
  },
  'security-benchmarks': {
    projectType: 'REFERENCE_COLLECTION',
    repositories: `ethz-spylab/agentdojo
natnew/Awesome-Agentic-AI-Security
ritikraj7/cpu-centric-agentic-ai
yzhao062/awesome-auditable-ai`,
  },
};

export const AGENT_MASTER_LIBRARY_CATEGORIES = Object.freeze(Object.keys(groups));

export const AGENT_MASTER_LIBRARY_SEEDS = Object.freeze(
  Object.entries(groups).flatMap(([category, group]) =>
    group.repositories.trim().split(/\\s+/).filter(Boolean).map(fullName => Object.freeze({
      fullName,
      category,
      projectType: group.projectType,
      status: 'PENDING_REVIEW',
      installable: false,
      source: 'USER_SUPPLIED_AGENT_MASTER_LIBRARY',
      clonePolicy: 'ON_DEMAND',
    })),
  ),
);
