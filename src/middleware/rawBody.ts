// middleware/rawBody.ts
export const rawBodyBuffer = (req: Request, res: Response, buf: Buffer) => {
  if (buf && buf.length) {
    (req as any).rawBody = buf.toString("utf8");
  }
};