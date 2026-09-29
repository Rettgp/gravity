/**
 * Manage who can enter Gravity. Usage:
 *   npm run allowlist -- list
 *   npm run allowlist -- add someone@gmail.com
 *   npm run allowlist -- remove someone@gmail.com
 * Updates SSM Parameter Store directly, so it takes effect immediately (no redeploy).
 * Removed people lose API access at once and cannot get new tokens; existing 1-hour tokens expire on their own.
 */
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const NAME = '/gravity/allowed-emails';
const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-2' });

const read = async () => {
  const r = await ssm.send(new GetParameterCommand({ Name: NAME }));
  return (r.Parameter?.Value ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
};

const [cmd, raw] = process.argv.slice(2);
const email = raw?.trim().toLowerCase();
const list = await read();

if (cmd === 'list' || !cmd) {
  console.log(list.join('\n') || '(empty)');
} else if ((cmd === 'add' || cmd === 'remove') && email && /^\S+@\S+\.\S+$/.test(email)) {
  const next = cmd === 'add' ? [...new Set([...list, email])] : list.filter((e) => e !== email);
  if (next.length === 0) throw new Error('Refusing to empty the allowlist.');
  await ssm.send(new PutParameterCommand({ Name: NAME, Value: next.join(','), Type: 'String', Overwrite: true }));
  console.log((cmd === 'add' ? 'Added ' : 'Removed ') + email + '. Allowed now: ' + next.join(', '));
  console.log('Also update ALLOWED_EMAILS in .env.local so the next deploy does not revert this.');
} else {
  console.error('Usage: npm run allowlist -- list | add <email> | remove <email>');
  process.exit(1);
}
