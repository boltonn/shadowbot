# Backend

## Local LLM

The agent can run against a locally-hosted model instead of a hosted provider, via an
OpenAI-compatible server. That server (vLLM, `Qwen2.5-32B-Instruct-AWQ`) lives outside
this repo at `~/models/vllm/` (venv, weights, and the actual script) — see
`~/models/vllm/README.md` for details. `make` here just wraps it for convenience:

```bash
make llm-up      # start
make llm-logs    # tail logs
make llm-status  # check it's up
make llm-down    # stop
```

Once it's running, point the agent at it by setting in `.env`:

```bash
LLM__PROVIDER=openai_compatible
LLM__MODEL=Qwen/Qwen2.5-32B-Instruct-AWQ
LLM__API_KEY=<same value as ~/models/vllm/.env's VLLM_API_KEY>
LLM__BASE_URL=http://localhost:8001/v1
```
