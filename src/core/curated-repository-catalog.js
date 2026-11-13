const groups = {
  'learning-reference': `codecrafters-io/build-your-own-x
donnemartin/system-design-primer
jwasham/coding-interview-university
kamranahmedse/developer-roadmap
public-apis/public-apis
sindresorhus/awesome
ripienaar/free-for-dev
EbookFoundation/free-programming-books
TheAlgorithms/Python
trekhleb/javascript-algorithms
labuladong/fucking-algorithm
freeCodeCamp/freeCodeCamp`,
  'core-platforms-languages': `torvalds/linux
tensorflow/tensorflow
facebook/react
flutter/flutter
huggingface/transformers
pytorch/pytorch
microsoft/TypeScript
rust-lang/rust
golang/go
vercel/next.js
nestjs/nest
android/architecture-components
skydoves/android-developer-roadmap
Genymobile/scrcpy
google/benchmark
ninja-build/ninja`,
  'local-ai-model-runtime': `ollama/ollama
ggerganov/llama.cpp
deepseek-ai/DeepSeek-V3
deepseek-ai/DeepSeek-R1
Tencent-Hunyuan/HunyuanVideo
Wan-Video/Wan2.2
zai-org/CogVideo`,
  'agent-frameworks-skills': `open-webui/open-webui
langchain-ai/langchain
langgenius/dify
Significant-Gravitas/AutoGPT
obra/superpowers
DietrichGebert/ponytail
JuliusBrussee/caveman
easyclaw-ai/easy_claw
joaomdmoura/crewAI
FlowiseAI/Flowise
browser-use/browser-use
browser-use/web-ui
browser-use/browser-harness
browser-use/browsercode
Haden-Min/haden-browser
browser-use/jev-ultrafast`,
  'image-generation-and-creative-ai': `AUTOMATIC1111/stable-diffusion-webui
comfyanonymous/ComfyUI
Comfy-Org/ComfyUI
Comfy-Org/ComfyUI-Manager
LykosAI/StabilityMatrix
AbdullahAlfaraj/Auto-Photoshop-StableDiffusion-Plugin
hacksider/Deep-Live-Cam
OpenMontageInc/OpenMontage
Vincentwei1021/video-shotcraft
nexu-io/openmotion
HKUDS/ViMax
mutonby/openshorts
krillinai/OpenCreator
HBAI-Ltd/Toonflow-app
duixcom/Duix-Avatar`,
  'video-and-media-processing': `liqvidjs/liqvid
bbc/VideoContext
m90/seeThru
videojs/video.js
clappr/clappr
fluid-player/fluid-player
openplayerjs/openplayerjs
OvenMediaLabs/OvenPlayer
OskarCosimo/myetv-video-player-opensource
jgm/pandoc`,
  'graphics-3d-webxr': `mrdoob/three.js
BabylonJS/Babylon.js
jeromeetienne/threex.videotexture
snapp-development/three-video-player
tsengyushiang/WebGL-Chroma-Keying
vpalmisano/virtual-background
cpppppp7/video2threejs
enable3d/three-to-movie
aframevr/aframe
pmndrs/react-three-fiber
immersive-web/webxr`,
  'cloud-infrastructure-devops': `kubernetes/kubernetes
localstack/localstack
mzazon/cloud-projects
iovisor/bcc
ClickHouse/ClickHouse
duckdb/duckdb
prometheus/prometheus
vitessio/vitess
supabase/supabase
redis/redis
pgadmin-org/pgadmin4
vrana/adminer
superfly/litefs
jenkinsci/jenkins
argoproj/argo-cd
tektoncd/pipeline
gitlabhq/gitlab
ansible/ansible
opentofu/opentofu
moby/moby
aquasecurity/trivy
techiescamp/devops-projects
signoz/signoz
openobserve/openobserve
apache/skywalking
grafana/grafana
jaegertracing/jaeger
coroot/coroot
pocketbase/pocketbase`,
  'network-security-observability': `kyanos-family/kyanos
domcyrus/rustnet
Waujito/dpit
bpftrace/bpftrace
ebpf-networking/ebpf-performance
cilium/cilium
inspektor-gadget/inspektor-gadget
pixie-io/pixie
wazuh/wazuh
zeek/zeek`,
};

export const CURATED_REPOSITORY_SEEDS = Object.freeze(
  Object.entries(groups).flatMap(([category, list]) =>
    list.trim().split(/\\s+/).filter(Boolean).map(fullName => Object.freeze({
      fullName,
      category,
      status: 'PENDING_REVIEW',
      installable: false,
      source: 'USER_SUPPLIED_CURATED_LIST',
    })),
  ),
);

export const UNRESOLVED_REPOSITORY_REFERENCES = Object.freeze([
  'rea',
  'Matt Pocock / Skills for Real Engineers',
  'Affaan / ECC',
  'claude-mem',
  'Addy Osmani / agent-skills',
  'gemini-cli',
]);
