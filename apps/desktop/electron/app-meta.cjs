const pkg = require('../package.json')

const APP_NAME = 'Opptrix'
const APP_TITLE = 'Opptrix · 你的A股投研助手'
const AUTHOR_NAME = '催书书'
const AUTHOR_EMAIL = 'imsorich@foxmail.com'
const GITHUB_HOME = 'https://github.com/Travisun/Opptrix'
const GITHUB_ISSUES = 'https://github.com/Travisun/Opptrix/issues'
const COPYRIGHT = `Copyright © 2026 ${AUTHOR_NAME}`
const VERSION = pkg.version

module.exports = {
  APP_NAME,
  APP_TITLE,
  AUTHOR_NAME,
  AUTHOR_EMAIL,
  GITHUB_HOME,
  GITHUB_ISSUES,
  COPYRIGHT,
  VERSION,
}
