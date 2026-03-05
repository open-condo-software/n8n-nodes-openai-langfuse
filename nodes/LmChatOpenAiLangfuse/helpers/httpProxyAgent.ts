import proxyFromEnv from 'proxy-from-env';
import { Agent, ProxyAgent } from 'undici';

export interface AgentTimeoutOptions {
    headersTimeout?: number;
    bodyTimeout?: number;
    connectTimeout?: number;
}

const DEFAULT_TIMEOUT = parseInt(process.env.N8N_AI_TIMEOUT_MAX ?? '3600000', 10);

/**
 * Returns an Agent (no proxy with timeout options) or ProxyAgent (with proxy) configured with timeouts,
 * or undefined if no proxy is configured and no timeout options are provided.
 */
function getProxyAgent(targetUrl?: string, timeoutOptions?: AgentTimeoutOptions) {
    const proxyUrl = proxyFromEnv.getProxyForUrl(targetUrl ?? 'https://example.nonexistent/');

    const agentOptions = {
        headersTimeout: timeoutOptions?.headersTimeout ?? DEFAULT_TIMEOUT,
        bodyTimeout: timeoutOptions?.bodyTimeout ?? DEFAULT_TIMEOUT,
        ...(timeoutOptions?.connectTimeout !== undefined && {
            connectTimeout: timeoutOptions.connectTimeout,
        }),
    };

    if (!proxyUrl) {
        if (timeoutOptions) {
            return new Agent(agentOptions);
        }
        return undefined;
    }

    return new ProxyAgent({ uri: proxyUrl, ...agentOptions });
}

export default getProxyAgent
