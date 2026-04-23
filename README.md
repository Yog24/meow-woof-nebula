<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 喵汪星项目

逝宠怀念小程序原型，当前包含前端应用和独立后端服务。后端先隔离开发，测试稳定后再逐步接入前端。

View your app in AI Studio: https://ai.studio/apps/ebc148dd-5542-4f6a-ad44-a33a68d7073a

## Run Locally

**Prerequisites:** Node.js 23+ is recommended for the current SQLite backend.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` for local secrets. Do not commit this file.

   ```bash
   FAL_KEY=your-fal-key
   BACKEND_PORT=3100
   DATABASE_PATH=backend/data/petworld.sqlite
   ```

3. Run the isolated backend:

   ```bash
   npm run backend:dev
   ```

4. Run the frontend in another terminal:

   ```bash
   npm run dev
   ```

5. In the frontend AI settings panel, set the backend URL to:

   ```text
   http://127.0.0.1:3100
   ```

## Backend Status

The backend currently includes:

- User/auth session storage.
- SQLite persistence for users, auth sessions, image uploads, image tasks, and image results.
- Business modules for memorial pets, social, assets, AI gateway, image tasks, scheduling, and operations.
- Real FAL FLUX.2 edit image-task integration for converting up to 4 uploaded pet photos into cute 2D pixel art.
- CORS support for isolated frontend/backend local development.

SQLite database files are written under `backend/data/` by default and are ignored by Git.

## Frontend Integration

The frontend now calls the isolated backend for real-photo pixel avatar generation. When pet reference images are provided, the frontend uploads up to 4 images to `/api/v1/image-tasks/uploads`, creates a task through `/api/v1/image-tasks/tasks`, polls until completion, then uses the returned result image URL.

For now, all pet mood avatars reuse the same generated reference-based pixel portrait to avoid creating four paid image-generation tasks for one upload.

## Verification

```bash
npm run lint
npm run backend:test
```
