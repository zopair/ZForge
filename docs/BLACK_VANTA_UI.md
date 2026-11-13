# BLACK VANTA — User Interface

BLACK VANTA is the Arabic-first, mobile-ready user interface for ZForge.

## Visual contract
- Near-black background with restrained royal-gold accents.
- A thin animated and softly pulsing gold perimeter around the chat panel.
- White message text and a circular gold send control with a black upward arrow.
- Minimal composition; no decorative orbital graphics.
- RTL Arabic layout, responsive mobile sizing, keyboard-accessible form and reduced-motion support.

## Runtime truth
The current Pages interface is an interactive local preview. It accepts text and renders local messages, but it does not claim to invoke an AI model or execute tasks. A real assistant requires a self-hosted Task Gateway, model runtime, authenticated session handling, event streaming and execution workers. No secrets belong in browser assets.

## Deployment
The GitHub Pages workflow deploys the repository root when changes reach main. Feature branches and pull requests do not replace the published site automatically.
