import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

export function requestId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    const id = incoming && incoming.length <= 128 ? incoming : uuidv4();
    req.requestId = id;
    res.setHeader('x-request-id', id);
    next();
  };
}
