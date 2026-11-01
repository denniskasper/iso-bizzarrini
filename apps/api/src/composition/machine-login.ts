import type { AppConfig } from '../config/config.js';
import { machineLoginAvailable } from '../platform/claude-code.js';

/**
 * **Whether this machine's own Claude Code login is there** (issues #156, #151), asked once at
 * startup for whichever of catalog reading and Proposals' conversation would run on it. Not asked
 * where neither would: Production has no conversation, the fake one needs nothing, and a server
 * has refused a subscription Reading method before this is reached.
 */
export async function findMachineLogin(
  config: Pick<AppConfig, 'environmentMode' | 'proposals' | 'reading'>,
): Promise<boolean> {
  const reading = config.reading.method === 'subscription';
  const conversation =
    config.environmentMode !== 'production' && config.proposals.method !== 'fake';
  return (reading || conversation) && machineLoginAvailable();
}
