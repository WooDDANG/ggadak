import type { IocContainer, ServiceIdentifier } from '@tsoa/runtime';
import type { Request } from 'express';
export function iocContainer(request: Request): IocContainer {
  return {
    get: <T>(controller: ServiceIdentifier<T>): T => request.app.locals.container.get(controller),
  };
}
