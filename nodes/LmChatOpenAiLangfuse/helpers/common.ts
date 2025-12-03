import type { ChatOpenAIToolType } from '@langchain/openai/dist/utils/tools';
import get from 'lodash/get';
import isObject from 'lodash/isObject';
import { isObjectEmpty, jsonParse } from 'n8n-workflow';
import type { IDataObject } from 'n8n-workflow';

const removeEmptyProperties = <T>(rest: Record<string, any>): T => {
	return Object.keys(rest)
		.filter(
			(k) =>
				rest[k] !== '' && rest[k] !== undefined && !(isObject(rest[k]) && isObjectEmpty(rest[k])),
		)
		.reduce((a, k) => ({ ...a, [k]: rest[k] }), {}) as unknown as T;
};

const toArray = (str: string): string[] =>
	str
		.split(',')
		.map((e) => e.trim())
		.filter(Boolean);

export const formatBuiltInTools = (builtInTools: IDataObject): ChatOpenAIToolType[] => {
	const tools: ChatOpenAIToolType[] = [];
	if (builtInTools) {
		const webSearchOptions = get(builtInTools, 'webSearch');
		if (webSearchOptions) {
			let allowedDomains: string[] | undefined;
			const allowedDomainsRaw = get(webSearchOptions, 'allowedDomains', '');
			if (allowedDomainsRaw) {
				allowedDomains = toArray(allowedDomainsRaw as string);
			}

			let userLocation: any | undefined;
			if (
				(webSearchOptions as any).country ||
				(webSearchOptions as any).city ||
				(webSearchOptions as any).region
			) {
				userLocation = {
					type: 'approximate',
					country: (webSearchOptions as any).country as string,
					city: (webSearchOptions as any).city as string,
					region: (webSearchOptions as any).region as string,
				};
			}

			tools.push({
				type: 'web_search',
				search_context_size: get(webSearchOptions, 'searchContextSize', 'medium') as any,
				user_location: userLocation,
				...(allowedDomains && { filters: { allowed_domains: allowedDomains } }),
			} as ChatOpenAIToolType);
		}

		if ((builtInTools as any).codeInterpreter) {
			tools.push({
				type: 'code_interpreter',
				container: {
					type: 'auto',
				},
			} as ChatOpenAIToolType);
		}

		if (builtInTools.fileSearch) {
			const vectorStoreIds = get(builtInTools.fileSearch, 'vectorStoreIds', '[]');
			const filters = get(builtInTools.fileSearch, 'filters', '{}');
			tools.push({
				type: 'file_search',
				vector_store_ids: jsonParse(vectorStoreIds as string, {
					errorMessage: 'Failed to parse vector store IDs',
				}),
				filters: filters
					? jsonParse(filters as string, { errorMessage: 'Failed to parse filters' })
					: undefined,
				max_num_results: get(builtInTools.fileSearch, 'maxResults') as number,
			} as ChatOpenAIToolType);
		}
	}
	return tools;
};

export const prepareAdditionalResponsesParams = (options: IDataObject): Record<string, unknown> => {
	const body: Record<string, unknown> = {
		prompt_cache_key: options.promptCacheKey,
		safety_identifier: options.safetyIdentifier,
		service_tier: options.serviceTier,
		top_logprobs: options.topLogprobs,
	};

	if (options.conversationId) {
		body.conversation = options.conversationId;
	}

	if (options.metadata) {
		body.metadata = jsonParse(options.metadata as string, {
			errorMessage: 'Failed to parse metadata',
		});
	}

	if (options.reasoningEffort) {
		body.reasoning = {
			effort: options.reasoningEffort,
		};
	}

	return body;
};
