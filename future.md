# Future Features & Revisions

- **Enable PowerShell Auto-Tooling for Mini Commands:** We currently have a rule in `windows_agent.py` to stop the LLM from hallucinating PowerShell or CLI commands for missing actions in order to properly populate `missing_tools.json`. In the future, we should **undo this rule** and allow the LLM to creatively use `run_powershell` and `run_command` for mini-commands (e.g., turning off Wi-Fi, setting brightness, emptying recycle bin) that don't strictly require dedicated API tool implementations. 
  - *Note for implementation:* Add safeguards or handle confirmation prompts (`-Confirm:$false`) and timeout limits to prevent commands from hanging the agent.
