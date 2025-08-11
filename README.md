## Run locally with LM Studio (local LLMs)

1) Install LM Studio and start a local server
- Download LM Studio and open the app
- Go to “Server” and start the local OpenAI-compatible server
- Note the Base URL (typically `http://127.0.0.1:1234`)

2) Download models in LM Studio
- Search and download any chat-capable models, e.g. `llama-2-7b-chat`
- You can use any other model; the UI lists all available models from the server’s `/v1/models`
- Make sure to load two models into the server

3) Start this app
```bash
npm install
npm run dev
```
Open `http://localhost:3000`

4) In the app
- Enter your LM Studio Base URL in the top right input (e.g., `http://127.0.0.1:1234`), then click the refresh icon
- In each Bot card, pick a model (e.g., `llama-2-7b-chat` for Bot A and `llama-2-7b-chat:2` for Bot B)
- Choose a mode: Full-auto, Semi-auto, or Manual
- Click Start (or Step in Semi-auto) to generate turns; messages are stored in browser localStorage

Notes
- This app proxies requests via Next.js API routes to the LM Studio server
- Streaming is used when available; if not, it falls back to non-streaming
- No API keys are required for local LM Studio

---

TODO:
- [ ] Fix: inconsistencies with chats generating
- [ ] Feat: Implement actual chat serialization so chats are saved
- [ ] Fix: Make conversation delete button always visible (clip title)
- [ ] UX: Move individual settings (temperature, model, etc.) for each LLM into button togglable panels OR:
    - [ ] Move settings to the right maybe? Also could try compressing the chat while panels are open
- [ ] UX: Automatically select the first and second models on new chats using models endpoint
- [ ] UX: Add toasts for errors ('Failed to load models: {error_message}') and status ('loaded {#} models.')
- [ ] UI: Add dark mode

Extra Additions:
- [ ] UX: Resizable chat history panel
- [ ] UX: Hide chat history button

## About 

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Next.js Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
