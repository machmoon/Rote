---
title: hf search API (huggingface.co)
type: learned-api
tags: [learned-api, search, hf]
site: https://huggingface.co/
method: GET
learned: 2026-09-27 14:50
driver: claude
---

# hf search API (huggingface.co)

Hugging Face – The AI community building the future. — We’re on a journey to advance and democratize artificial intelligence through open source and open science.

Search huggingface.co by keyword without a browser. Learned by a Claude Code agent in one run (82 s, 39 requests); a call takes about a second. Replay verified 2026-09-27 14:54: a different query returns different results. Status: custos: 4/27 of the agent's claims confirmed against the recording.

## Call

```sh
pilot call hf "<query>"
```

Underlying request: `GET https://huggingface.co/api/quicksearch` with the query templated as `{query}`.

## Example response

`pilot call hf "qwen"` returned:

- r0b0tlab/qwen3.8-max-glm5.2-kimi-k3-distillation
- faunix/Qwen3.8-27B-Distillation-40K
- ukisai/Qwen3.8-27B-multi-turn-agent-sft
- Qwen/Qwen-Image-2.1
- Qwen/Qwen3.8-27B
