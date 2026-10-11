import type { EnvironmentMode, ServiceStatus } from '@ricambi/contracts';
import type { Build } from '../platform/build.js';
import type { Clock } from '../platform/clock.js';
import type { SystemRepository } from '../repositories/system-repository.js';

export interface StatusService {
  read(): Promise<ServiceStatus>;
}

export function createStatusService(dependencies: {
  clock: Clock;
  build: Build;
  environmentName: string;
  environmentMode: EnvironmentMode;
  systemRepository: SystemRepository;
}): StatusService {
  const { clock, build, environmentName, environmentMode, systemRepository } = dependencies;

  return {
    async read() {
      const reachable = await systemRepository.isDatabaseReachable();

      return {
        status: reachable ? 'ok' : 'degraded',
        version: build.version,
        commit: build.commit,
        environment: environmentName,
        mode: environmentMode,
        time: clock.now().toISOString(),
        database: reachable ? 'reachable' : 'unreachable',
      };
    },
  };
}
