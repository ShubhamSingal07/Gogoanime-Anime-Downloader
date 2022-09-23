const yargs = require('yargs');

let obj = yargs
  .usage('node data_sr/cmd <command> [options]')
  .alias('h', 'help')
  .commandDir('commands')
  .version(false);

obj.demandCommand(1, 1).recommendCommands().help().argv;
