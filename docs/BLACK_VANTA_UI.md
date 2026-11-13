# BLACK VANTA — User Interface

BLACK VANTA is the Arabic-first, mobile-ready user interface for ZForge.

## Visual contract
- Near-black background with restrained royal-gold accents.
- A thin animated and softly pulsing gold perimeter around the chat panel.
- White message text and a circular gold send control with a black upward arrow.
- Minimal composition; no decorative orbital graphics.
- RTL Arabic layout, responsive mobile sizing, keyboard-accessible form and reduced-motion support.

## Runtime truth
The Pages interface is a client-only control surface. When an optional self-hosted Task Gateway is connected, it uses that runtime. When disconnected, it offers an owner-authorized GitHub issue handoff to the ephemeral cloud worker described in CLOUD_EXECUTION.md. The issue must be reviewed and submitted by the user; task text is public. No GitHub token, model credential or privileged secret belongs in browser assets. Cloud results are posted to the issue and downloadable from the workflow run; the current handoff does not stream results directly into the page.

## Deployment
The GitHub Pages workflow deploys the repository root when changes reach main. Feature branches and pull requests do not replace the published site automatically.
