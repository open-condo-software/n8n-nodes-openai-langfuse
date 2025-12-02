"use strict";
/**
 * Enhanced Langfuse CallbackHandler that fixes output capture for array-format responses
 *
 * Issue: The standard langfuse-langchain CallbackHandler doesn't properly capture:
 * 1. Output content when response.content is an array (OpenAI Responses API format)
 * 2. Output tokens from usage_metadata
 *
 * Solution: Extend CallbackHandler and manually update the generation after invoke
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEnhancedLangfuseCallback = createEnhancedLangfuseCallback;
var langfuse_langchain_1 = require("langfuse-langchain");
/**
 * Creates an enhanced callback handler and provides a method to manually fix output
 */
function createEnhancedLangfuseCallback(config, langfuseClient) {
    var _this = this;
    var handler = new langfuse_langchain_1.CallbackHandler({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        baseUrl: config.baseUrl,
        sessionId: config.sessionId,
        userId: config.userId,
        tags: config.tags,
        metadata: config.metadata,
    });
    /**
     * Manually update the generation with proper output capture
     */
    var fixOutput = function (response) { return __awaiter(_this, void 0, void 0, function () {
        var traceId, observationId, outputContent, usage, outputTokens, inputTokens, totalTokens;
        var _a;
        return __generator(this, function (_b) {
            traceId = handler.traceId;
            observationId = handler.topLevelObservationId;
            if (!traceId || !observationId) {
                console.warn('[EnhancedLangfuseCallback] No trace/observation ID found, skipping output fix');
                return [2 /*return*/];
            }
            if (Array.isArray(response.content)) {
                outputContent = response.content
                    .filter(function (item) { return item.type === 'text'; })
                    .map(function (item) { return item.text; })
                    .join('');
            }
            else if (typeof response.content === 'string') {
                outputContent = response.content;
            }
            usage = response.usage_metadata || ((_a = response.response_metadata) === null || _a === void 0 ? void 0 : _a.usage);
            outputTokens = (usage === null || usage === void 0 ? void 0 : usage.output_tokens) || (usage === null || usage === void 0 ? void 0 : usage.completion_tokens);
            inputTokens = (usage === null || usage === void 0 ? void 0 : usage.input_tokens) || (usage === null || usage === void 0 ? void 0 : usage.prompt_tokens);
            totalTokens = usage === null || usage === void 0 ? void 0 : usage.total_tokens;
            console.log('[EnhancedLangfuseCallback] Fixing output:', {
                traceId: traceId,
                observationId: observationId,
                hasOutput: !!outputContent,
                outputLength: (outputContent === null || outputContent === void 0 ? void 0 : outputContent.length) || 0,
                outputTokens: outputTokens,
                inputTokens: inputTokens,
                totalTokens: totalTokens,
            });
            // Update the generation using Langfuse client
            try {
                // Score the generation with the output data
                langfuseClient.generation({
                    id: observationId,
                    traceId: traceId,
                    output: outputContent,
                    usage: {
                        input: inputTokens,
                        output: outputTokens,
                        total: totalTokens,
                    },
                });
                console.log('[EnhancedLangfuseCallback] Output fixed successfully');
            }
            catch (error) {
                console.error('[EnhancedLangfuseCallback] Failed to fix output:', error);
            }
            return [2 /*return*/];
        });
    }); };
    return { handler: handler, fixOutput: fixOutput };
}
