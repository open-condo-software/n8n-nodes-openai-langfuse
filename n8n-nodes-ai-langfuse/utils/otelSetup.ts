import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let otelInstance: NodeSDK | null = null;
let isInitialized = false;

export function initializeOtel(serviceName: string = 'n8n-langfuse'): void {
	if (isInitialized) {
		return;
	}

	try {
		otelInstance = new NodeSDK({
			resource: new Resource({
				[SEMRESATTRS_SERVICE_NAME]: serviceName,
			}),
			instrumentations: [getNodeAutoInstrumentations()],
		});

		otelInstance.start();
		isInitialized = true;
		
		process.on('SIGTERM', async () => {
			await shutdownOtel();
		});
	} catch (error) {
		console.error('Failed to initialize OpenTelemetry:', error);
	}
}

export async function shutdownOtel(): Promise<void> {
	if (otelInstance && isInitialized) {
		try {
			await otelInstance.shutdown();
			isInitialized = false;
			otelInstance = null;
		} catch (error) {
			console.error('Error shutting down OpenTelemetry:', error);
		}
	}
}

export function isOtelInitialized(): boolean {
	return isInitialized;
}
