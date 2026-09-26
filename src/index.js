#!/usr/bin/env node
'use strict';

const { Command } = require('commander');

const program = new Command();

program
    .name('i18n-replace')
    .description('i18n 资源管理系统（https://i18n.codeini.com）文件替换 CLI')
    .version(require('../package.json').version);

require('./commands/replace')(program);
require('./commands/preview')(program);
require('./commands/batch')(program);
require('./commands/profiles')(program);
require('./commands/download')(program);
require('./commands/project')(program);
require('./commands/resource')(program);

program.parse(process.argv);
