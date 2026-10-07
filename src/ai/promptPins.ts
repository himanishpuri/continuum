export const PROMPT_PINS: Record<string, Record<string, string>> = {
  agent_decision: { "1": "718d259f1cb7d8098b1484daa52ee489de50ec33d50a8a6bfb0db2b4734bd8ab" },
};

export const isPinned = (name: string, hash: string) => Object.values(PROMPT_PINS[name] ?? {}).includes(hash);
