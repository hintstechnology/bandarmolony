// githubWebhook.ts
// Utility for triggering GitHub Actions workflows via repository dispatch

/**
 * Trigger GitHub Actions workflow via repository dispatch with retry mechanism
 * @param eventType Event type identifier
 * @param payload Payload data to send
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @param retryDelay Initial retry delay in milliseconds (default: 1000, exponential backoff)
 */
export async function triggerGitHubWorkflow(
  eventType: string,
  payload: Record<string, any>,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<boolean> {
  const githubOwner = process.env['GH_OWNER'];
  const githubRepo = process.env['GH_REPO'];
  const githubToken = process.env['GH_WEBHOOK_TOKEN'];

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
  const requestBody = {
    event_type: eventType,
    client_payload: payload
  };

  // Retry mechanism with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        const delay = retryDelay * Math.pow(2, attempt - 2); // Exponential backoff: 1s, 2s, 4s
        console.log(`🔄 Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      console.log(`🔔 Attempting to trigger GitHub workflow (attempt ${attempt}/${maxRetries}):`, {
        eventType,
        owner: githubOwner,
        repo: githubRepo,
        hasToken: !!githubToken
      });

      console.log(`📡 Calling GitHub API: ${url}`);
      console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'bandarmolony-backend',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();

      if (response.ok) {
        console.log(`✅ GitHub workflow triggered successfully: ${eventType} (attempt ${attempt})`, {
          payload,
          responseStatus: response.status
        });
        return true;
      }

      // If not last attempt, log and retry
      if (attempt < maxRetries) {
        console.warn(`⚠️ Failed to trigger GitHub workflow (attempt ${attempt}/${maxRetries}):`, {
          status: response.status,
          statusText: response.statusText,
          error: responseText.substring(0, 200) // Limit error message length
        });
      } else {
        // Last attempt failed
        console.error('❌ Failed to trigger GitHub workflow after all retries:', {
          status: response.status,
          statusText: response.statusText,
          error: responseText,
          url: url,
          attempts: maxRetries
        });
        return false;
      }
    } catch (error) {
      // If not last attempt, log and retry
      if (attempt < maxRetries) {
        console.warn(`⚠️ Error triggering GitHub workflow (attempt ${attempt}/${maxRetries}):`, {
          error: error instanceof Error ? error.message : String(error)
        });
      } else {
        // Last attempt failed
        console.error('❌ Error triggering GitHub workflow after all retries:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          attempts: maxRetries
        });
        return false;
      }
    }
  }

  return false;
}

