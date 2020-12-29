import { Metadata, ServiceError as grpcServiceError, status } from '@grpc/grpc-js';

/**
 * https://grpc.io/grpc/node/grpc.html#~ServiceError__anchor
 */
// eslint-disable-next-line import/prefer-default-export
export class ServiceError extends Error implements Partial<grpcServiceError> {
  public name = 'ServiceError';

  constructor(public code: status, public message: string, public details?: string, public metadata?: Metadata) {
    super(message);
  }
}
