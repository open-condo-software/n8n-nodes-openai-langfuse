import Langfuse from 'langfuse';

interface LangfuseConfig {
	publicKey: string;
	secretKey: string;
	baseUrl: string;
}

class LangfuseClientManager {
	private static instance: LangfuseClientManager;
	private clients: Map<string, Langfuse> = new Map();

	private constructor() {}

	public static getInstance(): LangfuseClientManager {
		if (!LangfuseClientManager.instance) {
			LangfuseClientManager.instance = new LangfuseClientManager();
		}
		return LangfuseClientManager.instance;
	}

	public getClient(config: LangfuseConfig): Langfuse {
		const key = `${config.baseUrl}:${config.publicKey}`;
		
		if (!this.clients.has(key)) {
			const client = new Langfuse({
				publicKey: config.publicKey,
				secretKey: config.secretKey,
				baseUrl: config.baseUrl,
			});
			this.clients.set(key, client);
		}

		return this.clients.get(key)!;
	}

	public async flushAll(): Promise<void> {
		const flushPromises = Array.from(this.clients.values()).map(client => 
			client.flushAsync()
		);
		await Promise.all(flushPromises);
	}
}

export function getLangfuseClient(config: LangfuseConfig): Langfuse {
	return LangfuseClientManager.getInstance().getClient(config);
}

export async function flushAllLangfuseClients(): Promise<void> {
	return LangfuseClientManager.getInstance().flushAll();
}
