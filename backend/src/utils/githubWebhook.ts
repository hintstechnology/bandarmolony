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

    console.log('🔔 Attempting to trigger GitHub workflow:', {
      eventType,
      owner: githubOwner,
      repo: githubRepo,
      hasToken: !!githubToken
    });

    // Check if all required environment variables are set
    if (!githubOwner || !githubRepo || !githubToken) {
      console.error('❌ GitHub webhook not configured. Missing environment variables:', {
        hasOwner: !!githubOwner,
        hasRepo: !!githubRepo,
        hasToken: !!githubToken,
        owner: githubOwner || 'NOT SET',
        repo: githubRepo || 'NOT SET'
      });
      return false;
    }

    const url = `https://api.github.com/repos/${githubOwner}/${githubRepo}/dispatches`;

    console.log(`📡 Calling GitHub API: ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'bandarmolony-backend'
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: payload
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('❌ Failed to trigger GitHub workflow:', {
        status: response.status,
        statusText: response.statusText,
        error: responseText,
        url: url
      });
      return false;
    }

    console.log(`✅ GitHub workflow triggered successfully: ${eventType}`, {
      payload,
      responseStatus: response.status
    });
    return true;
  } catch (error) {
    console.error('❌ Error triggering GitHub workflow:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

