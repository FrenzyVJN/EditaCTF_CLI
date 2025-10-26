import { command, option, flag, positional, subcommands } from 'cmd-ts';
import { string, optional as optionalString } from 'cmd-ts/dist/esm/types';

type Command = typeof command extends (args: any) => any ? (args: any) => any : never;
type CommandFactory = (ctx: CliContext) => ReturnType<Command>;

export type CliContext = {
  doDate?: () => string;
  doLs: (target?: string) => string;
  doChallenge?: (id?: string, opts?: { hint?: boolean; submit?: string }) => Promise<string>;
  doChallenges?: (opts: { filter?: string; all?: boolean; help?: boolean; json?: boolean }) => string;
  doClear?: () => string;
  doCd?: (target?: string) => string;
  doCat?: (target?: string, opts?: { refresh?: boolean }) => Promise<string>;
  doExport?: () => string;
  doPwd?: () => string;
  doWhoami?: () => string;
  doOpen?: (target?: string) => Promise<string>;
  doRules?: () => Promise<string>;
  doLeaderboard?: (format?: string) => Promise<string>;
  doTeams?: (format?: string) => Promise<string>;
  doReload?: () => Promise<string>;
  doTeam?: (action?: string, a?: string, b?: string) => Promise<string>;
  doProfile?: (action?: string, ...rest: string[]) => Promise<string>;
  doAuth?: (action: string, a?: string, b?: string) => Promise<string>;
};

// Command Factories
const makeLsCommand: CommandFactory = function(ctx) {
  return command({
    name: 'ls',
    description: 'List directory contents',
    args: {
      path: positional({ type: optionalString(string), description: 'Path to list', displayName: 'path'}),
    },
    handler: function(args: { path?: string }) {
      return ctx.doLs(args.path);
    },
  });
};

const makeCdCommand: CommandFactory = function(ctx) {
  return command({
    name: 'cd',
    description: 'Change directory',
    args: {
      path: positional({ type: optionalString(string), description: 'Path to change to', displayName: 'path' }),
    },
    handler: function(args: { path?: string }) {
      if (!ctx.doCd) return 'cd: not implemented';
      return ctx.doCd(args.path);
    },
  });
};

const makeChallengeCommand: CommandFactory = function(ctx) {
  return command({
    name: 'challenge',
    description: 'Interact with challenges (get, submit, hint)',
    args: {
        hint: flag({ long: 'hint', short: 'h', description: 'Request a hint for the challenge' }),
        submit: option({ type: string, long: 'submit', short: 's', description: 'Submit a flag for the challenge' }),
        id: positional({ type: string, description: 'Challenge ID', displayName: 'id' }),
    },
    handler: async function(args: { id: string; hint: boolean; submit?: string }) {
      if (!ctx.doChallenge) return 'Challenge logic not implemented.';
      return await ctx.doChallenge(args.id, { hint: args.hint, submit: args.submit });
    },
  });
};

const makeChallengesCommand: CommandFactory = function(ctx) {
  return command({
    name: 'challenges',
    description: 'List challenges in table format. Filter by category/name/id.',
    args: {
      filter: option({ type: string, long: 'filter', short: 'f', description: 'Filter by category/id/name', defaultValue: () => '' }),
      all: flag({ long: 'all', description: 'List all challenges' }),
      json: flag({ long: 'json', description: 'Output as minified JSON' }),
      help: flag({ long: 'help', description: 'Show help text' }),
    },
    handler: function(args) {
      if (!ctx.doChallenges) return 'No challenges available.';
      return ctx.doChallenges({
        filter: args.filter,
        all: args.all,
        json: args.json,
        help: args.help,
      });
    },
  });
};

const makeClearCommand: CommandFactory = function(ctx) {
  return command({
    name: 'clear',
    description: 'Clear the terminal history',
    args: {},
    handler: function() {
      if (ctx.doClear) return ctx.doClear();
      return '';
    },
  });
};

const makeCatCommand: CommandFactory = function(ctx) {
  return command({
    name: 'cat',
    description: 'Display file contents',
    args: {
      path: positional({ type: optionalString(string), description: 'File to display', displayName: 'path' }),
      refresh: flag({ long: 'refresh', description: 'Force refresh file content' }),
    },
    handler: async function(args: { path?: string; refresh: boolean }) {
      if (!ctx.doCat) return 'cat: not implemented';
      return await ctx.doCat(args.path, { refresh: args.refresh });
    },
  });
};

const makeHelpCommand: CommandFactory = function(ctx) {
  return command({
    name: 'help',
    description: 'Show general help or command-specific details',
    args: {
      command: positional({ type: optionalString(string), description: 'Command to show help for', displayName: 'command' }),
    },
    handler: function(args: { command?: string }) {
      const topic = args.command?.trim();
      if (topic && topic.length > 0) {
        const detailed = formatCommandDetail(topic, ctx);
        return detailed ?? `No detailed help available for '${topic}'. Try 'help' for all commands.`;
      }
      return formatCommandList(ctx);
    },
  });
};

const makeExportCommand: CommandFactory = function(ctx) {
  return command({
    name: 'export',
    description: 'Export data (e.g. state)',
    args: {
      target: positional({ type: optionalString(string), description: 'Target to export', displayName: 'target' }),
    },
    handler: function(args: { target?: string }) {
      if (!ctx.doExport) return 'export: not implemented';
      if (args.target === 'state' || !args.target) return ctx.doExport();
      return "export: unknown target. Use 'export state'.";
    },
  });
};

const makeDateCommand: CommandFactory = function(ctx) {
  return command({
    name: 'date',
    description: 'Show current date and time',
    args: {},
    handler: function() {
      if (!ctx.doDate) return 'date: not implemented';
      return ctx.doDate();
    },
  });
};

const makePwdCommand: CommandFactory = function(ctx) {
  return command({
    name: 'pwd',
    description: 'Print working directory',
    args: {},
    handler: function() {
      if (!ctx.doPwd) return 'pwd: not implemented';
      return ctx.doPwd();
    },
  });
};

const makeWhoamiCommand: CommandFactory = function(ctx) {
  return command({
    name: 'whoami',
    description: 'Display current user identity',
    args: {},
    handler: function() {
      if (!ctx.doWhoami) return 'whoami: not implemented';
      return ctx.doWhoami();
    },
  });
};

const makeOpenCommand: CommandFactory = function(ctx) {
  return command({
    name: 'open',
    description: 'Open and display file contents',
    args: {
      path: positional({ type: optionalString(string), description: 'File to open', displayName: 'path' }),
    },
    handler: async function(args: { path?: string }) {
      if (!ctx.doOpen) return 'open: not implemented';
      return await ctx.doOpen(args.path);
    },
  });
};

const makeRulesCommand: CommandFactory = function(ctx) {
  return command({
    name: 'rules',
    description: 'Display CTF rules',
    args: {},
    handler: async function() {
      if (!ctx.doRules) return 'rules: not implemented';
      return await ctx.doRules();
    },
  });
};

const makeLeaderboardCommand: CommandFactory = function(ctx) {
  return command({
    name: 'leaderboard',
    description: 'Show leaderboard rankings',
    args: {
      json: flag({ long: 'json', description: 'Output as minified JSON' }),
    },
    handler: async function(args: { json: boolean }) {
      if (!ctx.doLeaderboard) return 'leaderboard: not implemented';
      return await ctx.doLeaderboard(args.json ? '--json' : undefined);
    },
  });
};

const makeTeamsCommand: CommandFactory = function(ctx) {
  return command({
    name: 'teams',
    description: 'List all teams',
    args: {
      json: flag({ long: 'json', description: 'Output as minified JSON' }),
    },
    handler: async function(args: { json: boolean }) {
      if (!ctx.doTeams) return 'teams: not implemented';
      return await ctx.doTeams(args.json ? '--json' : undefined);
    },
  });
};

const makeReloadCommand: CommandFactory = function(ctx) {
  return command({
    name: 'reload',
    description: 'Reload CTF data',
    args: {},
    handler: async function() {
      if (!ctx.doReload) return 'reload: not implemented';
      return await ctx.doReload();
    },
  });
};

const makeTeamCommand: CommandFactory = function(ctx) {
  const createCmd = command({
    name: 'create',
    description: 'Create and join a new team',
    args: {
      name: positional({ type: string, description: 'Team name', displayName: 'name' }),
      password: positional({ type: string, description: 'Team password', displayName: 'password' }),
    },
    handler: async function(args: { name: string; password: string }) {
      if (!ctx.doTeam) return 'team: not implemented';
      return await ctx.doTeam('create', args.name, args.password);
    },
  });

  const joinCmd = command({
    name: 'join',
    description: 'Join an existing team',
    args: {
      name: positional({ type: string, description: 'Team name', displayName: 'name' }),
      password: positional({ type: string, description: 'Team password', displayName: 'password' }),
    },
    handler: async function(args: { name: string; password: string }) {
      if (!ctx.doTeam) return 'team: not implemented';
      return await ctx.doTeam('join', args.name, args.password);
    },
  });

  const leaveCmd = command({
    name: 'leave',
    description: 'Leave current team',
    args: {},
    handler: async function() {
      if (!ctx.doTeam) return 'team: not implemented';
      return await ctx.doTeam('leave');
    },
  });

  const showCmd = command({
    name: 'show',
    description: 'Show current team info',
    args: {},
    handler: async function() {
      if (!ctx.doTeam) return 'team: not implemented';
      return await ctx.doTeam('show');
    },
  });

  return subcommands({
    name: 'team',
    description: 'Team management (create, join, leave, show)',
    cmds: { create: createCmd, join: joinCmd, leave: leaveCmd, show: showCmd },
  });
};

const makeProfileCommand: CommandFactory = function(ctx) {
  const showCmd = command({
    name: 'show',
    description: 'Show profile information',
    args: {},
    handler: async function() {
      if (!ctx.doProfile) return 'profile: not implemented';
      return await ctx.doProfile('show');
    },
  });

  const nameCmd = command({
    name: 'name',
    description: 'Set display name',
    args: {
      displayName: positional({ type: string, description: 'Your display name', displayName: 'display_name' }),
    },
    handler: async function(args: { displayName: string }) {
      if (!ctx.doProfile) return 'profile: not implemented';
      return await ctx.doProfile('name', args.displayName);
    },
  });

  return subcommands({
    name: 'profile',
    description: 'Manage user profile (show, name)',
    cmds: { show: showCmd, name: nameCmd },
  });
};

const makeAuthCommand: CommandFactory = function(ctx) {
  const registerCmd = command({
    name: 'register',
    description: 'Register a new account',
    args: {
      email: positional({ type: string, description: 'Email address', displayName: 'email' }),
      password: positional({ type: string, description: 'Password', displayName: 'password' }),
    },
    handler: async function(args: { email: string; password: string }) {
      if (!ctx.doAuth) return 'auth: not implemented';
      return await ctx.doAuth('register', args.email, args.password);
    },
  });

  const loginCmd = command({
    name: 'login',
    description: 'Login to your account',
    args: {
      email: positional({ type: string, description: 'Email address', displayName: 'email' }),
      password: positional({ type: string, description: 'Password', displayName: 'password' }),
    },
    handler: async function(args: { email: string; password: string }) {
      if (!ctx.doAuth) return 'auth: not implemented';
      return await ctx.doAuth('login', args.email, args.password);
    },
  });

  const logoutCmd = command({
    name: 'logout',
    description: 'Logout from your account',
    args: {},
    handler: async function() {
      if (!ctx.doAuth) return 'auth: not implemented';
      return await ctx.doAuth('logout');
    },
  });

  const meCmd = command({
    name: 'me',
    description: 'Show current user info',
    args: {},
    handler: async function() {
      if (!ctx.doAuth) return 'auth: not implemented';
      return await ctx.doAuth('me');
    },
  });

  return subcommands({
    name: 'auth',
    description: 'Authentication (register, login, logout, me)',
    cmds: { register: registerCmd, login: loginCmd, logout: logoutCmd, me: meCmd },
  });
};

// Command Map
const commandMap: Record<string, CommandFactory> = {
  date: makeDateCommand,
  help: makeHelpCommand,
  ls: makeLsCommand,
  cd: makeCdCommand,
  cat: makeCatCommand,
  export: makeExportCommand,
  challenge: makeChallengeCommand,
  challenges: makeChallengesCommand,
  clear: makeClearCommand,
  pwd: makePwdCommand,
  whoami: makeWhoamiCommand,
  open: makeOpenCommand,
  rules: makeRulesCommand,
  leaderboard: makeLeaderboardCommand,
  teams: makeTeamsCommand,
  reload: makeReloadCommand,
  team: makeTeamCommand,
  profile: makeProfileCommand,
  auth: makeAuthCommand,
};

// Export list of available commands
export const COMMANDS = Object.keys(commandMap);

function formatCommandList(ctx: CliContext): string {
  const entries = Object.entries(commandMap).map(([name, factory]) => {
    const cmd = factory(ctx) as any;
    const description = typeof cmd?.description === 'string' ? stripAnsi(cmd.description) : '';
    return { name: cmd?.name ?? name, description };
  });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const widest = entries.reduce((len, entry) => Math.max(len, entry.name.length), 0);
  const lines: string[] = ['Available commands:', ''];
  for (const entry of entries) {
    const desc = entry.description || 'No description available.';
    lines.push(`  ${entry.name.padEnd(widest)}  ${desc}`);
  }
  lines.push('', "Use 'help <command>' for detailed info.");
  return lines.join('\n');
}

function formatCommandDetail(commandName: string, ctx: CliContext): string | null {
  const normalized = commandName in commandMap ? commandName : commandName.toLowerCase();
  const factory = commandMap[normalized];
  if (!factory) return null;
  const cmd = factory(ctx) as any;
  const displayName = cmd?.name ?? normalized;
  const description = typeof cmd?.description === 'string' ? stripAnsi(cmd.description) : '';
  const lines: string[] = [displayName];
  if (description) lines.push(description);

  const topics = typeof cmd?.helpTopics === 'function' ? cmd.helpTopics() : [];
  if (Array.isArray(topics) && topics.length > 0) {
    const categoryOrder: string[] = [];
    const grouped: Record<string, any[]> = {};
    for (const topic of topics) {
      if (!topic) continue;
      const category = typeof topic.category === 'string' && topic.category.length > 0 ? topic.category : 'usage';
      if (!grouped[category]) {
        grouped[category] = [];
        categoryOrder.push(category);
      }
      grouped[category].push(topic);
    }
    for (const category of categoryOrder) {
      const items = grouped[category];
      if (!items || items.length === 0) continue;
      const widest = items.reduce((len, item) => {
        const usage = typeof item?.usage === 'string' ? item.usage : '';
        return Math.max(len, usage.length);
      }, 0);
      lines.push('', `${category.toUpperCase()}:`);
      for (const item of items) {
        if (!item) continue;
        const usage = typeof item.usage === 'string' ? item.usage : '';
        const desc = typeof item.description === 'string' ? stripAnsi(item.description) : '';
        // Skip the auto-generated help flag
        if (usage.includes('--help') && desc.toLowerCase().includes('show help')) continue;
        const defaults = Array.isArray(item.defaults) ? item.defaults.map((d: string) => stripAnsi(String(d))).filter(Boolean) : [];
        const suffix = defaults.length > 0 ? ` (${defaults.join(', ')})` : '';
        lines.push(`  ${usage.padEnd(widest)}  ${desc}${suffix}`.trimEnd());
      }
    }
  }

  lines.push('', "Use 'help' to list all commands.");
  return lines.join('\n');
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

// CLI Runner
export async function runCli(raw: string, ctx: CliContext): Promise<string> {
  const parts = raw.trim().split(/\s+/);
  const cmdName = parts[0];
  const args = parts.slice(1);
  const factory = commandMap[cmdName];
  if (!factory) return `${cmdName}: command not found`;
  const cmd = factory(ctx);

  let argObj: any = {};
  if (cmdName === 'ls') {
    argObj = { path: args[0] || undefined };
  } else if (cmdName === 'cd') {
    argObj = { path: args[0] || undefined };
  } else if (cmdName === 'cat') {
    argObj = {
      path: args[0] || undefined,
      refresh: args.includes('--refresh'),
    };
  } else if (cmdName === 'help') {
    argObj = { command: args[0] || undefined };
  } else if (cmdName === 'export') {
    argObj = { target: args[0] || undefined };
  } else if (cmdName === 'date') {
    argObj = {};
  } else if (cmdName === 'challenge') {
    // Filter out flags to get the challenge ID
    const challengeId = args.find((a) => !a.startsWith('-'));
    // Check for -s flag with value: -s editaCTF{...} or --submit=editaCTF{...}
    let submitValue: string | undefined;
    const submitFlagIndex = args.findIndex((a) => a === '-s' || a === '--submit');
    if (submitFlagIndex !== -1 && args[submitFlagIndex + 1] && !args[submitFlagIndex + 1].startsWith('-')) {
      submitValue = args[submitFlagIndex + 1];
    } else {
      submitValue = args.find((a) => a.startsWith('--submit='))?.split('=')[1];
    }
    argObj = {
      id: challengeId,
      hint: args.includes('--hint') || args.includes('-i'),
      submit: submitValue,
    };
  } else if (cmdName === 'challenges') {
    argObj = {
      filter: args.find((a) => !a.startsWith('--')) || '',
      all: args.includes('--all'),
      json: args.includes('--json'),
      help: args.includes('--help'),
    };
  } else if (cmdName === 'pwd') {
    argObj = {};
  } else if (cmdName === 'whoami') {
    argObj = {};
  } else if (cmdName === 'open') {
    argObj = { path: args[0] || undefined };
  } else if (cmdName === 'rules') {
    argObj = {};
  } else if (cmdName === 'leaderboard') {
    argObj = {
      json: args.includes('--json'),
    };
  } else if (cmdName === 'teams') {
    argObj = {
      json: args.includes('--json'),
    };
  } else if (cmdName === 'reload') {
    argObj = {};
  } else if (cmdName === 'team') {
    // Subcommand: team <subcommand> [args]
    const subCmd = args[0];
    if (subCmd === 'create') {
      argObj = { command: 'create', args: { name: args[1], password: args[2] } };
    } else if (subCmd === 'join') {
      argObj = { command: 'join', args: { name: args[1], password: args[2] } };
    } else if (subCmd === 'leave') {
      argObj = { command: 'leave', args: {} };
    } else if (subCmd === 'show') {
      argObj = { command: 'show', args: {} };
    } else {
      return `team: unknown subcommand '${subCmd}'. Use: create, join, leave, show`;
    }
  } else if (cmdName === 'profile') {
    // Subcommand: profile <subcommand> [args]
    const subCmd = args[0];
    if (subCmd === 'show' || !subCmd) {
      argObj = { command: 'show', args: {} };
    } else if (subCmd === 'name') {
      // Join remaining args as display name (supports spaces)
      const displayName = args.slice(1).join(' ');
      argObj = { command: 'name', args: { displayName } };
    } else {
      return `profile: unknown subcommand '${subCmd}'. Use: show, name`;
    }
  } else if (cmdName === 'auth') {
    // Subcommand: auth <subcommand> [args]
    const subCmd = args[0];
    if (subCmd === 'register') {
      argObj = { command: 'register', args: { email: args[1], password: args[2] } };
    } else if (subCmd === 'login') {
      argObj = { command: 'login', args: { email: args[1], password: args[2] } };
    } else if (subCmd === 'logout') {
      argObj = { command: 'logout', args: {} };
    } else if (subCmd === 'me') {
      argObj = { command: 'me', args: {} };
    } else {
      return `auth: unknown subcommand '${subCmd}'. Use: register, login, logout, me`;
    }
  }
  
  const result = await cmd.handler(argObj);
  // For subcommands, result might be { command, value }
  if (result && typeof result === 'object' && 'value' in result) {
    return (result as any).value ?? '';
  }
  return result ?? '';
}
