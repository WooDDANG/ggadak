# Decoupled Egress via HTTP Webhook and REST API

The Discord bot operates as an independent daemon and pushes structured Decision Payloads to an external Web Consumer endpoint via HTTP POST/Webhook, keeping the bot decoupled from any specific web UI implementation.
