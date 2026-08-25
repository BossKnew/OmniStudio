# OmniStudio v0.1.0

The first official release of **OmniStudio** — a self-hosted image and video generation workspace for teams.

### ✨ Features

* **Generation**: text-to-image, reference-image editing, masked inpainting, text-to-video, image-to-video
* **Providers**: OpenAI Images-compatible APIs; OpenAI Videos, Seedance (Volcengine Ark), and Wan (DashScope) video adapters. Gateways that speak the OpenAI Videos protocol can reuse that adapter.
* **Studio**: image/video mode switching, history, regenerate, retry, download, references, and mask drawing
* **Assets**: conversations, asset library, group-shared references, thumbnails, storage quotas
* **Administration**: user approval, user groups, model access control, per-group generation quotas (images counted in images, video in seconds)
* **Prompt polishing**: text-to-image, image-edit, and text-to-video, with multiple configurable providers
* **Security**: mandatory admin MFA, encrypted API keys and MFA secrets, SSRF protection, rate limiting, CSRF protection
* **UI**: Chinese and English

### 🛠 Technology Stack

* **Web:** React 19, Vite, TypeScript
* **API:** NestJS, Prisma
* **Database:** PostgreSQL
* **Cache / Queue:** Redis, BullMQ
* **Deployment:** Docker Compose, Nginx

### 🚀 Deployment

Deploy with Docker Compose. Recommended minimum:

* 2 CPU cores
* 4 GiB RAM
* Docker Engine
* Docker Compose v2.24+

```bash
cp .env.example .env
docker compose config --quiet
docker compose up -d --build
```

Open http://localhost:8080. The first login uses the bootstrap admin account from `.env`; you will be asked to change the password and set up MFA.

For production, use HTTPS (`APP_ORIGINS` set to the exact origin, `ALLOW_INSECURE_HTTP=false`), independent strong secrets, and back up PostgreSQL and the media volume regularly.

### 📝 Notes

This is the first official release of OmniStudio. Later versions will continue to improve model integrations, generation workflows, administration, and the deployment experience.
