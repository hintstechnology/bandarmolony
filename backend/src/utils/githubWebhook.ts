// githubWebhook.ts
// Utility for triggering GitHub Actions workflows via repository dispatch

/**
 * Trigger GitHub Actions workflow via repository dispatch
 * @param eventType Event type identifier
 * @param payload Payload data to send
 */
export async function triggerGitHubWorkflow(
  eventType: string,
  payload: Record<string, any>
): Promise<boolean> {
  try {
    const githubOwner = process.env['GH_OWNER'];
    const githubRepo = process.env['GH_REPO'];
    const githubToken = process.env['GH_WEBHOOK_TOKEN'];

    // Check if all required environment variables are set
    if (!githubOwner || !githubRepo || !githubToken) {
      console.warn('⚠️ GitHub webhook not configured. Missing environment variables:', {
        hasOwner: !!githubOwner,
        hasRepo: !!githubRepo,
        hasToken: !!githubToken
      });
      return false;
    }

    const url = `https://api.github.com/repos/${githubOwner}/${githubRepo}/dispatches`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: payload
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to trigger GitHub workflow:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return false;
    }

    console.log(`✅ GitHub workflow triggered: ${eventType}`, payload);
    return true;
  } catch (error) {
    console.error('❌ Error triggering GitHub workflow:', error);
    return false;
  }
}

