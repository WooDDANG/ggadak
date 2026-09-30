import { IocContainer, ServiceIdentifier } from '@tsoa/runtime';
import { Container } from 'typedi';

export const iocContainer: IocContainer = {
  get: <T>(controller: ServiceIdentifier<T>): T => {
    return Container.get<T>(controller as any);
  },
};
