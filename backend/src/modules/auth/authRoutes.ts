import { Request, Response, Router } from "express";
import { AuthService } from "./authService";

const BEARER_PREFIX = "Bearer ";

function readBearerToken(req: Request): string {
  const header = req.header("authorization") || "";
  if (!header.startsWith(BEARER_PREFIX)) return "";
  return header.slice(BEARER_PREFIX.length).trim();
}

function respondBadRequest(res: Response, message: string): Response {
  return res.status(400).json({
    error: {
      code: "BAD_REQUEST",
      message,
    },
  });
}

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post("/wechat-login", (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code.trim()) {
      return respondBadRequest(res, "code is required");
    }

    const nickName =
      typeof req.body?.profile?.nickName === "string"
        ? req.body.profile.nickName
        : undefined;
    const avatarUrl =
      typeof req.body?.profile?.avatarUrl === "string"
        ? req.body.profile.avatarUrl
        : undefined;

    const result = authService.loginByWeChatCode(code, { nickName, avatarUrl });

    return res.status(200).json({
      user: result.user,
      token: {
        accessToken: result.session.accessToken,
        refreshToken: result.session.refreshToken,
        expiresIn: 2 * 60 * 60,
      },
    });
  });

  router.post("/refresh", (req, res) => {
    const refreshToken =
      typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
    if (!refreshToken.trim()) {
      return respondBadRequest(res, "refreshToken is required");
    }

    const result = authService.refresh(refreshToken);
    if (!result) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "invalid or expired refresh token",
        },
      });
    }

    return res.status(200).json({
      user: result.user,
      token: {
        accessToken: result.session.accessToken,
        refreshToken: result.session.refreshToken,
        expiresIn: 2 * 60 * 60,
      },
    });
  });

  router.get("/me", (req, res) => {
    const accessToken = readBearerToken(req);
    if (!accessToken) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "access token is missing",
        },
      });
    }

    const user = authService.getUserByAccessToken(accessToken);
    if (!user) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "invalid or expired access token",
        },
      });
    }

    return res.status(200).json({ user });
  });

  router.post("/logout", (req, res) => {
    const accessToken = readBearerToken(req);
    if (!accessToken) {
      return res.status(204).send();
    }
    authService.logout(accessToken);
    return res.status(204).send();
  });

  return router;
}
