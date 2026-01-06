export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface FunctionResponse {
  name: string;
  response: {
    content: unknown;
  };
}

export interface GeminiPart {
  text?: string;
  functionCall?: FunctionCall;
}

export interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
  };
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

export interface GeminiFunctionResponse {
  functionResponse: FunctionResponse;
}

