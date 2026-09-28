# Non-Blocking Global Interaction Handling with Immediate Deferral

To eliminate Discord's 3-second "Interaction failed / Application did not respond" errors and prevent consecutive reaction events from hanging, we replace inline component collectors with a global `client.on('interactionCreate')` dispatcher. When a button is clicked, the bot immediately invokes `interaction.deferUpdate()`, resolves the conflict via the backend API asynchronously, and updates the prompt message with final confirmation embeds.
