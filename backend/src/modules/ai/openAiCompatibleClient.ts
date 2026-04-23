import { AiRuntimeConfig } from "../../config/runtime";

export interface OpenAiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callOpenAiCompatibleChat(
  config: AiRuntimeConfig,
  input: {
    model: string;
    messages: OpenAiChatMessage[];
    temperature?: number;
    maxTokens?: number;
  },
): Promise<{
  content: string;
  promptTokens: number;
  completionTokens: number;
}> {
  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const response = await fetch(`${config.openAiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `OPENAI_CHAT_HTTP_${response.status}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OPENAI_CHAT_EMPTY_RESPONSE");
  }

  return {
    content,
    promptTokens: data.usage?.prompt_tokens || estimateTokensFromMessages(input.messages),
    completionTokens: data.usage?.completion_tokens || estimateTokens(content),
  };
}

export async function callOpenAiCompatibleImageGeneration(
  config: AiRuntimeConfig,
  input: {
    model: string;
    prompt: string;
    size?: string;
    n?: number;
  },
): Promise<{
  images: Array<{ url: string }>;
  promptTokens: number;
}> {
  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const response = await fetch(`${config.openAiBaseUrl.replace(/\/$/, "")}/images/generations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      size: input.size || "1024x1024",
      n: Math.max(1, Math.min(4, input.n || 1)),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `OPENAI_IMAGE_HTTP_${response.status}`);
  }

  const images = Array.isArray(data.data)
    ? data.data
        .map((item: { url?: string; b64_json?: string }) => {
          if (typeof item.url === "string" && item.url) {
            return { url: item.url };
          }
          if (typeof item.b64_json === "string" && item.b64_json) {
            return { url: `data:image/png;base64,${item.b64_json}` };
          }
          return null;
        })
        .filter((item): item is { url: string } => Boolean(item))
    : [];

  if (images.length === 0) {
    throw new Error("OPENAI_IMAGE_EMPTY_RESPONSE");
  }

  return {
    images,
    promptTokens: estimateTokens(input.prompt),
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateTokensFromMessages(messages: OpenAiChatMessage[]): number {
  return estimateTokens(messages.map((message) => message.content).join("\n"));
}
