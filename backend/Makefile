.PHONY: llm-up llm-down llm-logs llm-status

# Thin wrapper: the actual server (venv, weights, script) lives outside this repo at
# ~/models/vllm — see backend/README.md and ~/models/vllm/README.md for why.
LLM_DIR := $(HOME)/models/vllm

llm-up:
	$(LLM_DIR)/llm-server.sh up

llm-down:
	$(LLM_DIR)/llm-server.sh down

llm-logs:
	$(LLM_DIR)/llm-server.sh logs

llm-status:
	$(LLM_DIR)/llm-server.sh status
