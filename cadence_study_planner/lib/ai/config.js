/**
 * Configuration for AI provider settings. This file reads the AI provider and API keys from environment variables, 
 * allowing for easy switching between different AI providers without changing the codebase.
 */
export const AI_PROVIDER = process.env.AI_PROVIDER || "groq";