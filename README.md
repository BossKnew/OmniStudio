# 🎨 OmniStudio

English | [简体中文](README_zh.md)

OmniStudio is a self-hosted image and video generation workspace for teams: text-to-image, full-image editing, masked inpainting, text-to-video, image-to-video, and first-and-last-frame video, with a built-in asset library, quota management, user groups, work teams, and model access control.

## ✨ Features

- **Generation**: text-to-image, reference-image editing, masked inpainting, text-to-video, image-to-video, first-and-last-frame video
- **Providers**: credentials and a Base URL only. Each model picks a media type and adapter — OpenAI Images, Qwen/Wan, Nano Banana, Seedream, Midjourney, Flux, or Runway for images; Sora, Seedance, Wan/HappyHorse, Veo, MiniMax, Runway, or Flux for video. Gateways speaking the OpenAI Videos protocol can reuse that adapter. One Google AI Studio key can host both Nano Banana and Veo; one Volcengine Ark key can host Seedream and Seedance; one BFL key can host Flux image and video; one Runway key can host Runway image and video. Midjourney uses a midjourney-proxy-compatible gateway (there is no official Midjourney API).
- **Studio**: image/video mode switching, history, regenerate, retry, download, references, first/last frames, and mask drawing
- **Assets**: conversations, asset library (filter by type, source, model, date, and notes/prompts), work-team-shared references, thumbnails, storage quotas
- **Administration**: user approval, user groups for model access, work teams for asset sharing, per-group points-based generation quotas (model price × count / seconds, shared by images and video)
- **Prompt polishing**: text-to-image, image-edit, and text-to-video, with multiple configurable providers
- **Security**: mandatory admin MFA, encrypted API keys and MFA secrets, SSRF protection, rate limiting, CSRF protection
- **UI**: English and Chinese

## 🧰 Technology Stack

Web (React 19, Vite, TypeScript) · API (NestJS, Prisma, PostgreSQL, Redis, BullMQ) · Deployment (Docker Compose, Nginx)

## ⚡ Quick Start

Requirements: Docker Engine and Compose v2.24+, OpenSSL; at least 2 CPUs / 4 GiB of memory recommended.

```bash
cp .env.example .env    # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` and replace every `change-me` value; generate each secret independently:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

Start:

```bash
docker compose config --quiet
docker compose up -d --build
```

Open <http://localhost:8080>. The first login uses the bootstrap admin account from `.env`; you will be asked to change the password and set up MFA.

## 🚢 Production Deployment

- Use HTTPS: set `APP_ORIGINS` to the exact origin and `ALLOW_INSECURE_HTTP=false`
- Use separate, strong database, Redis, encryption, and admin passwords
- Back up PostgreSQL data and the media volume regularly
- Optional overlays: Traefik (`compose.traefik.yml`), external database/Redis (`compose.external.yml`), Compose secrets (`compose.secrets.yml`)
- Reverse proxy examples in the [`deploy`](deploy) directory

## 🛠️ Local Development

Requirements: Node.js 24, npm 11, PostgreSQL, Redis, and `ffmpeg`.

```bash
npm ci
npm run db:generate
npm run dev
```

Dev servers: Web <http://localhost:5173>, API <http://localhost:4000> (Vite proxies `/api` to the local API).

## 🔒 Security

Never commit `.env`, secrets, database backups, or media files (ignored by default). Report vulnerabilities privately per [`SECURITY.md`](SECURITY.md).

## 📄 License

[MIT License](LICENSE)
