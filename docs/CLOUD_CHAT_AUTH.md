# BLACK VANTA direct cloud chat

BLACK VANTA creates and tracks cloud conversation issues automatically. The browser must be authorized to create issues in the public zopair/ZForge repository.

## One-time setup

1. Sign in to GitHub as zopair.
2. Open Settings → Developer settings → Personal access tokens → Fine-grained tokens.
3. Generate a token with resource owner zopair.
4. Under repository access, select Only select repositories → ZForge.
5. Grant only Repository permissions → Issues: Read and write. Metadata read access is automatic.
6. Copy the token and return to BLACK VANTA.
7. Open the GitHub connection settings, paste the token, and choose the verification button.

The token is held only in the active page's JavaScript memory. It is not written to localStorage, sessionStorage, cookies, the issue body, or the repository. Reloading the page or choosing disconnect clears it; reconnect by pasting it again. Revoke the token from GitHub settings whenever desired.

## Message flow

1. BLACK VANTA validates the token and confirms the authenticated account is the repository owner.
2. Each submitted message creates one issue with a unique correlation marker.
3. The repository's ZForge Cloud Execution workflow processes the issue on an ephemeral GitHub Actions runner.
4. BLACK VANTA polls that exact issue's comments and displays only the comment carrying the matching correlation marker.
5. The browser waits up to 49 minutes, below the workflow's 50-minute job timeout.

The issue and its response are public because the repository is public. Never send passwords, API keys, private customer data, or other secrets through this channel. The token is sent only in the HTTPS Authorization header to GitHub's API.
